import { useEffect, useMemo, useState } from 'react'
import { inboxService } from '../../services/InboxService'

// Tela Inbox: lista os e-mails da caixa de entrada do Outlook
// (cobranca@kard.com.br) via n8n e abre o corpo completo ao clicar.
// O HTML do e-mail é renderizado num iframe com sandbox (sem scripts).

const fmtData = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function Inbox() {
  const [emails, setEmails] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [msg, setMsg] = useState('')
  const [busca, setBusca] = useState('')
  const [soNaoLidos, setSoNaoLidos] = useState(false)
  const [limite, setLimite] = useState(50)

  // e-mail aberto (detalhe)
  const [aberto, setAberto] = useState(null)
  const [abrindo, setAbrindo] = useState(false)

  async function carregar(qtd = limite) {
    setCarregando(true)
    setMsg('')
    try {
      const { total, emails } = await inboxService.listar(qtd)
      setEmails(emails)
      setMsg(total ? '' : 'Caixa de entrada vazia.')
    } catch (err) {
      setMsg('Erro ao carregar inbox: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  async function abrirEmail(item) {
    setAbrindo(true)
    setAberto({ ...item, _carregandoCorpo: true })
    try {
      const completo = await inboxService.abrir(item.id)
      setAberto({ ...item, ...completo, _carregandoCorpo: false })
    } catch (err) {
      setAberto({ ...item, _carregandoCorpo: false, _erro: 'Erro ao abrir e-mail: ' + err.message })
    } finally {
      setAbrindo(false)
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let lista = emails
    if (soNaoLidos) lista = lista.filter((e) => !e.lido)
    if (!q) return lista
    return lista.filter((e) =>
      [e.assunto, e.de_nome, e.de_email, e.preview].some((c) => String(c || '').toLowerCase().includes(q)))
  }, [emails, busca, soNaoLidos])

  const naoLidos = emails.filter((e) => !e.lido).length

  // corpo do e-mail: HTML vai pro iframe sandbox; texto puro vai em <pre>
  const corpo = aberto?.body
  const corpoHtml = corpo?.contentType === 'html' ? corpo.content : null
  const corpoTexto = corpo && corpo.contentType !== 'html' ? corpo.content : null

  return (
    <div>
      <header className="pagina-head"><h1>Inbox</h1></header>
      <p className="ajuda">
        Caixa de entrada de <b>cobranca@kard.com.br</b> (Outlook, via n8n). Clique num e-mail
        para ler o conteúdo completo. Somente leitura — nada é marcado como lido nem excluído.
      </p>

      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <button className="btn-refresh" disabled={carregando} onClick={() => carregar()}>
          {carregando ? 'Carregando…' : '↻ Atualizar'}
        </button>
        <input placeholder="Buscar assunto, remetente ou trecho…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="ajuda" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={soNaoLidos} onChange={(e) => setSoNaoLidos(e.target.checked)} />
          só não lidos {naoLidos > 0 && <b>({naoLidos})</b>}
        </label>
        <select value={limite} onChange={(e) => { const v = Number(e.target.value); setLimite(v); carregar(v) }}>
          <option value={25}>25 e-mails</option>
          <option value={50}>50 e-mails</option>
          <option value={100}>100 e-mails</option>
          <option value={200}>200 e-mails</option>
        </select>
      </div>

      {emails.length > 0 && (
        <div className="tabela-rolagem">
          <table className="preview contatos-tabela">
            <thead>
              <tr><th>De</th><th>Assunto</th><th>Recebido</th><th></th></tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr key={e.id} onClick={() => abrirEmail(e)} style={{ cursor: 'pointer', fontWeight: e.lido ? 'normal' : 600 }}>
                  <td className="cel-nome">
                    <div className="contato-nome">
                      <strong className="cel-trunca" title={e.de_email}>{e.de_nome || e.de_email || '—'}</strong>
                      {e.de_nome && <small className="contato-cargo cel-trunca" title={e.de_email}>{e.de_email}</small>}
                    </div>
                  </td>
                  <td>
                    <span className="cel-trunca" title={e.assunto} style={{ maxWidth: 420, display: 'inline-block', verticalAlign: 'bottom' }}>
                      {e.assunto}
                    </span>
                    {e.preview && <small className="ajuda cel-trunca" style={{ display: 'block', maxWidth: 420, fontWeight: 'normal' }} title={e.preview}>{e.preview}</small>}
                  </td>
                  <td className="cel-nowrap">{fmtData(e.recebido_em)}</td>
                  <td className="cel-nowrap">
                    {!e.lido && <span className="pill pill-ok">novo</span>}
                    {e.tem_anexo && ' 📎'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Painel de leitura (overlay simples, sem dependências) */}
      {aberto && (
        <div
          onClick={() => setAberto(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{ width: 'min(720px, 92vw)', height: '100%', background: '#fff', boxShadow: '-8px 0 24px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16 }} title={aberto.assunto}>{aberto.assunto || aberto.subject || '(sem assunto)'}</h2>
                <div className="ajuda" style={{ marginTop: 4 }}>
                  De: <b>{aberto.de_nome || aberto.from?.emailAddress?.name || ''}</b> &lt;{aberto.de_email || aberto.from?.emailAddress?.address || ''}&gt;
                  {' · '}{fmtData(aberto.recebido_em || aberto.receivedDateTime)}
                  {aberto.tem_anexo || aberto.hasAttachments ? ' · 📎 tem anexo' : ''}
                </div>
              </div>
              <button className="btn-refresh" onClick={() => setAberto(null)} aria-label="Fechar">✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
              {aberto._carregandoCorpo && <p className="ajuda" style={{ padding: 18 }}>Carregando conteúdo…</p>}
              {aberto._erro && <div className="banner" style={{ margin: 18 }}>{aberto._erro}</div>}
              {corpoHtml && (
                <iframe
                  title="Conteúdo do e-mail"
                  sandbox=""
                  srcDoc={corpoHtml}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              )}
              {corpoTexto && <pre style={{ padding: 18, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{corpoTexto}</pre>}
            </div>
            {aberto.webLink && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid #e5e7eb' }}>
                <a href={aberto.webLink} target="_blank" rel="noreferrer" className="ajuda">Abrir no Outlook ↗</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
