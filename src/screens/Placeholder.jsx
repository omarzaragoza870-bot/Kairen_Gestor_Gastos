export default function Placeholder({ titulo, texto }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>{titulo}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{texto}</p>
    </div>
  )
}
