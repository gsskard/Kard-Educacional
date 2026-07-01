import { useState } from 'react'

// Mostra o logo/ícone da empresa a partir do domínio. Tenta várias fontes
// grátis em ordem (a primeira que carregar vence); se todas falharem — ou não
// houver domínio —, mostra as iniciais num círculo.
//   1) unavatar.io  — agrega vários provedores, melhor cobertura
//   2) Google       — bem tolerante a rede corporativa
//   3) DuckDuckGo   — ícones em boa resolução
// Se a empresa tiver uma URL de logo salva (campo `logo`), ela vem primeiro.
export default function CompanyLogo({ dominio, logo, nome, size = 40 }) {
  const fontes = []
  if (logo) fontes.push(logo)
  if (dominio) {
    fontes.push(`https://unavatar.io/${dominio}`)
    fontes.push(`https://www.google.com/s2/favicons?domain=${dominio}&sz=128`)
    fontes.push(`https://icons.duckduckgo.com/ip3/${dominio}.ico`)
  }

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
