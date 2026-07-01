import { useEffect, useMemo, useState } from 'react'
import { listarContatos, enriquecerEmpresa } from '../api/n8n'
import PillStatus from '../componentes/PillStatus'
import CompanyLogo from '../componentes/CompanyLogo'

// Tela de Contatos (RF-33 a RF-38): a "casa" dos dados que retroalimentam
// o sistema. Lista os contatos do banco (via n8n), com busca e acompanhamento.
// O enriquecimento é por EMPRESA (acha e-mails de RH na Snov) — dá pra disparar
// pela empresa do contato, aqui ou na tela Empresas. Roda no n8n.

export default function Contatos() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [msg, setMsg] = useState('')

  async function carregar() {
    setLoading(true); setErro('')
    try { setRows(await listarContatos()) }
    catch (e) { setErro('Não consegui carregar do n8n (' + e.message + ')') }
    finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.nome, r.empresa, r.email].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  function alternar(id) {
    setSelecionados((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  // Enriquece as EMPRESAS (únicas) dos contatos escolhidos.
  async function enriquecerEmpresasDe(lista) {
    const empresas = [...new Map(
      lista.filter((r) => r.empresa).map((r) => [r.empresa, r])
    ).values()]
    if (empresas.length === 0) { setMsg('Selecione contatos que tenham empresa.'); return }
    try {
      setMsg('Enriquecendo ' + empresas.length + ' empresa(s) via Snov...')
      await Promise.all(empresas.map((r) => enriquecerEmpresa(r.empresa, r.cnpj_empregador || r.cnpj)))
      setMsg('Enriquecimento solicitado. Veja o resultado na tela Empresas.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Contatos</h1></header>
      <p className="ajuda">Base de contatos que retroalimenta o sistema (RF-15/33). O enriquecimento Snov é uma ação aqui dentro (RF-36).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <input placeholder="Buscar nome, empresa ou e-mail..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
        <button
          className="btn-primario"
          disabled={selecionados.size === 0}
          onClick={() => enriquecerEmpresasDe(rows.filter((r) => selecionados.has(r.id)))}
        >
          Enriquecer empresas ({selecionados.size})
        </button>
      </div>

      {loading ? <div className="loading">Carregando…</div> : (
        <table className="preview">
          <thead>
            <tr>
              <th></th><th>Nome</th><th>Empresa</th><th>E-mail</th>
              <th>Etapa</th><th>Status envio</th><th>Enriquecimento</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r, i) => (
              <tr key={r.id ?? i}>
                <td><input type="checkbox" checked={selecionados.has(r.id)} onChange={() => alternar(r.id)} /></td>
                <td>{r.nome || '—'}</td>
                <td>
                  <span className="empresa-cel">
                    <CompanyLogo dominio={r.dominio} logo={r.logo} nome={r.empresa} size={24} />
                    {r.empresa || '—'}
                  </span>
                </td>
                <td>{r.email || '—'}</td>
                <td>{r.etapa || '—'}</td>
                <td><PillStatus status={r.status_envio} /></td>
                <td>{r.enriquecido_em ? ('em ' + r.enriquecido_em) : <span className="ajuda">não</span>}</td>
                <td><button className="btn-mini" onClick={() => enriquecerEmpresasDe([r])}>enriquecer</button></td>
              </tr>
            ))}
            {visiveis.length === 0 && <tr><td colSpan={8} className="empty">Nenhum contato.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
