import { useEffect, useMemo, useState } from 'react'
import { listarEmpresas, enriquecerEmpresa } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'

// Tela de Empresas (RF-09/10/33/37): mostra as empresas enriquecidas —
// logo (Clearbit), CNPJ, domínio/site e os e-mails de RH com a validade.
// O enriquecimento roda no n8n (Snov); aqui é a visualização + o gatilho.

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

  async function carregar() {
    setLoading(true); setErro('')
    try {
      setRows(await listarEmpresas())
    } catch (e) {
      setErro('Ainda não consigo ler as empresas do n8n (' + e.message + '). Falta criar a tabela "empresas" e o workflow de enriquecimento.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((e) =>
      [e.empresa, e.cnpj, e.dominio].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  async function enriquecer(e) {
    try {
      setMsg(`Enriquecendo "${e.empresa}" via Snov...`)
      await enriquecerEmpresa(e.empresa, e.cnpj)
      setMsg('Enriquecimento solicitado. Atualize em instantes.')
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Empresas</h1></header>
      <p className="ajuda">Empresas empregadoras enriquecidas via Snov: domínio, site, CNPJ, logo e e-mails de RH (RF-09/10/37).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <input placeholder="Buscar empresa, CNPJ ou domínio..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
      </div>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="secao"><div className="empty">Nenhuma empresa enriquecida ainda.</div></div>
      ) : (
        <div className="empresas-grid">
          {visiveis.map((e, i) => (
            <div className="empresa-card" key={e.cnpj || e.empresa || i}>
              <div className="empresa-topo">
                <CompanyLogo dominio={e.dominio} nome={e.empresa} size={48} />
                <div className="empresa-id">
                  <div className="empresa-nome">{e.empresa || '—'}</div>
                  <div className="empresa-cnpj">{e.cnpj || 'CNPJ —'}</div>
                </div>
              </div>

              <div className="empresa-linha">
                <span className="chave">Domínio</span>
                <span>{e.dominio || '—'}</span>
              </div>
              <div className="empresa-linha">
                <span className="chave">Site</span>
                {e.site
                  ? <a href={e.site} target="_blank" rel="noreferrer">{e.site}</a>
                  : <span>—</span>}
              </div>

              <div className="empresa-rh">
                <div className="chave">E-mails de RH</div>
                {(e.emails_rh && e.emails_rh.length > 0) ? (
                  e.emails_rh.map((em, j) => (
                    <div className="rh-item" key={j}>
                      <span>{em.email || em}</span>
                      <PillEmail valido={em.valido} />
                    </div>
                  ))
                ) : (
                  <span className="ajuda">nenhum e-mail encontrado ainda</span>
                )}
              </div>

              <div className="acoes">
                <button className="btn-mini" onClick={() => enriquecer(e)}>reenriquecer</button>
                {e.enriquecido_em && <span className="ajuda">enriquecido em {e.enriquecido_em}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
