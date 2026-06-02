interface Props {
  size?: number
  showTagline?: boolean
}

export default function AdzumLogo({ size = 22, showTagline = false }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontSize: size,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700,
        background: 'linear-gradient(90deg, #3547b4 0%, #00f3ff 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}>
        adzum
      </span>
      {showTagline && (
        <span style={{ fontSize: 10, color: '#4a4f5e', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          gestión escolar
        </span>
      )}
    </div>
  )
}
