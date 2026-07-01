import { useState } from 'react'

// Mostra o logo da empresa via Clearbit Logo API (logo.clearbit.com/{dominio}).
// Precisa só do domínio. Se não houver domínio ou a imagem falhar, mostra as
// iniciais da empresa num círculo (fallback), pra nunca ficar quebrado.
export default function CompanyLogo({ dominio, nome, size = 40 }) {
  const [erro, setErro] = useState(false)
  const iniciais = String(nome || '?').trim().slice(0, 2).toUpperCase()
  const estilo = { width: size, height: size, borderRadius: 8 }

  if (dominio && !erro) {
    return (
      <img
        src={`https://logo.clearbit.com/${dominio}`}
        alt={nome || dominio}
        style={{ ...estilo, objectFit: 'contain', background: '#fff', border: '1px solid var(--borda)' }}
        onError={() => setErro(true)}
      />
    )
  }
  return (
    <span
      className="logo-fallback"
      style={{ ...estilo, fontSize: size * 0.36 }}
      title={nome || ''}
    >
      {iniciais}
    </span>
  )
}
