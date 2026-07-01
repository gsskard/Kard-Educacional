// Selo (pílula) colorido de status, no estilo do Portal Super Crédito.
// enviado → verde | falha → vermelho | vazio → neutro.
export default function PillStatus({ status }) {
  const s = String(status || '').toLowerCase()
  if (s === 'enviado') return <span className="pill pill-ok">ENVIADO</span>
  if (s === 'falha') return <span className="pill pill-erro">FALHA</span>
  return <span className="pill pill-neutro">—</span>
}
