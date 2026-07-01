import { useState } from 'react'

// Mostra o logo/ícone da empresa a partir do domínio. Tenta o DuckDuckGo e,
// se falhar, o Google; se os dois falharem (ou não houver domínio), mostra as
// iniciais num círculo. (A Clearbit foi descontinuada.)
export default function CompanyLogo({ dominio, nome, size = 40 }) {
  const fontes = dominio
    ? [
        `https://icons.duckduckgo.com/ip3/${dominio}.ico`,
        `https://www.google.com/s2/favicons?domain=${dominio}&sz=128`,
      ]
    : []
  const [idx, setIdx] = useState(0)
  const iniciais = String(nome || '?').trim().slice(0, 2).toUpperCase()
  const estilo = { width: size, height: size, borderRadius: 8 }

  if (fontes[idx]) {
    return (
      <img
        src={fontes[idx]}
        alt={nome || dominio}
        style={{ ...estilo, objectFit: 'contain', background: '#fff', border: '1px solid var(--borda)', padding: 3 }}
        onError={() => setIdx(idx + 1)}
      />
    )
  }
  return (
    <span className="logo-fallback" style={{ ...estilo, fontSize: size * 0.36 }} title={nome || ''}>
      {iniciais}
    </span>
  )
}
