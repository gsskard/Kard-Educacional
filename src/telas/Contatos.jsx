import { useEffect, useMemo, useState } from 'react'
import { listarContatos, enriquecerContato } from '../api/n8n'
import PillStatus from '../componentes/PillStatus'

// Tela de Contatos (RF-33 a RF-38): a "casa" dos dados que retroalimentam
// o sistema. Lista os contatos do banco (via n8n), com busca, acompanhamento
// por e-mail e a ação de enriquecimento Snov (por contato e em lote).
// O enriquecimento em si roda no n8n (PENDENTE); aqui é só o gatilho.

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

  async function enriquecer(ids) {
    try {
      setMsg('Enriquecendo ' + ids.length + ' contato(s) via Snov...')
      await Promise.all(ids.map((id) => enriquecerContato(id)))
      setMsg('Enriquecimento concluído.')
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
          onClick={() => enriquecer([...selecionados])}
        >
          Enriquecer selecionados ({selecionados.size})
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
                <td>{r.empresa || '—'}</td>
                <td>{r.email || '—'}</td>
                <td>{r.etapa || '—'}</td>
                <td><PillStatus status={r.status_envio} /></td>
                <td>{r.enriquecido_em ? ('em ' + r.enriquecido_em) : <span className="pendente">não</span>}</td>
                <td><button className="btn-mini" onClick={() => enriquecer([r.id])}>enriquecer</button></td>
              </tr>
            ))}
            {visiveis.length === 0 && <tr><td colSpan={8} className="empty">Nenhum contato.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
