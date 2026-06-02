import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { getActiveSchoolYear, getGrades, getDivisions } from '../services/divisionsService'
import type { Grade, Division } from '../lib/supabase'

interface Props { onBack: () => void }

interface CSVRow {
  nombre: string
  apellido: string
  dni: string
  fecha_nacimiento: string
  legajo_nro: string
  _error?: string
}

interface ImportResult {
  ok: number
  errors: { fila: number; nombre: string; motivo: string }[]
}

const COLUMNAS = ['apellido', 'nombre', 'dni', 'fecha_nacimiento', 'legajo_nro']
const PLANTILLA_HEADER = 'apellido,nombre,dni,fecha_nacimiento,legajo_nro'
const PLANTILLA_EJEMPLO = [
  'García,Sofía,50123456,2021-03-15,2025-001',
  'López,Mateo,50234567,2020-11-08,2025-002',
  'Martínez,Valentina,,2021-07-22,',
].join('\n')

type Step = 'config' | 'preview' | 'result'

export default function ImportStudents({ onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]               = useState<Step>('config')
  const [grades, setGrades]           = useState<Grade[]>([])
  const [divisions, setDivisions]     = useState<Division[]>([])
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null)
  const [selectedDiv, setSelectedDiv] = useState<Division | null>(null)
  const [schoolId, setSchoolId]       = useState('')
  const [schoolYearId, setSchoolYearId] = useState('')

  const [rows, setRows]               = useState<CSVRow[]>([])
  const [fileName, setFileName]       = useState('')
  const [parseError, setParseError]   = useState<string | null>(null)
  const [importing, setImporting]     = useState(false)
  const [progress, setProgress]       = useState(0)
  const [result, setResult]           = useState<ImportResult | null>(null)

  // ── Init ──
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('school_id').eq('id', user.id).single()
      if (!profile) return
      setSchoolId(profile.school_id)
      const sy = await getActiveSchoolYear(profile.school_id)
      if (!sy) return
      setSchoolYearId(sy.id)
      const gradeList = await getGrades(profile.school_id)
      setGrades(gradeList)
      if (gradeList.length > 0) {
        setSelectedGrade(gradeList[0])
        const divList = await getDivisions(gradeList[0].id, sy.id)
        setDivisions(divList)
        if (divList.length > 0) setSelectedDiv(divList[0])
      }
    }
    init()
  }, [])

  async function handleGradeChange(grade: Grade) {
    setSelectedGrade(grade)
    const divList = await getDivisions(grade.id, schoolYearId)
    setDivisions(divList)
    if (divList.length > 0) setSelectedDiv(divList[0])
  }

  // ── Descargar plantilla ──
  function downloadTemplate() {
    const content = `${PLANTILLA_HEADER}\n${PLANTILLA_EJEMPLO}`
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_alumnos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Parsear CSV ──
  function parseCSV(text: string): CSVRow[] {
    const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''))
    if (lines.length < 2) return []

    // Detectar si primera línea es header
    const firstLine = lines[0].toLowerCase()
    const hasHeader = COLUMNAS.some(c => firstLine.includes(c))
    const dataLines = hasHeader ? lines.slice(1) : lines

    return dataLines.filter(l => l.trim()).map(line => {
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
      const [apellido = '', nombre = '', dni = '', fecha_nacimiento = '', legajo_nro = ''] = parts

      const row: CSVRow = { apellido, nombre, dni, fecha_nacimiento, legajo_nro }

      if (!apellido || !nombre) row._error = 'Nombre y apellido son obligatorios'
      if (fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento))
        row._error = 'Fecha debe ser AAAA-MM-DD'

      return row
    })
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        setParseError('El archivo está vacío o no tiene el formato correcto.')
        return
      }
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Importar ──
  async function handleImport() {
    if (!selectedDiv) return
    setImporting(true)
    setProgress(0)

    const ok: number[] = []
    const errors: ImportResult['errors'] = []
    const validRows = rows.filter(r => !r._error)

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        // Crear alumno
        const { data: student, error: sErr } = await supabase
          .from('students')
          .insert({
            school_id:        schoolId,
            nombre:           row.nombre,
            apellido:         row.apellido,
            dni:              row.dni || null,
            fecha_nacimiento: row.fecha_nacimiento || null,
            legajo_nro:       row.legajo_nro || null,
          })
          .select('id')
          .single()

        if (sErr) throw new Error(sErr.message)

        // Inscribir
        const { error: eErr } = await supabase
          .from('enrollments')
          .insert({
            student_id:     student.id,
            division_id:    selectedDiv.id,
            school_year_id: schoolYearId,
          })

        if (eErr) throw new Error(eErr.message)
        ok.push(i)
      } catch (err: any) {
        errors.push({
          fila:   i + 2,
          nombre: `${row.apellido}, ${row.nombre}`,
          motivo: err.message?.includes('unique') ? 'Ya existe en este ciclo' : err.message,
        })
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setResult({ ok: ok.length, errors })
    setImporting(false)
    setStep('result')
  }

  // ── Estilos base ──
  const inp: React.CSSProperties = {
    padding: '9px 12px', fontSize: 13, borderRadius: 8,
    border: `1px solid ${t.inputBorder}`, background: t.inputBg,
    color: t.textPrimary, outline: 'none', fontFamily: 'DM Sans', boxSizing: 'border-box' as const,
  }
  const btnP: React.CSSProperties = {
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: t.green, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans',
  }
  const btnS: React.CSSProperties = {
    padding: '9px 20px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans',
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, color: t.textMuted, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', marginBottom: 6, display: 'block', fontFamily: 'DM Mono',
  }

  const validRows   = rows.filter(r => !r._error)
  const invalidRows = rows.filter(r => r._error)

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
          <span style={{ fontSize: 20, color: t.textMuted, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, letterSpacing: '0.02em' }}>
            Importar alumnos
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={onBack} style={btnS}>← Volver</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          {[
            { n: 1, label: 'Configurar' },
            { n: 2, label: 'Preview' },
            { n: 3, label: 'Resultado' },
          ].map((s, i) => {
            const stepNum = step === 'config' ? 1 : step === 'preview' ? 2 : 3
            const done    = stepNum > s.n
            const active  = stepNum === s.n
            return (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'DM Mono', background: done ? t.green : active ? t.greenBg : t.border, color: done ? '#fff' : active ? t.green : t.textMuted, border: `1px solid ${active ? t.green : 'transparent'}` }}>
                    {done ? '✓' : s.n}
                  </div>
                  <span style={{ fontSize: 12, color: active ? t.textPrimary : t.textMuted }}>{s.label}</span>
                </div>
                {i < 2 && <div style={{ width: 32, height: 1, background: t.border }} />}
              </div>
            )
          })}
        </div>

        {/* ── PASO 1: CONFIG ── */}
        {step === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Sala y turno */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 16px', color: t.textPrimary }}>¿A qué sala y turno pertenecen estos alumnos?</p>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Sala</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {grades.map(g => (
                    <button key={g.id} onClick={() => handleGradeChange(g)}
                      style={{ padding: '6px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedGrade?.id === g.id ? t.green : t.border}`, background: selectedGrade?.id === g.id ? t.greenBg : 'transparent', color: selectedGrade?.id === g.id ? t.green : t.textMuted }}>
                      {g.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Turno / División</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {divisions.map(d => (
                    <button key={d.id} onClick={() => setSelectedDiv(d)}
                      style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedDiv?.id === d.id ? t.blue : t.border}`, background: selectedDiv?.id === d.id ? t.blueBg : 'transparent', color: selectedDiv?.id === d.id ? t.blue : t.textMuted }}>
                      {d.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Plantilla */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px', color: t.textPrimary }}>Paso 1 — Descargá la plantilla</p>
              <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 14px' }}>Completala en Excel y guardala como CSV (UTF-8). Solo nombre y apellido son obligatorios.</p>
              <div style={{ background: t.bg, borderRadius: 8, padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 11, color: t.textMuted, marginBottom: 14, overflowX: 'auto' }}>
                <div style={{ color: t.green, marginBottom: 4 }}>apellido, nombre, dni, fecha_nacimiento, legajo_nro</div>
                <div>García, Sofía, 50123456, 2021-03-15, 2025-001</div>
                <div>López, Mateo, 50234567, 2020-11-08, 2025-002</div>
                <div style={{ color: t.textMuted }}>Martínez, Valentina, , 2021-07-22, <span style={{ color: t.amber }}>← dni y legajo opcionales</span></div>
              </div>
              <button onClick={downloadTemplate} style={{ ...btnS, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⬇ Descargar plantilla.csv
              </button>
            </div>

            {/* Upload */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px', color: t.textPrimary }}>Paso 2 — Subí el CSV completado</p>
              <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 14px' }}>El archivo debe estar en formato CSV. También funciona si lo exportás directamente desde Excel.</p>

              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()}
                style={{ ...btnP, display: 'flex', alignItems: 'center', gap: 8 }}>
                📂 Seleccionar archivo CSV
              </button>
              {fileName && <p style={{ fontSize: 12, color: t.textMuted, margin: '10px 0 0', fontFamily: 'DM Mono' }}>📄 {fileName}</p>}
              {parseError && <p style={{ fontSize: 12, color: t.red, background: t.redBg, padding: '8px 12px', borderRadius: 6, margin: '10px 0 0' }}>{parseError}</p>}
            </div>
          </div>
        )}

        {/* ── PASO 2: PREVIEW ── */}
        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Total filas', value: rows.length, color: t.textPrimary },
                { label: 'Válidos', value: validRows.length, color: t.green },
                { label: 'Con errores', value: invalidRows.length, color: invalidRows.length > 0 ? t.red : t.textMuted },
              ].map(s => (
                <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono' }}>{s.label}</p>
                  <p style={{ margin: 0, fontSize: 26, fontWeight: 500, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Destino */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: t.textMuted }}>Sala destino:</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: t.textPrimary }}>{selectedGrade?.nombre} — Div. {selectedDiv?.nombre}</span>
            </div>

            {/* Errores */}
            {invalidRows.length > 0 && (
              <div style={{ background: t.redBg, border: `1px solid ${t.red}30`, borderRadius: 10, padding: '12px 16px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: t.red, fontWeight: 500 }}>⚠ Estas filas serán saltadas:</p>
                {invalidRows.map((r, i) => (
                  <p key={i} style={{ margin: '2px 0', fontSize: 12, color: t.red, fontFamily: 'DM Mono' }}>
                    {r.apellido || '?'}, {r.nombre || '?'} — {r._error}
                  </p>
                ))}
              </div>
            )}

            {/* Tabla preview */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${t.border}`, display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1fr', gap: 8 }}>
                {['Apellido', 'Nombre', 'DNI', 'Nacimiento', 'Legajo'].map(h => (
                  <span key={h} style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono' }}>{h}</span>
                ))}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {rows.map((r, i) => (
                  <div key={i} style={{ padding: '9px 16px', borderBottom: `1px solid ${t.border}`, display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1fr', gap: 8, background: r._error ? t.redBg : 'transparent', opacity: r._error ? 0.7 : 1 }}>
                    <span style={{ fontSize: 13, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.apellido}</span>
                    <span style={{ fontSize: 13, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</span>
                    <span style={{ fontSize: 12, color: t.textMuted, fontFamily: 'DM Mono' }}>{r.dni || '—'}</span>
                    <span style={{ fontSize: 12, color: t.textMuted, fontFamily: 'DM Mono' }}>{r.fecha_nacimiento || '—'}</span>
                    <span style={{ fontSize: 12, color: t.textMuted, fontFamily: 'DM Mono' }}>{r.legajo_nro || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Barra de progreso durante import */}
            {importing && (
              <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: t.textMuted }}>Importando alumnos...</span>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: t.green }}>{progress}%</span>
                </div>
                <div style={{ height: 6, background: t.border, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: t.green, borderRadius: 4, transition: 'width 0.2s' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <button onClick={() => { setStep('config'); setRows([]); setFileName('') }} style={btnS}>← Volver</button>
              <button onClick={handleImport} disabled={importing || validRows.length === 0}
                style={{ ...btnP, opacity: importing || validRows.length === 0 ? 0.5 : 1 }}>
                {importing ? 'Importando...' : `Importar ${validRows.length} alumno${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3: RESULTADO ── */}
        {step === 'result' && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: t.greenBg, border: `1px solid ${t.green}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>
                {result.errors.length === 0 ? '✓' : '⚠'}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 300, margin: '0 0 6px' }}>
                {result.ok} alumno{result.ok !== 1 ? 's' : ''} importado{result.ok !== 1 ? 's' : ''}
              </h2>
              <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>
                en {selectedGrade?.nombre} — Div. {selectedDiv?.nombre}
              </p>
            </div>

            {result.errors.length > 0 && (
              <div style={{ background: t.redBg, border: `1px solid ${t.red}30`, borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: t.red, fontWeight: 500 }}>No se pudieron importar {result.errors.length} fila{result.errors.length !== 1 ? 's' : ''}:</p>
                {result.errors.map((e, i) => (
                  <p key={i} style={{ margin: '3px 0', fontSize: 12, color: t.red, fontFamily: 'DM Mono' }}>
                    Fila {e.fila} — {e.nombre}: {e.motivo}
                  </p>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { setStep('config'); setRows([]); setFileName(''); setResult(null) }} style={btnS}>
                Importar otra sala
              </button>
              <button onClick={onBack} style={btnP}>Volver al dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
