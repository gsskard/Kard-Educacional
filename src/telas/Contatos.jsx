import { useEffect, useMemo, useState } from 'react'
import { listarContatos, listarEmpresas, enriquecerEmpresa } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'

// Tela de Contatos (RF-33 a RF-38): a "casa" dos dados que retroalimentam
// o sistema. Lista os contatos (tabela cobranca) e CRUZA com as empresas já
// enriquecidas (tabela empresas) pela empresa do contato — assim o logo e o
// status de enriquecimento aparecem aqui também, conectando as duas abas.
// O enriquecimento é por EMPRESA (Hunter) e roda no n8n.

const chave = (nome) => String(nome || '').trim().toLowerCase()

export default function Contatos() {
  const [rows, setRows] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [msg, setMsg] = useState('')

  async function carregar() {
    setLoading(true); setErro('')
    // contatos primeiro: assim que chega, a tela já aparece
    try {
      const contatos = await listarContatos()
      setRows(contatos)
    } catch (e) {
      setErro('Não consegui carregar os contatos do n8n (' + e.message + ')')
    } finally {
      setLoading(false)
    }
    // empresas em paralelo, só para cruzar logo/enriquecimento — nunca trava a tela
    listarEmpresas().then(setEmpresas).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  // Mapa empresa (normalizada) -> dados enriquecidos, para cruzar com os contatos.
  const empresaPorNome = useMemo(() => {
    const m = new Map()
    for (const e of empresas) {
      const k = chave(e.empresa)
      if (k) m.set(k, e)
    }
    return m
  }, [empresas])

  const visiveis = useMemo(() => {
    // só contatos com e-mail desbloqueado
    const comEmail = rows.filter((r) => r.email && String(r.email).trim())
    const q = busca.trim().toLowerCase()
    if (!q) return comEmail
    return comEmail.filter((r) =>
      [r.nome, r.cargo, r.empresa, r.cnpj, r.email].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  function alternar(id) {
    setSelecionados((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  // Enriquece as EMPRESAS (únicas) dos contatos escolhidos, via Hunter.
  async function enriquecerEmpresasDe(lista) {
    const alvo = [...new Map(
      lista.filter((r) => r.empresa).map((r) => [chave(r.empresa), r])
    ).values()]
    if (alvo.length === 0) { setMsg('Selecione contatos que tenham empresa.'); return }
    try {
      setMsg('Enriquecendo ' + alvo.length + ' empresa(s) via Hunter...')
      await Promise.all(alvo.map((r) => enriquecerEmpresa(r.empresa, r.cnpj_empregador || r.cnpj)))
      setMsg('Enriquecimento concluído. O logo e os e-mails já aparecem aqui e na aba Empresas.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Contatos</h1></header>
      <p className="ajuda">Base de contatos que retroalimenta o sistema (RF-15/33). O enriquecimento (Hunter) é por empresa e reflete na aba Empresas (RF-36).</p>

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
              <th></th><th>Nome</th><th>Cargo</th><th>Empresa</th><th>CNPJ</th><th>Domínio</th><th>E-mail</th>
              <th>Enriquecimento</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r, i) => {
              const emp = empresaPorNome.get(chave(r.empresa))
              return (
                <tr key={r.id ?? i}>
                  <td><input type="checkbox" checked={selecionados.has(r.id)} onChange={() => alternar(r.id)} /></td>
                  <td>{r.nome || '—'}</td>
                  <td>{r.cargo || '—'}</td>
                  <td>
                    <span className="empresa-cel">
                      <CompanyLogo dominio={emp?.dominio || r.dominio} logo={emp?.logo} nome={r.empresa} size={24} />
                      {r.empresa || '—'}
                    </span>
                  </td>
                  <td>{r.cnpj || '—'}</td>
                  <td>{r.dominio || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td>
                    {emp
                      ? <span className="pill pill-ok">enriquecida{emp.enriquecido_em ? ' ' + emp.enriquecido_em : ''}</span>
                      : <span className="ajuda">não</span>}
                  </td>
                  <td><button className="btn-mini" onClick={() => enriquecerEmpresasDe([r])}>enriquecer</button></td>
                </tr>
              )
            })}
            {visiveis.length === 0 && <tr><td colSpan={9} className="empty">Nenhum contato.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
