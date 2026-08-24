import { useEffect, useState } from 'react'

// Tela ETL — conecta uma PASTA LOCAL/DE REDE via File System Access API
// (ex.: Z: \\192.168.137.5\FIFileSync\Producao) e lista os arquivos que as
// rotinas do usuário geram lá. Protótipo para testar a leitura da pasta; o
// envio pro processamento server-side (n8n/Python) é o próximo passo.
//
// Limites: só Chrome/Edge desktop; a pasta é escolhida uma vez (fica lembrada
// via IndexedDB, reconecta com 1 clique); leitura só enquanto a aba está aberta.

const SUPORTA = typeof window !== 'undefined' && 'showDirectoryPicker' in window

/* ---- persistência do handle da pasta (IndexedDB, sem dependência) ---- */
const IDB_DB = 'kard-etl'
const IDB_STORE = 'handles'
const IDB_KEY = 'pasta-etl'
function abrirIdb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function salvarHandle(h) {
  const db = await abrirIdb()
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(h, IDB_KEY)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
async function carregarHandle() {
  const db = await abrirIdb()
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const g = tx.objectStore(IDB_STORE).get(IDB_KEY)
    g.onsuccess = () => res(g.result || null)
    g.onerror = () => res(null)
  })
}

const fmtTamanho = (n) => {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
const fmtData = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export default function ETL() {
  const [handle, setHandle] = useState(null)
  const [precisaReconectar, setPrecisaReconectar] = useState(false)
  const [arquivos, setArquivos] = useState(null) // null = ainda não listou
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState(null) // { nome, tamanho, ... }
  const [preview, setPreview] = useState('')

  // ao abrir, tenta recuperar a pasta já autorizada
  useEffect(() => {
    if (!SUPORTA) return
    let vivo = true
    ;(async () => {
      const h = await carregarHandle().catch(() => null)
      if (!h || !vivo) return
      setHandle(h)
      const perm = await h.queryPermission({ mode: 'read' }).catch(() => 'prompt')
      if (perm === 'granted') listar(h)
      else setPrecisaReconectar(true)
    })()
    return () => { vivo = false }
  }, [])

  async function conectar() {
    setErro('')
    try {
      const dir = await window.showDirectoryPicker({ id: 'kard-etl', mode: 'read' })
      await salvarHandle(dir).catch(() => {})
      setHandle(dir); setPrecisaReconectar(false)
      listar(dir)
    } catch (e) {
      if (e && e.name === 'AbortError') return // usuário cancelou
      setErro('Não consegui abrir a pasta: ' + (e?.message || e))
    }
  }

  async function reconectar() {
    if (!handle) return conectar()
    const perm = await handle.requestPermission({ mode: 'read' }).catch(() => 'denied')
    if (perm === 'granted') { setPrecisaReconectar(false); listar(handle) }
    else setErro('Permissão negada. Clique em "Conectar pasta" e autorize.')
  }

  async function listar(dir) {
    setCarregando(true); setErro(''); setSel(null); setPreview('')
    try {
      const arqs = []
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file') continue
        try {
          const f = await entry.getFile()
          arqs.push({ nome: entry.name, tamanho: f.size, modificado: f.lastModified, handle: entry })
        } catch { /* arquivo bloqueado/em uso — ignora */ }
      }
      arqs.sort((a, b) => b.modificado - a.modificado)
      setArquivos(arqs)
    } catch (e) {
      setErro('Erro ao ler a pasta: ' + (e?.message || e))
      setArquivos([])
    } finally {
      setCarregando(false)
    }
  }

  async function abrirPreview(item) {
    setSel(item); setPreview('carregando…')
    try {
      const f = await item.handle.getFile()
      const ehTexto = /\.(csv|txt|tsv|json|log|xml)$/i.test(item.nome)
      if (!ehTexto) { setPreview('(pré-visualização só para texto/CSV — ' + fmtTamanho(item.tamanho) + ')'); return }
      const trecho = await f.slice(0, 64 * 1024).text() // só os primeiros 64 KB
      const linhas = trecho.split(/\r?\n/).slice(0, 20)
      setPreview(linhas.join('\n') + (f.size > 64 * 1024 ? '\n…' : ''))
    } catch (e) {
      setPreview('Não consegui ler o arquivo: ' + (e?.message || e))
    }
  }

  const visiveis = (arquivos || []).filter((a) => !busca.trim() || a.nome.toLowerCase().includes(busca.toLowerCase().trim()))
  const nomePasta = handle?.name || 'pasta'

  return (
    <div>
      <header className="pagina-head"><h1>ETL</h1></header>

      {!SUPORTA ? (
        <section className="secao">
          <div className="banner">
            Seu navegador não suporta ler pastas locais (File System Access API).
            Use o <b>Google Chrome</b> ou <b>Microsoft Edge</b> no desktop.
          </div>
        </section>
      ) : (
        <>
          <section className="secao">
            <h2>1. Conectar pasta</h2>
            <p className="ajuda">
              Conecte a pasta onde as rotinas geram os arquivos (ex.: <span className="mono">Z:\ SICRepositorio</span> —
              <span className="mono"> \\192.168.137.5\FIFileSync\Producao</span>). Você escolhe a pasta uma vez; a autorização fica lembrada neste navegador.
            </p>
            <div className="acoes">
              <button className="btn-primario" onClick={conectar}>{handle ? 'Trocar pasta' : 'Conectar pasta'}</button>
              {handle && precisaReconectar && <button className="btn-secundario" onClick={reconectar}>Reconectar “{nomePasta}”</button>}
              {handle && !precisaReconectar && <button className="btn-refresh" onClick={() => listar(handle)}>Atualizar</button>}
            </div>
            {handle && <p className="ajuda" style={{ marginTop: 10 }}>Pasta conectada: <b>{nomePasta}</b>{precisaReconectar ? ' (precisa reautorizar)' : ''}</p>}
            {erro && <div className="banner" style={{ marginTop: 10 }}>{erro}</div>}
          </section>

          {arquivos !== null && !precisaReconectar && (
            <section className="secao">
              <h2>2. Arquivos na pasta <small>({visiveis.length})</small></h2>
              <div className="campo-modelo">
                <label>Buscar arquivo</label>
                <input type="text" value={busca} placeholder="ex.: 2026-08 ou .csv" onChange={(e) => setBusca(e.target.value)} />
              </div>
              {carregando ? <div className="loading">Lendo pasta…</div> : (
                <div className="preview-wrap">
                  <table className="preview">
                    <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Modificado</th></tr></thead>
                    <tbody>
                      {visiveis.map((a) => (
                        <tr key={a.nome} className="linha-clicavel" onClick={() => abrirPreview(a)} title="Pré-visualizar">
                          <td>{a.nome}</td>
                          <td className="mono">{fmtTamanho(a.tamanho)}</td>
                          <td className="mono">{fmtData(a.modificado)}</td>
                        </tr>
                      ))}
                      {visiveis.length === 0 && <tr><td colSpan={3} className="empty">Nenhum arquivo{busca ? ' com esse nome' : ''} na pasta.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {sel && (
            <section className="secao">
              <h2>3. Prévia — {sel.nome}</h2>
              <p className="ajuda">{fmtTamanho(sel.tamanho)} · modificado {fmtData(sel.modificado)}</p>
              <pre style={{ background: '#0d1b3e', color: '#e6eaf0', padding: 14, borderRadius: 10, overflow: 'auto', maxHeight: 320, fontSize: 12.5, whiteSpace: 'pre' }}>{preview}</pre>
              <p className="ajuda" style={{ marginTop: 10 }}>
                <b>Próximo passo:</b> enviar o arquivo escolhido pro processamento em lote no servidor (n8n/Python) — a definir.
                A leitura da pasta já funciona; o disparo de arquivos grandes será server-side.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
