import CompanyLogo from './CompanyLogo'

// Painel lateral (gaveta) com o "perfil" da empresa — vibe HubSpot, simples.
// Abre ao clicar numa empresa na tela de Contatos: mostra os dados da empresa
// (domínio, site, localização, porte...) e a lista de contatos dela.
export default function PainelEmpresa({ empresa, contatos = [], aoFechar }) {
  if (!empresa) return null
  const e = empresa
  const total = contatos.length
  const comEmail = contatos.filter((c) => c.email && String(c.email).trim()).length

  return (
    <>
      <div className="painel-backdrop" onClick={aoFechar} />
      <aside className="painel-empresa" role="dialog" aria-label={'Empresa ' + (e.empresa || '')}>
        <header className="painel-topo">
          <CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={44} />
          <div className="painel-titulo">
            <strong>{e.empresa || '—'}</strong>
            {e.cnpj && <small>{e.cnpj}</small>}
          </div>
          <button className="painel-fechar" onClick={aoFechar} aria-label="Fechar">✕</button>
        </header>

        <div className="painel-corpo">
          <section className="painel-bloco">
            <div className="painel-linha"><span className="chave">Domínio</span><span>{e.dominio || '—'}</span></div>
            <div className="painel-linha"><span className="chave">Site</span>{e.site ? <a href={e.site} target="_blank" rel="noreferrer">{e.site}</a> : <span>{e.dominio ? <a href={'https://' + e.dominio} target="_blank" rel="noreferrer">{'https://' + e.dominio}</a> : '—'}</span>}</div>
            <div className="painel-linha"><span className="chave">Localização</span><span>{e.localizacao || '—'}</span></div>
            <div className="painel-linha"><span className="chave">Porte</span><span>{e.porte || '—'}</span></div>
            <div className="painel-linha"><span className="chave">Capital social</span><span>{e.capital_social || '—'}</span></div>
            <div className="painel-linha"><span className="chave">Categoria</span><span>{e.categoria || '—'}</span></div>
            {e.enriquecido_em && <div className="painel-linha"><span className="chave">Enriquecido</span><span>{e.enriquecido_em}</span></div>}
          </section>

          <section className="painel-bloco">
            <div className="painel-secao-tit">
              Contatos ({total})
              {total > 0 && <small>{comEmail} com e-mail</small>}
            </div>
            {total === 0 && <div className="ajuda">Nenhum contato salvo para esta empresa.</div>}
            {contatos.map((c, i) => (
              <div key={c.id ?? i} className={'painel-contato' + (c.eh_rh ? ' eh-rh' : '')}>
                <div className="painel-contato-info">
                  <strong>{c.nome || '—'}{c.eh_rh && <span className="tag-rh-mini">RH</span>}</strong>
                  <small>{c.cargo || '—'}</small>
                </div>
                <div className="painel-contato-email">
                  {c.email
                    ? <a href={'mailto:' + c.email}>{c.email}</a>
                    : <span className="ajuda">sem e-mail liberado</span>}
                </div>
              </div>
            ))}
          </section>
        </div>
      </aside>
    </>
  )
}
