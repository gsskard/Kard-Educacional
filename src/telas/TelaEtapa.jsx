import { useEffect, useMemo, useState } from 'react'
import { listarContatos, importarCarga, dispararEtapa } from '../api/n8n'
import PillStatus from '../componentes/PillStatus'

// Tela "espelho" reusada pelas etapas (Educacional, Cobrança).
// Recebe a config da etapa e monta as 5 seções da Fase 1 (Claude2.md seção 8):
//   1) Upload do arquivo   (RF-26)
//   2) Conferência da carga (RF-27/28)
//   3) Disparo             (RF-19)
//   4) Acompanhamento      (RF-24/34)
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
  const [arrastando, setArrastando] = useState(false)

  function processarArquivo(arquivo) {
    if (!arquivo) return
    setNomeArquivo(arquivo.name)
    setMsg('')
    const leitor = new FileReader()
    leitor.onload = () => setCarga(parseCSV(String(leitor.result)))
    leitor.readAsText(arquivo, 'utf-8')
  }

  function aoEscolherArquivo(e) {
    processarArquivo(e.target.files?.[0])
  }

  function aoSoltar(e) {
    e.preventDefault()
    setArrastando(false)
    processarArquivo(e.dataTransfer.files?.[0])
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
      await importarCarga(etapa.valorEtapa, carga.registros)
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
        <label
          className={'dropzone' + (arrastando ? ' arrastando' : '') + (nomeArquivo ? ' tem-arquivo' : '')}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={aoSoltar}
        >
          <input type="file" accept=".csv,text/csv" onChange={aoEscolherArquivo} hidden />
          <div className="dropzone-icone">{nomeArquivo ? '📄' : '📤'}</div>
          {nomeArquivo ? (
            <>
              <div className="dropzone-titulo">{nomeArquivo}</div>
              <div className="dropzone-sub">Clique ou arraste outro arquivo para substituir</div>
            </>
          ) : (
            <>
              <div className="dropzone-titulo">Arraste o CSV aqui ou <span className="dropzone-link">escolha um arquivo</span></div>
              <div className="dropzone-sub">Apenas .csv · formato {etapa.formato}</div>
            </>
          )}
        </label>
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

      {/* 3) DISPARO + 4) ACOMPANHAMENTO ------------------------------ */}
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
  const [modelo, setModelo] = useState((etapa.modelos && etapa.modelos[0]?.id) || '')

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

  const daEtapa = rows.filter((r) => (r.etapa || 'Educacional') === etapa.valorEtapa)

  const modeloAtual = (etapa.modelos || []).find((m) => m.id === modelo)

  async function disparar() {
    if (!window.confirm(`Disparar o modelo "${modeloAtual?.nome || modelo}" de ${etapa.titulo} para ${daEtapa.length} contato(s)?`)) return
    setDisparando(true); setMsg('')
    try {
      await dispararEtapa(etapa.valorEtapa, modelo)
      setMsg('Disparo enviado ao n8n. Atualize em instantes para ver o status.')
    } catch (e) {
      setMsg('⏳ Falha ao disparar: ' + e.message + ' (o workflow "Disparar por Etapa" está ativo no n8n?)')
    } finally {
      setDisparando(false)
    }
  }

  return (
    <section className="secao">
      <h2>3. Disparo e 4. Acompanhamento <small>(RF-19/24/34)</small></h2>

      {etapa.modelos && etapa.modelos.length > 0 && (
        <div className="campo-modelo">
          <label>Modelo do e-mail</label>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {etapa.modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          {modeloAtual && <span className="ajuda">{modeloAtual.descricao}</span>}
        </div>
      )}

      <div className="acoes">
        <button
          className="btn-primario"
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
                  <td><PillStatus status={r.status_envio} /></td>
                  <td>{r.inbox || <span className="ajuda">a capturar</span>}</td>
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
