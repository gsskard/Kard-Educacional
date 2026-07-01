import { useEffect, useMemo, useState } from 'react'
import { listarContatos, importarCarga, dispararEtapa } from '../api/n8n'

// Tela "espelho" reusada pelas 3 etapas (Educacional 1, Educacional 2, Cobrança).
// Recebe a config da etapa e monta as 5 seções da Fase 1 (Claude2.md seção 8):
//   1) Upload do arquivo   (RF-26)
//   2) Conferência da carga (RF-27/28)
//   3) Remetente/inbox     (RF-22/23)
//   4) Disparo             (RF-19)
//   5) Acompanhamento      (RF-24/34)
//
// O upload e a validação rodam 100% no navegador (não dependem do n8n).
// A persistência (importarCarga) e o disparo dependem de webhooks do n8n
// que ainda serão criados — por isso ficam marcados como PENDENTE.

// -------- CSV bem simples (sem dependência): detecta ; ou , --------
function parseCSV(texto) {
  const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  if (linhas.length === 0) return { cabecalho: [], registros: [] }
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ','
  const cabecalho = linhas[0].split(sep).map((c) => c.trim())
  const registros = linhas.slice(1).map((linha) => {
    const valores = linha.split(sep)
    const obj = {}
    cabecalho.forEach((col, i) => (obj[col] = (valores[i] ?? '').trim()))
    return obj
  })
  return { cabecalho, registros }
}

export default function TelaEtapa({ etapa }) {
  const [carga, setCarga] = useState(null)   // { cabecalho, registros }
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [msg, setMsg] = useState('')

  function aoEscolherArquivo(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setNomeArquivo(arquivo.name)
    setMsg('')
    const leitor = new FileReader()
    leitor.onload = () => setCarga(parseCSV(String(leitor.result)))
    leitor.readAsText(arquivo, 'utf-8')
  }

  // Conferência: quais colunas esperadas estão faltando / sobrando (RF-27)
  const conferencia = useMemo(() => {
    if (!carga) return null
    const esperadas = etapa.colunasEsperadas
    const presentes = carga.cabecalho
    const faltando = esperadas.filter((c) => !presentes.includes(c))
    const extras = presentes.filter((c) => !esperadas.includes(c))
    return { faltando, extras, total: carga.registros.length }
  }, [carga, etapa])

  async function confirmarImportacao() {
    try {
      setMsg('Enviando carga para o n8n...')
      await importarCarga(etapa.rota, carga.registros)
      setMsg('Carga importada com sucesso.')
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head" style={{ borderColor: etapa.cor }}>
        <h1>{etapa.ordem}. {etapa.titulo}</h1>
        <span className="badge" style={{ background: etapa.cor }}>
          formato: {etapa.formato}
        </span>
      </header>

      {/* 1) UPLOAD ---------------------------------------------------- */}
      <section className="secao">
        <h2>1. Upload do arquivo <small>(RF-26)</small></h2>
        <p className="ajuda">
          Envie o arquivo da etapa <b>{etapa.titulo}</b> (.csv).{' '}
          {etapa.formato === 'cobranca'
            ? 'Formato do Anexo A (Cobrança).'
            : 'Formato educacional.'}
        </p>
        <input type="file" accept=".csv,text/csv" onChange={aoEscolherArquivo} />
        {nomeArquivo && <span className="arquivo-nome">{nomeArquivo}</span>}
      </section>

      {/* 2) CONFERÊNCIA ---------------------------------------------- */}
      {conferencia && (
        <section className="secao">
          <h2>2. Conferência da carga <small>(RF-27/28)</small></h2>
          <div className="resumo-carga">
            <div><b>{conferencia.total}</b> registros lidos</div>
            {conferencia.faltando.length > 0 ? (
              <div className="alerta">
                Colunas obrigatórias faltando: {conferencia.faltando.join(', ')}
              </div>
            ) : (
              <div className="ok">Todas as colunas esperadas estão presentes ✓</div>
            )}
            {conferencia.extras.length > 0 && (
              <div className="ajuda">Colunas extras (ignoradas): {conferencia.extras.join(', ')}</div>
            )}
          </div>

          <div className="preview-wrap">
            <table className="preview">
              <thead>
                <tr>{carga.cabecalho.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {carga.registros.slice(0, 5).map((r, i) => (
                  <tr key={i}>{carga.cabecalho.map((c) => <td key={c}>{r[c]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="ajuda">Mostrando as 5 primeiras linhas.</small>

          <div className="acoes">
            <button
              className="btn-primario"
              style={{ background: etapa.cor }}
              disabled={conferencia.faltando.length > 0}
              onClick={confirmarImportacao}
            >
              Confirmar importação
            </button>
          </div>
          {msg && <div className="banner">{msg}</div>}
        </section>
      )}

      {/* 3) REMETENTE / INBOX ---------------------------------------- */}
      <section className="secao">
        <h2>3. Remetente / Inbox <small>(RF-22/23)</small></h2>
        <p className="ajuda">
          Esta etapa usa a inbox <code>{etapa.chaveConfigInbox}</code>.
          {etapa.formato === 'educacional'
            ? ' (Educacional 1 e 2 compartilham o mesmo remetente.)'
            : ' (Cobrança usa remetente próprio — resp. Emerson Correia.)'}
        </p>
        <p className="pendente">
          ⏳ A inbox é cadastrada na tela <b>Configurações</b> e lida daqui. (a fazer no n8n)
        </p>
      </section>

      {/* 4) DISPARO + 5) ACOMPANHAMENTO ------------------------------ */}
      <AcompanhamentoEtapa etapa={etapa} />
    </div>
  )
}

// Seções 4 (disparo) e 5 (acompanhamento): lê os contatos reais do n8n e
// mostra os que pertencem a esta etapa.
function AcompanhamentoEtapa({ etapa }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [disparando, setDisparando] = useState(false)

  async function carregar() {
    setLoading(true); setErro('')
    try {
      setRows(await listarContatos())
    } catch (e) {
      setErro('Não consegui ler os contatos do n8n (' + e.message + ')')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const daEtapa = rows.filter((r) => (r.etapa || 'Educacional 1') === etapa.valorEtapa)

  async function disparar() {
    if (!window.confirm(`Disparar o e-mail de "${etapa.titulo}" para ${daEtapa.length} contato(s)?`)) return
    setDisparando(true); setMsg('')
    try {
      await dispararEtapa(etapa.valorEtapa)
      setMsg('Disparo enviado ao n8n. Atualize em instantes para ver o status.')
    } catch (e) {
      setMsg('⏳ Falha ao disparar: ' + e.message + ' (o workflow "Disparar por Etapa" está ativo no n8n?)')
    } finally {
      setDisparando(false)
    }
  }

  return (
    <section className="secao">
      <h2>4. Disparo e 5. Acompanhamento <small>(RF-19/24/34)</small></h2>

      <div className="acoes">
        <button
          className="btn-primario"
          style={{ background: etapa.cor }}
          disabled={disparando || daEtapa.length === 0}
          onClick={disparar}
        >
          {disparando ? 'Disparando…' : `Disparar ${etapa.titulo} (${daEtapa.length})`}
        </button>
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
      </div>
      {msg && <div className="banner">{msg}</div>}
      {erro && <div className="banner">{erro}</div>}

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : (
        <>
          <div className="ajuda">{daEtapa.length} contato(s) nesta etapa.</div>
          <table className="preview">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Etapa</th><th>Status envio</th><th>Inbox origem</th></tr>
            </thead>
            <tbody>
              {daEtapa.slice(0, 20).map((r, i) => (
                <tr key={r.id ?? i}>
                  <td>{r.nome || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td>{r.etapa || '—'}</td>
                  <td>{r.status_envio || '—'}</td>
                  <td>{r.inbox || <span className="pendente">a capturar</span>}</td>
                </tr>
              ))}
              {daEtapa.length === 0 && (
                <tr><td colSpan={5} className="empty">Nenhum contato nesta etapa.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
