import { Fragment, useEffect, useMemo, useState } from 'react'
import { listarEmpresas, enriquecerEmpresa } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'

// Tela de Empresas (RF-09/10/33/37): empresas enriquecidas via Hunter —
// logo, CNPJ, domínio/site, localização, nº de funcionários, categoria e os
// e-mails de RH com cargo/validade. Duas visões: Cartões e Tabela (tipo Excel).

function PillEmail({ valido }) {
  const v = String(valido || '').toLowerCase()
  if (v === 'valido' || v === 'valid') return <span className="pill pill-ok">VÁLIDO</span>
  if (v === 'invalido' || v === 'invalid') return <span className="pill pill-erro">INVÁLIDO</span>
  return <span className="pill pill-neutro">?</span>
}

export default function Empresas() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState('')
  const [view, setView] = useState('cards')       // 'cards' | 'tabela'
  const [expandido, setExpandido] = useState(() => new Set())

  async function carregar() {
    setLoading(true); setErro('')
    try {
      setRows(await listarEmpresas())
    } catch (e) {
      setErro('Ainda não consigo ler as empresas do n8n (' + e.message + ').')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((e) =>
      [e.empresa, e.cnpj, e.dominio, e.localizacao].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  function toggleLinha(k) {
    setExpandido((prev) => {
      const s = new Set(prev)
      s.has(k) ? s.delete(k) : s.add(k)
      return s
    })
  }

  // reenriquecer força nova busca no Hunter (ignora o cache Redis)
  async function enriquecer(e) {
    try {
      setMsg(`Reenriquecendo "${e.empresa}" via Hunter (ignorando cache)...`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true)
      setMsg('Enriquecimento atualizado. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Empresas</h1></header>
      <p className="ajuda">Empresas enriquecidas via Hunter: domínio, site, localização, nº de funcionários, categoria, logo e e-mails de RH com cargo (RF-09/10/37).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <input placeholder="Buscar empresa, CNPJ, domínio ou local..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
        <div className="view-toggle">
          <button className={view === 'cards' ? 'ativo' : ''} onClick={() => setView('cards')}>Cartões</button>
          <button className={view === 'tabela' ? 'ativo' : ''} onClick={() => setView('tabela')}>Tabela</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="secao"><div className="empty">Nenhuma empresa enriquecida ainda.</div></div>
      ) : view === 'cards' ? (
        <div className="empresas-grid">
          {visiveis.map((e, i) => (
            <div className="empresa-card" key={e.cnpj || e.empresa || i}>
              <div className="empresa-topo">
                <CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={48} />
                <div className="empresa-id">
                  <div className="empresa-nome">{e.empresa || '—'}</div>
                  <div className="empresa-cnpj">{e.cnpj || 'CNPJ —'}</div>
                </div>
              </div>

              <div className="empresa-linha"><span className="chave">Domínio</span><span>{e.dominio || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Site</span>{e.site ? <a href={e.site} target="_blank" rel="noreferrer">{e.site}</a> : <span>—</span>}</div>
              <div className="empresa-linha"><span className="chave">Localização</span><span>{e.localizacao || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Funcionários</span><span>{e.funcionarios || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Categoria</span><span>{e.categoria || '—'}</span></div>

              <div className="empresa-rh">
                <div className="chave">E-mails de RH ({(e.emails_rh || []).length})</div>
                {(e.emails_rh && e.emails_rh.length > 0) ? (
                  e.emails_rh.map((em, j) => (
                    <div className="rh-item" key={j}>
                      <span className="rh-info">
                        <span>{em.email || em}</span>
                        {em.cargo && <small className="rh-cargo">{em.cargo}</small>}
                      </span>
                      <PillEmail valido={em.valido} />
                    </div>
                  ))
                ) : (
                  <span className="ajuda">nenhum e-mail encontrado</span>
                )}
              </div>

              <div className="acoes">
                <button className="btn-mini" onClick={() => enriquecer(e)}>reenriquecer</button>
                {e.enriquecido_em && <span className="ajuda">enriquecido em {e.enriquecido_em}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-wrap">
          <table className="preview">
            <thead>
              <tr>
                <th></th><th>Empresa</th><th>CNPJ</th><th>Localização</th>
                <th>Funcionários</th><th>Categoria</th><th>Domínio</th>
                <th>E-mails RH</th><th>Enriquecido</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((e, i) => {
                const k = e.cnpj || e.empresa || String(i)
                const aberto = expandido.has(k)
                const emails = e.emails_rh || []
                return (
                  <Fragment key={k}>
                    <tr className="linha-empresa" onClick={() => toggleLinha(k)}>
                      <td>{emails.length > 0 ? (aberto ? '▾' : '▸') : ''}</td>
                      <td><span className="empresa-cel"><CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={24} />{e.empresa || '—'}</span></td>
                      <td>{e.cnpj || '—'}</td>
                      <td>{e.localizacao || '—'}</td>
                      <td>{e.funcionarios || '—'}</td>
                      <td>{e.categoria || '—'}</td>
                      <td>{e.dominio || '—'}</td>
                      <td>{emails.length}</td>
                      <td>{e.enriquecido_em || '—'}</td>
                    </tr>
                    {aberto && emails.length > 0 && (
                      <tr className="linha-detalhe">
                        <td></td>
                        <td colSpan={8}>
                          <table className="sub">
                            <thead><tr><th>E-mail</th><th>Cargo</th><th>Departamento</th><th>Validade</th></tr></thead>
                            <tbody>
                              {emails.map((em, j) => (
                                <tr key={j}>
                                  <td>{em.email || '—'}</td>
                                  <td>{em.cargo || '—'}</td>
                                  <td>{em.departamento || '—'}</td>
                                  <td><PillEmail valido={em.valido} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <small className="ajuda">Clique numa linha para ver os cargos encontrados.</small>
        </div>
      )}
    </div>
  )
}
