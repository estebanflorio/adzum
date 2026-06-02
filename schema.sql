-- ============================================================
--  ASISTENCIA ESCOLAR — Schema v1.0
--  Compatible con Supabase (PostgreSQL 15+)
--  Ejecutar en orden: habilitar UUID, crear tablas, índices, RLS
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ESCUELAS
-- ============================================================
CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT NOT NULL,
  cue           TEXT UNIQUE,                         -- Código único de establecimiento
  direccion     TEXT,
  turno         TEXT CHECK (turno IN ('mañana', 'tarde', 'noche', 'completo')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. CICLOS LECTIVOS
-- ============================================================
CREATE TABLE school_years (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  anio          INT NOT NULL CHECK (anio >= 2000),
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (school_id, anio)
);

-- Solo un ciclo activo por escuela
CREATE UNIQUE INDEX one_active_year_per_school
  ON school_years (school_id)
  WHERE activo = TRUE;

-- ============================================================
-- 3. GRADOS
-- ============================================================
CREATE TABLE grades (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,                       -- '1°', '2°'... '7°'
  nivel         TEXT NOT NULL CHECK (nivel IN ('primario', 'secundario', 'inicial')),
  orden         INT NOT NULL,                        -- para ordenar en UI
  UNIQUE (school_id, nombre, nivel)
);

-- ============================================================
-- 4. DIVISIONES (grado + año + letra)
-- ============================================================
CREATE TABLE divisions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id        UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  school_year_id  UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL CHECK (nombre IN ('A', 'B', 'C', 'D', 'E')),
  turno           TEXT CHECK (turno IN ('mañana', 'tarde')),
  UNIQUE (grade_id, school_year_id, nombre)
);

-- ============================================================
-- 5. USUARIOS DEL SISTEMA
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- sincronizado con auth.users de Supabase
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  apellido      TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  rol           TEXT NOT NULL CHECK (rol IN ('director', 'preceptor', 'docente', 'admin')),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. ALUMNOS
-- ============================================================
CREATE TABLE students (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  apellido        TEXT NOT NULL,
  dni             TEXT,
  fecha_nacimiento DATE,
  legajo_nro      TEXT,
  UNIQUE (school_id, dni)
);

-- ============================================================
-- 7. INSCRIPCIONES (alumno ↔ división por ciclo)
-- ============================================================
CREATE TABLE enrollments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  division_id     UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  school_year_id  UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  fecha_inscripcion DATE NOT NULL DEFAULT CURRENT_DATE,
  estado          TEXT NOT NULL DEFAULT 'activo'
                  CHECK (estado IN ('activo', 'egresado', 'transferido', 'repitente')),
  UNIQUE (student_id, school_year_id)               -- un alumno, un grado por año
);

-- ============================================================
-- 8. ASISTENCIAS
-- ============================================================
CREATE TABLE attendance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id   UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  registrado_por  UUID NOT NULL REFERENCES users(id),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  estado          TEXT NOT NULL DEFAULT 'presente'
                  CHECK (estado IN ('presente', 'ausente', 'tardanza', 'justificado')),
  observacion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, fecha)                     -- una asistencia por alumno por día
);

-- ============================================================
-- ÍNDICES para queries frecuentes
-- ============================================================
CREATE INDEX idx_attendance_fecha         ON attendance (fecha);
CREATE INDEX idx_attendance_estado        ON attendance (estado);
CREATE INDEX idx_attendance_enrollment    ON attendance (enrollment_id);
CREATE INDEX idx_enrollments_division     ON enrollments (division_id);
CREATE INDEX idx_enrollments_student      ON enrollments (student_id);
CREATE INDEX idx_students_school          ON students (school_id);
CREATE INDEX idx_divisions_school_year    ON divisions (school_year_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — base para Supabase
-- ============================================================
ALTER TABLE schools     ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance  ENABLE ROW LEVEL SECURITY;

-- Política base: cada usuario solo ve datos de su escuela
CREATE POLICY "users_own_school" ON users
  FOR ALL USING (school_id = (
    SELECT school_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "students_own_school" ON students
  FOR ALL USING (school_id = (
    SELECT school_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "attendance_own_school" ON attendance
  FOR ALL USING (
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      JOIN divisions d ON d.id = e.division_id
      JOIN grades g ON g.id = d.grade_id
      WHERE g.school_id = (
        SELECT school_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- ============================================================
-- DATOS INICIALES (demo — 1 escuela, ciclo 2025, grados 1° a 7°)
-- ============================================================
DO $$
DECLARE
  school_uuid   UUID := uuid_generate_v4();
  year_uuid     UUID := uuid_generate_v4();
BEGIN
  INSERT INTO schools (id, nombre, cue, direccion, turno)
  VALUES (school_uuid, 'Escuela N° 42', '060042-00', 'Av. San Martín 100', 'mañana');

  INSERT INTO school_years (id, school_id, anio, fecha_inicio, fecha_fin, activo)
  VALUES (year_uuid, school_uuid, 2025, '2025-03-03', '2025-12-12', TRUE);

  INSERT INTO grades (school_id, nombre, nivel, orden) VALUES
    (school_uuid, '1°', 'primario', 1),
    (school_uuid, '2°', 'primario', 2),
    (school_uuid, '3°', 'primario', 3),
    (school_uuid, '4°', 'primario', 4),
    (school_uuid, '5°', 'primario', 5),
    (school_uuid, '6°', 'primario', 6),
    (school_uuid, '7°', 'primario', 7);
END $$;

-- ============================================================
-- VISTA ÚTIL: asistencia por división en una fecha
-- ============================================================
CREATE OR REPLACE VIEW v_attendance_daily AS
SELECT
  s.nombre        AS escuela,
  sy.anio         AS ciclo,
  g.nombre        AS grado,
  d.nombre        AS division,
  st.apellido     || ', ' || st.nombre AS alumno,
  a.fecha,
  a.estado,
  a.observacion,
  u.nombre        AS registrado_por
FROM attendance a
JOIN enrollments e  ON e.id = a.enrollment_id
JOIN students st    ON st.id = e.student_id
JOIN divisions d    ON d.id = e.division_id
JOIN grades g       ON g.id = d.grade_id
JOIN school_years sy ON sy.id = d.school_year_id
JOIN schools s      ON s.id = g.school_id
JOIN users u        ON u.id = a.registrado_por;
