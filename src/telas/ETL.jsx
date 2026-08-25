import { useEffect, useState } from 'react'
import { lerCabecalho, processarArquivo } from './etlStreaming'
import { abrirBase, rodarSql, exportarSql, SQL_RECORTE_CLT } from './etlDuck'

// Tela ETL — conecta uma PASTA LOCAL/DE REDE via File System Access API
// (ex.: Z: \\192.168.137.5\FIFileSync\Producao) e lista os arquivos que as
// rotinas do usuário geram lá. Além de pré-visualizar, permite FILTRAR/LIMPAR
// um CSV grande (centenas de MB / GB) 100% no navegador, em streaming, gravando
// um arquivo tratado novo — sem subir o arquivo gigante pra lugar nenhum.
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

/* ---- receita de tratamento lembrada por "tipo" de arquivo (localStorage) ---- */
// A chave ignora a parte numérica/data do nome: "RemessaParcelas14082026070123.csv"
// vira "RemessaParcelas". Assim, ao configurar uma vez, o mesmo tipo de arquivo
// já reabre com a receita pronta ("regras que eu já sei").
const chaveModelo = (nome) =>
  nome.replace(/\.[^.]+$/, '').replace(/[\s_\-]*\d[\d\s_\-]*$/, '').trim() || nome
const carregarReceita = (nome) => {
  try { return JSON.parse(localStorage.getItem('kard_etl_receita_' + chaveModelo(nome)) || 'null') } catch { return null }
}
const salvarReceita = (nome, receita) => {
  try { localStorage.setItem('kard_etl_receita_' + chaveModelo(nome), JSON.stringify(receita)) } catch { /* ignora */ }
}

/* ---- queries salvas + regras de agendamento (localStorage) ---- */
// Cada query: { id, nome, sql, prefixo, auto, intervaloMin, lastRun:{quando,arquivo,total,erro} }
const carregarQueries = () => { try { return JSON.parse(localStorage.getItem('kard_etl_queries') || '[]') } catch { return [] } }
const persistQueries = (qs) => { try { localStorage.setItem('kard_etl_queries', JSON.stringify(qs)) } catch { /* ignora */ } }
// Arquivo mais recente cujo nome começa com o prefixo (lista já vem ordenada desc por data).
const maisRecente = (lista, prefixo) => {
  const p = (prefixo || '').toLowerCase().trim()
  return (lista || []).find((a) => !p || a.nome.toLowerCase().startsWith(p)) || null
}

const fmtTamanho = (n) => {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
const fmtData = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR')

// Um passo do "stepper" guiado. Clicar rola até a seção correspondente.
function Passo({ n, titulo, sub, feito, atual, alvo }) {
  const cls = 'etl-step ' + (feito ? 'etl-feito' : atual ? 'etl-atual' : 'etl-pendente')
  const ir = () => document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <li className={cls} onClick={ir}>
      <span className="etl-step-num">{feito ? '✓' : n}</span>
      <span className="etl-step-txt"><b>{titulo}</b><small>{sub}</small></span>
    </li>
  )
}

export default function ETL() {
  const [handle, setHandle] = useState(null)
  const [precisaReconectar, setPrecisaReconectar] = useState(false)
  const [arquivos, setArquivos] = useState(null) // null = ainda não listou
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState(null) // { nome, tamanho, modificado, handle }

  // cabeçalho + receita de tratamento do arquivo selecionado
  const [cab, setCab] = useState(null) // { colunas, sep }
  const [encoding, setEncoding] = useState('utf-8')
  const [manter, setManter] = useState([])       // índices de colunas a manter
  const [removerVazias, setRemoverVazias] = useState([]) // índices que não podem ser vazios
  const [dedupIdx, setDedupIdx] = useState('')   // '' = sem dedup

  // execução do tratamento
  const [proc, setProc] = useState(null) // { pct, lidas, mantidas } enquanto roda
  const [resultado, setResultado] = useState(null)
  const [sinal, setSinal] = useState(null)

  // modo do painel do arquivo: 'sql' (DuckDB) ou 'simples' (streaming)
  const [modo, setModo] = useState('sql')
  // SQL / DuckDB
  const [sql, setSql] = useState('SELECT * FROM base LIMIT 100')
  const [duckBaseDe, setDuckBaseDe] = useState(null) // nome do arquivo já registrado no DuckDB
  const [duckColunas, setDuckColunas] = useState(null)
  const [duckCarregando, setDuckCarregando] = useState(false)
  const [duckRodando, setDuckRodando] = useState(false)
  const [duckErro, setDuckErro] = useState('')
  const [duckRes, setDuckRes] = useState(null) // { colunas, linhas, total, ms }
  const [duckExportado, setDuckExportado] = useState('')
  const [duckEnc, setDuckEnc] = useState('')    // '' = auto, 'utf-8', 'latin-1'
  const [duckDelim, setDuckDelim] = useState('') // '' = auto, ';', ',', '\\t'
  const [duckMeta, setDuckMeta] = useState(null) // { encoding, delim } efetivos

  // queries salvas + regras/agendamento
  const [queries, setQueries] = useState(() => carregarQueries())
  const [formSalvar, setFormSalvar] = useState(null) // { nome, prefixo, auto, intervalo } | null

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

  // lê os arquivos da pasta e devolve a lista ordenada (desc por data) — sem mexer no estado
  async function escanear(dir) {
    const arqs = []
    for await (const entry of dir.values()) {
      if (entry.kind !== 'file') continue
      try {
        const f = await entry.getFile()
        arqs.push({ nome: entry.name, tamanho: f.size, modificado: f.lastModified, handle: entry })
      } catch { /* arquivo bloqueado/em uso — ignora */ }
    }
    arqs.sort((a, b) => b.modificado - a.modificado)
    return arqs
  }

  async function listar(dir) {
    setCarregando(true); setErro(''); fecharSel()
    try {
      setArquivos(await escanear(dir))
    } catch (e) {
      setErro('Erro ao ler a pasta: ' + (e?.message || e))
      setArquivos([])
    } finally {
      setCarregando(false)
    }
  }

  function fecharSel() {
    setSel(null); setCab(null); setManter([]); setRemoverVazias([]); setDedupIdx('')
    setProc(null); setResultado(null)
    resetDuck()
  }

  function resetDuck() {
    setDuckBaseDe(null); setDuckColunas(null); setDuckRes(null); setDuckErro(''); setDuckExportado(''); setDuckMeta(null)
  }

  // trocar codificação/separador força reabrir a base com a nova opção
  function trocarDuckOpt(setter, valor) {
    setter(valor); setDuckBaseDe(null); setDuckColunas(null); setDuckRes(null)
  }

  // garante que o arquivo selecionado está registrado no DuckDB (view "base")
  async function garantirBase() {
    if (duckBaseDe === sel.nome && duckColunas) return
    setDuckCarregando(true); setDuckErro('')
    try {
      const meta = await abrirBase(sel.handle, { encoding: duckEnc || undefined, delim: duckDelim || undefined })
      setDuckColunas(meta.colunas); setDuckMeta({ encoding: meta.encoding, delim: meta.delim }); setDuckBaseDe(sel.nome)
    } finally {
      setDuckCarregando(false)
    }
  }

  async function rodar() {
    setDuckErro(''); setDuckRes(null); setDuckExportado(''); setDuckRodando(true)
    try {
      await garantirBase()
      setDuckRes(await rodarSql(sql))
    } catch (e) {
      setDuckErro('Erro no SQL: ' + (e?.message || e))
    } finally {
      setDuckRodando(false)
    }
  }

  async function exportar() {
    setDuckErro(''); setDuckExportado('')
    try {
      await garantirBase()
      const nome = await exportarSql(sql, 'recorte_' + (sel?.nome || 'base.csv'))
      setDuckExportado(nome)
    } catch (e) {
      if (e?.name !== 'AbortError') setDuckErro('Erro ao exportar: ' + (e?.message || e))
    }
  }

  /* ---- queries salvas ---- */
  function marcarStatus(id, info) {
    setQueries((prev) => {
      const next = prev.map((q) => (q.id === id ? { ...q, lastRun: { ...(q.lastRun || {}), ...info } } : q))
      persistQueries(next); return next
    })
  }
  function abrirFormSalvar() {
    setFormSalvar({ nome: '', prefixo: sel ? chaveModelo(sel.nome) : '', auto: false, intervalo: 0 })
  }
  function salvarQueryAtual() {
    const nome = (formSalvar.nome || '').trim()
    if (!nome) return
    const q = {
      id: 'q_' + Date.now().toString(36), nome, sql,
      prefixo: (formSalvar.prefixo || '').trim(),
      auto: !!formSalvar.auto,
      intervaloMin: Math.max(0, Number(formSalvar.intervalo) || 0),
    }
    setQueries((prev) => { const next = [...prev, q]; persistQueries(next); return next })
    setFormSalvar(null)
  }
  function toggleAuto(id) {
    setQueries((prev) => { const next = prev.map((q) => (q.id === id ? { ...q, auto: !q.auto } : q)); persistQueries(next); return next })
  }
  function excluirQuery(id) {
    setQueries((prev) => { const next = prev.filter((q) => q.id !== id); persistQueries(next); return next })
  }

  // roda uma query salva: acha o arquivo mais recente da regra, abre no DuckDB e executa
  async function rodarQuery(q, listaBase) {
    const lista = listaBase || arquivos || []
    const arq = maisRecente(lista, q.prefixo)
    if (!arq) { marcarStatus(q.id, { erro: `Nenhum arquivo começando com "${q.prefixo}"`, quando: Date.now() }); return }
    setModo('sql'); setSel(arq); resetDuck(); setSql(q.sql)
    setDuckRodando(true); setDuckErro('')
    try {
      const meta = await abrirBase(arq.handle, { encoding: duckEnc || undefined, delim: duckDelim || undefined })
      setDuckColunas(meta.colunas); setDuckMeta({ encoding: meta.encoding, delim: meta.delim }); setDuckBaseDe(arq.nome)
      const r = await rodarSql(q.sql)
      setDuckRes(r)
      marcarStatus(q.id, { quando: Date.now(), arquivo: arq.nome, total: r.total, erro: null })
    } catch (e) {
      setDuckErro(`Erro na query "${q.nome}": ` + (e?.message || e))
      marcarStatus(q.id, { quando: Date.now(), arquivo: arq.nome, erro: String(e?.message || e) })
    } finally {
      setDuckRodando(false)
    }
  }

  // auto-run ao (re)listar a pasta: roda as queries marcadas como "auto"
  useEffect(() => {
    if (arquivos === null || precisaReconectar) return
    const autos = queries.filter((q) => q.auto)
    if (!autos.length) return
    let vivo = true
    ;(async () => { for (const q of autos) { if (!vivo) break; await rodarQuery(q, arquivos) } })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivos])

  // agendamento enquanto a aba está aberta: re-escaneia a pasta e roda as queries vencidas
  useEffect(() => {
    if (!handle || precisaReconectar) return
    if (!queries.some((q) => q.auto && q.intervaloMin > 0)) return
    const id = setInterval(async () => {
      const perm = await handle.queryPermission({ mode: 'read' }).catch(() => 'denied')
      if (perm !== 'granted') return
      const lista = await escanear(handle).catch(() => null)
      if (!lista) return
      setArquivos(lista)
      const agora = Date.now()
      for (const q of queries) {
        if (!q.auto || !q.intervaloMin) continue
        if (agora - (q.lastRun?.quando || 0) >= q.intervaloMin * 60000) await rodarQuery(q, lista)
      }
    }, 60000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, precisaReconectar, queries])

  // selecionar arquivo: lê o cabeçalho e aplica a receita lembrada (se houver)
  async function selecionar(item, enc = encoding) {
    setSel(item); setProc(null); setResultado(null); setErro(''); resetDuck()
    setCab({ colunas: null, sep: null }) // "carregando cabeçalho"
    try {
      const f = await item.handle.getFile()
      const { colunas, sep } = await lerCabecalho(f, enc)
      setCab({ colunas, sep })
      const lembrada = carregarReceita(item.nome)
      if (lembrada && Array.isArray(lembrada.manterNomes)) {
        // remapeia por NOME de coluna (posição pode variar entre arquivos)
        const idxDe = (nome) => colunas.findIndex((c) => c === nome)
        setManter(lembrada.manterNomes.map(idxDe).filter((i) => i >= 0))
        setRemoverVazias((lembrada.removerVaziasNomes || []).map(idxDe).filter((i) => i >= 0))
        const di = lembrada.dedupNome ? idxDe(lembrada.dedupNome) : -1
        setDedupIdx(di >= 0 ? String(di) : '')
        if (lembrada.encoding) setEncoding(lembrada.encoding)
      } else {
        setManter(colunas.map((_, i) => i)) // padrão: manter todas
        setRemoverVazias([]); setDedupIdx('')
      }
    } catch (e) {
      setCab(null)
      setErro('Não consegui ler o cabeçalho: ' + (e?.message || e))
    }
  }

  function alternar(lista, setLista, idx) {
    setLista(lista.includes(idx) ? lista.filter((i) => i !== idx) : [...lista, idx].sort((a, b) => a - b))
  }

  async function tratar() {
    if (!sel || !cab?.colunas) return
    setErro(''); setResultado(null)
    const s = { abortado: false }; setSinal(s)
    setProc({ pct: 0, lidas: 0, mantidas: 0 })
    const receita = {
      sep: cab.sep,
      encoding,
      manter: manter.length ? manter : null,
      removerVazias,
      dedupIdx: dedupIdx === '' ? null : Number(dedupIdx),
    }
    // guarda a receita por NOME de coluna, pra reabrir pronta neste tipo de arquivo
    salvarReceita(sel.nome, {
      manterNomes: (manter.length ? manter : cab.colunas.map((_, i) => i)).map((i) => cab.colunas[i]),
      removerVaziasNomes: removerVazias.map((i) => cab.colunas[i]),
      dedupNome: dedupIdx === '' ? null : cab.colunas[Number(dedupIdx)],
      encoding,
    })
    try {
      const r = await processarArquivo(sel.handle, receita, (p) => setProc(p), s)
      setResultado(r)
    } catch (e) {
      if (e?.name === 'AbortError') { /* usuário cancelou o "salvar como" */ }
      else if (e?.message === 'cancelado') setErro('Tratamento cancelado.')
      else setErro('Falha ao tratar: ' + (e?.message || e))
    } finally {
      setProc(null); setSinal(null)
    }
  }

  const visiveis = (arquivos || []).filter((a) => !busca.trim() || a.nome.toLowerCase().includes(busca.toLowerCase().trim()))
  const nomePasta = handle?.name || 'pasta'
  const rodando = !!proc

  // estados do passo a passo guiado
  const passoConectado = !!handle && !precisaReconectar
  const passoArquivo = passoConectado && !!sel
  const passoTratado = passoArquivo && !!(duckRes || resultado || duckExportado)
  const passoAtual = !passoConectado ? 1 : !passoArquivo ? 2 : 3

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
          <ol className="etl-steps">
            <Passo n={1} titulo="Conectar pasta" sub={passoConectado ? nomePasta : 'pasta local / de rede'} feito={passoConectado} atual={passoAtual === 1} alvo="etl-conectar" />
            <Passo n={2} titulo="Escolher arquivo" sub={sel ? sel.nome : 'CSV da pasta'} feito={passoArquivo} atual={passoAtual === 2} alvo="etl-arquivos" />
            <Passo n={3} titulo="Tratar" sub={passoTratado ? 'concluído' : 'filtrar ou consultar (SQL)'} feito={passoTratado} atual={passoAtual === 3} alvo="etl-tratar" />
          </ol>

          <section className={'secao' + (passoAtual === 1 ? ' secao-ativa' : '')} id="etl-conectar">
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
            <section className={'secao' + (passoAtual === 2 ? ' secao-ativa' : '')} id="etl-arquivos">
              <h2>2. Arquivos na pasta <small>({visiveis.length})</small></h2>
              {!sel && visiveis.length > 0 && <p className="ajuda" style={{ marginTop: -6, marginBottom: 12 }}>👉 Clique num arquivo para tratar.</p>}
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
                        <tr key={a.nome} className={'linha-clicavel' + (sel?.nome === a.nome ? ' ativo' : '')} onClick={() => selecionar(a)} title="Selecionar para tratar">
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

          {arquivos !== null && !precisaReconectar && queries.length > 0 && (
            <section className="secao" id="etl-queries">
              <h2>Queries salvas <small>({queries.length})</small></h2>
              <p className="ajuda" style={{ marginTop: -6, marginBottom: 12 }}>
                Cada query roda no arquivo mais recente que começa com o nome da regra. As marcadas como <b>auto</b> rodam ao abrir a tela e re-checam sozinhas enquanto a aba fica aberta.
              </p>
              <div className="etl-qlist">
                {queries.map((q) => (
                  <div className="etl-qcard" key={q.id}>
                    <div className="etl-qcard-topo">
                      <b>{q.nome}</b>
                      <label className="etl-auto" title="Rodar automaticamente ao abrir / a cada intervalo">
                        <input type="checkbox" checked={q.auto} onChange={() => toggleAuto(q.id)} /> auto
                      </label>
                    </div>
                    <div className="ajuda" style={{ margin: '4px 0' }}>
                      Arquivo começa com <span className="mono">{q.prefixo || '(qualquer)'}</span>
                      {q.auto && q.intervaloMin ? ` · re-checa a cada ${q.intervaloMin} min` : ''}
                    </div>
                    {q.lastRun && (q.lastRun.quando || q.lastRun.erro) && (
                      <div className="ajuda" style={{ margin: '4px 0', color: q.lastRun.erro ? '#b4232a' : 'var(--verde-600)' }}>
                        {q.lastRun.erro
                          ? `⚠ ${q.lastRun.erro}`
                          : `✔ ${fmtNum(q.lastRun.total)} linhas · ${q.lastRun.arquivo} · ${fmtData(q.lastRun.quando)}`}
                      </div>
                    )}
                    <div className="acoes" style={{ marginTop: 8, gap: 8 }}>
                      <button className="btn-primario" onClick={() => rodarQuery(q)} disabled={duckRodando || duckCarregando}>Atualizar agora</button>
                      <button className="btn-refresh" onClick={() => { setModo('sql'); setSql(q.sql); document.getElementById('etl-tratar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>Abrir no editor</button>
                      <button className="btn-refresh" onClick={() => excluirQuery(q.id)}>Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sel && (
            <section className={'secao' + (passoAtual === 3 ? ' secao-ativa' : '')} id="etl-tratar">
              <h2>3. Tratar — {sel.nome}</h2>
              <p className="ajuda">
                {fmtTamanho(sel.tamanho)} · modificado {fmtData(sel.modificado)}. Tudo roda no seu navegador (streaming / DuckDB):
                o arquivo é lido em blocos, nada sobe pra nuvem — então tamanho e privacidade (CPF) não são problema.
              </p>

              <div className="etl-tabs">
                <button className={'etl-tab' + (modo === 'sql' ? ' ativo' : '')} onClick={() => setModo('sql')}>SQL (DuckDB)</button>
                <button className={'etl-tab' + (modo === 'simples' ? ' ativo' : '')} onClick={() => setModo('simples')}>Filtrar (simples)</button>
              </div>

              {modo === 'simples' && (!cab ? null : cab.colunas === null ? (
                <div className="loading">Lendo cabeçalho…</div>
              ) : cab.colunas.length === 0 ? (
                <div className="banner">Não encontrei colunas no cabeçalho. Confira a codificação abaixo.</div>
              ) : (
                <>
                  <div className="acoes" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="campo-modelo" style={{ margin: 0 }}>
                      <label>Codificação</label>
                      <select value={encoding} onChange={(e) => { setEncoding(e.target.value); selecionar(sel, e.target.value) }}>
                        <option value="utf-8">UTF-8</option>
                        <option value="iso-8859-1">ISO-8859-1 (Latin-1 / Windows-1252)</option>
                      </select>
                    </div>
                    <div className="campo-modelo" style={{ margin: 0 }}>
                      <label>Separador detectado</label>
                      <input type="text" value={cab.sep === '\t' ? '\\t (tab)' : cab.sep} readOnly style={{ width: 120 }} />
                    </div>
                    <div className="campo-modelo" style={{ margin: 0 }}>
                      <label>Deduplicar por coluna</label>
                      <select value={dedupIdx} onChange={(e) => setDedupIdx(e.target.value)}>
                        <option value="">— não deduplicar —</option>
                        {cab.colunas.map((c, i) => <option key={i} value={i}>{c || `(coluna ${i + 1})`}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 16 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <b>Colunas a manter</b>
                        <span className="ajuda" style={{ margin: 0 }}>
                          <button className="btn-refresh" onClick={() => setManter(cab.colunas.map((_, i) => i))}>Todas</button>{' '}
                          <button className="btn-refresh" onClick={() => setManter([])}>Nenhuma</button>
                        </span>
                      </div>
                      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #e5e8f0', borderRadius: 10, padding: 10 }}>
                        {cab.colunas.map((c, i) => (
                          <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={manter.includes(i)} onChange={() => alternar(manter, setManter, i)} />
                            <span>{c || <i style={{ color: '#98a' }}>(coluna {i + 1})</i>}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ marginBottom: 8 }}><b>Descartar linha se estiver vazia em…</b></div>
                      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #e5e8f0', borderRadius: 10, padding: 10 }}>
                        {cab.colunas.map((c, i) => (
                          <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={removerVazias.includes(i)} onChange={() => alternar(removerVazias, setRemoverVazias, i)} />
                            <span>{c || <i style={{ color: '#98a' }}>(coluna {i + 1})</i>}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="acoes" style={{ marginTop: 16 }}>
                    {!rodando && <button className="btn-primario" onClick={tratar}>Filtrar e salvar CSV tratado</button>}
                    {rodando && <button className="btn-secundario" onClick={() => sinal && (sinal.abortado = true)}>Cancelar</button>}
                    <span className="ajuda" style={{ margin: 0 }}>Mantendo {manter.length} de {cab.colunas.length} colunas.</span>
                  </div>
                  <p className="ajuda" style={{ marginTop: 8 }}>A receita fica lembrada para arquivos do tipo <b>{chaveModelo(sel.nome)}</b> — na próxima vez já abre pronta.</p>

                  {proc && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ height: 12, background: '#e9edf6', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ width: proc.pct + '%', height: '100%', background: 'linear-gradient(90deg,#2563eb,#22c55e)', transition: 'width .2s' }} />
                      </div>
                      <p className="ajuda" style={{ marginTop: 6 }}>{proc.pct}% · lidas {fmtNum(proc.lidas)} · mantidas {fmtNum(proc.mantidas)}</p>
                    </div>
                  )}

                  {resultado && (
                    <div className="banner" style={{ marginTop: 14, background: '#eafaf0', borderColor: '#bfe6cd' }}>
                      ✔ Pronto! Arquivo <b>{resultado.arquivo}</b> gravado.<br />
                      Linhas lidas: <b>{fmtNum(resultado.lidas)}</b> · mantidas: <b>{fmtNum(resultado.mantidas)}</b> · removidas: <b>{fmtNum(resultado.removidas)}</b>.
                    </div>
                  )}
                </>
              ))}

              {modo === 'sql' && (
                <>
                  <div className="etl-panel">
                    <div className="etl-panel-cab"><h3>Leitura do arquivo</h3></div>
                    <div className="acoes" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 0 }}>
                      <div className="campo-modelo" style={{ margin: 0 }}>
                        <label>Codificação</label>
                        <select value={duckEnc} onChange={(e) => trocarDuckOpt(setDuckEnc, e.target.value)}>
                          <option value="">Auto</option>
                          <option value="utf-8">UTF-8</option>
                          <option value="latin-1">Latin-1 / Windows-1252</option>
                        </select>
                      </div>
                      <div className="campo-modelo" style={{ margin: 0 }}>
                        <label>Separador</label>
                        <select value={duckDelim} onChange={(e) => trocarDuckOpt(setDuckDelim, e.target.value)}>
                          <option value="">Auto</option>
                          <option value=";">; (ponto e vírgula)</option>
                          <option value=",">, (vírgula)</option>
                          <option value="\t">tab</option>
                          <option value="|">| (pipe)</option>
                        </select>
                      </div>
                    </div>
                    {duckColunas ? (
                      <div style={{ marginTop: 14 }}>
                        <span className="etl-rotulo">
                          Colunas detectadas{duckMeta ? ` · ${duckMeta.encoding}, separador ${duckMeta.delim === '\t' ? 'tab' : duckMeta.delim}` : ''}
                        </span>
                        <div className="etl-cols">
                          {duckColunas.map((c, i) => (
                            <span key={i} className="etl-col-chip">{c.nome}<small>{c.tipo}</small></span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="ajuda" style={{ marginTop: 12, marginBottom: 0 }}>As colunas aparecem aqui depois de rodar a 1ª consulta.</p>
                    )}
                  </div>

                  <div className="etl-panel">
                    <div className="etl-panel-cab"><h3>Consulta</h3></div>
                    <span className="etl-rotulo">Modelos</span>
                    <div className="etl-modelos">
                      <button className="etl-chip destaque" onClick={() => setSql(SQL_RECORTE_CLT)}>Recorte do mês (CLT)</button>
                      <button className="etl-chip" onClick={() => setSql('SELECT * FROM base LIMIT 100')}>Amostra (100 linhas)</button>
                      {duckColunas && <button className="etl-chip" onClick={() => setSql('SELECT count(*) AS linhas FROM base')}>Contar linhas</button>}
                    </div>

                    <span className="etl-rotulo" style={{ marginTop: 16 }}>
                      SQL <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0, color: 'var(--muted)' }}>— a tabela chama-se <span className="mono">base</span></span>
                    </span>
                    <textarea className="etl-sql" value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />

                    <div className="acoes" style={{ marginTop: 12 }}>
                      <button className="btn-primario" onClick={rodar} disabled={duckRodando || duckCarregando}>
                        {duckCarregando ? 'Abrindo no DuckDB…' : duckRodando ? 'Rodando…' : '▶ Rodar'}
                      </button>
                      <button className="btn-secundario" onClick={exportar} disabled={duckRodando || duckCarregando}>Exportar CSV</button>
                      <button className="btn-refresh" onClick={abrirFormSalvar}>💾 Salvar query</button>
                    </div>

                    {formSalvar && (
                      <div className="etl-panel" style={{ marginTop: 12, background: '#fff' }}>
                        <span className="etl-rotulo">Salvar esta query</span>
                        <div className="acoes" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 0 }}>
                          <div className="campo-modelo" style={{ margin: 0 }}>
                            <label>Nome</label>
                            <input type="text" value={formSalvar.nome} placeholder="Ex.: Recorte CLT do mês" onChange={(e) => setFormSalvar({ ...formSalvar, nome: e.target.value })} />
                          </div>
                          <div className="campo-modelo" style={{ margin: 0 }}>
                            <label>Arquivo começa com</label>
                            <input type="text" value={formSalvar.prefixo} placeholder="Ex.: RemessaParcelas" onChange={(e) => setFormSalvar({ ...formSalvar, prefixo: e.target.value })} />
                          </div>
                          <label className="etl-auto"><input type="checkbox" checked={formSalvar.auto} onChange={(e) => setFormSalvar({ ...formSalvar, auto: e.target.checked })} /> rodar ao abrir</label>
                          {formSalvar.auto && (
                            <div className="campo-modelo" style={{ margin: 0 }}>
                              <label>Re-checar a cada (min)</label>
                              <input type="number" min="0" value={formSalvar.intervalo} onChange={(e) => setFormSalvar({ ...formSalvar, intervalo: e.target.value })} style={{ width: 130 }} />
                            </div>
                          )}
                        </div>
                        <div className="acoes" style={{ marginTop: 10 }}>
                          <button className="btn-primario" onClick={salvarQueryAtual} disabled={!formSalvar.nome.trim()}>Salvar</button>
                          <button className="btn-refresh" onClick={() => setFormSalvar(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {duckErro && <div className="banner" style={{ marginTop: 14 }}>{duckErro}</div>}

                  {duckExportado && (
                    <div className="banner" style={{ marginTop: 14, background: '#eafaf0', borderColor: '#bfe6cd' }}>
                      ✔ Exportado: <b>{duckExportado}</b>.
                    </div>
                  )}

                  {duckRes && (
                    <div className="etl-panel" style={{ marginTop: 14 }}>
                      <div className="etl-panel-cab">
                        <h3>Resultado</h3>
                        <span className="ajuda" style={{ margin: 0 }}>
                          <b>{fmtNum(duckRes.total)}</b> linha(s) · {duckRes.ms} ms
                          {duckRes.total > duckRes.linhas.length ? ` · 1ªs ${fmtNum(duckRes.linhas.length)}` : ''}
                        </span>
                      </div>
                      <div className="preview-wrap" style={{ maxHeight: 380, overflow: 'auto', background: '#fff', borderRadius: 10, border: '1px solid var(--borda)' }}>
                        <table className="preview">
                          <thead><tr>{duckRes.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                          <tbody>
                            {duckRes.linhas.map((r, i) => (
                              <tr key={i}>{duckRes.colunas.map((c) => <td key={c} className="mono">{r[c] == null ? '' : String(r[c])}</td>)}</tr>
                            ))}
                            {duckRes.linhas.length === 0 && <tr><td colSpan={duckRes.colunas.length || 1} className="empty">Nenhuma linha no resultado.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
