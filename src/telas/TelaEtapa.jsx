import { useEffect, useMemo, useState } from 'react'
import {
  criarLista, listarListas, dispararLista, importarForaDaBase, lerEnviosListas,
} from '../api/n8n'
import PillStatus from '../componentes/PillStatus'

// Tela "espelho" reusada pelas etapas (Educacional, Cobrança) — modelo MAIL MERGE:
// 1) Upload do arquivo (RF-26) — CSV com cnpj + email dos clientes
// 2) Conferência + salvar como LISTA nomeada com etiquetas (RF-27/28)
//    → o n8n CRUZA cada linha (CNPJ **e** e-mail juntos) com a base prospectada
//      (rh_enriquecimento). Só quem casa fica elegível para envio.
//    → linhas "fora da base" aparecem aqui e podem ser importadas com um clique.
// 3) Disparo por LISTA salva (RF-19) — escolhe lista + modelo de e-mail
// 4) Acompanhamento (RF-24/34) — log de envios (cnpj/email/data) p/ analytics

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
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const [carga, setCarga] = useState(null)

  // metadados da lista (mail merge)
  const [nomeLista, setNomeLista] = useState('')
  const [etiquetas, setEtiquetas] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState(null) // { lista_id, total, casados, fora[] }
  const [msg, setMsg] = useState('')

  // gatilho para as seções de disparo/acompanhamento recarregarem as listas
  const [versaoListas, setVersaoListas] = useState(0)

  function processarArquivo(arquivo) {
    if (!arquivo) return
    setNomeArquivo(arquivo.name)
    setResultado(null)
    setMsg('')
    if (!nomeLista) setNomeLista(arquivo.name.replace(/\.csv$/i, ''))
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

  // Conferência da carga (RF-27): colunas esperadas vs presentes.
  const conferencia = useMemo(() => {
    if (!carga) return null
    const esperadas = etapa.colunasEsperadas
    const presentes = carga.cabecalho
    const faltando = esperadas.filter((c) => !presentes.includes(c))
    const extras = presentes.filter((c) => !esperadas.includes(c))
    return { faltando, extras, total: carga.registros.length }
  }, [carga, etapa])

  // chave do cruzamento: cnpj (ou cnpj_empregador na Cobrança) + email
  const temChaves = useMemo(() => {
    if (!carga) return false
    const cols = carga.cabecalho
    return (cols.includes('cnpj') || cols.includes('cnpj_empregador')) && cols.includes('email')
  }, [carga])

  async function salvarLista() {
    if (!carga) return
    try {
      setSalvando(true)
      setMsg('Salvando lista e cruzando com a base prospectada...')
      const r = await criarLista(
        nomeLista || 'Lista sem nome',
        etiquetas.split(',').map((t) => t.trim()).filter(Boolean),
        etapa.valorEtapa,
        carga.registros,
      )
      setResultado(r)
      setVersaoListas((v) => v + 1)
      setMsg(`Lista "${r.nome}" salva: ${r.casados} de ${r.total} casaram com a base.`)
    } catch (err) {
      setMsg('Erro ao salvar a lista: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function importarFora() {
    if (!resultado) return
    try {
      setMsg('Importando contatos fora da base...')
      const r = await importarForaDaBase(resultado.lista_id)
      setMsg(`${r.importados} contato(s) importados para a base. Agora todos da lista estão elegíveis.`)
      setResultado({ ...resultado, casados: resultado.total, fora: [] })
      setVersaoListas((v) => v + 1)
    } catch (err) {
      setMsg('Erro ao importar: ' + err.message)
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
          Envie o arquivo da etapa <b>{etapa.titulo}</b> (.csv) com <b>cnpj</b> e <b>email</b> dos clientes.
          O sistema cruza cada linha com a base prospectada — só quem casa (CNPJ + e-mail) recebe o disparo.
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
              <div className="dropzone-sub">Clique para substituir</div>
            </>
          ) : (
            <>
              <div className="dropzone-titulo">Arraste o CSV ou <span className="dropzone-link">escolha um arquivo</span></div>
              <div className="dropzone-sub">Apenas .csv no formato {etapa.formato}</div>
            </>
          )}
        </label>
      </section>

      {/* 2) CONFERÊNCIA + SALVAR LISTA ------------------------------- */}
      {carga && conferencia && (
        <section className="secao">
          <h2>2. Conferência e lista <small>(RF-27/28)</small></h2>
          <div className="resumo-carga">
            <div><b>{conferencia.total}</b> registros lidos</div>
            {conferencia.faltando.length > 0 ? (
              <div className="erro">Colunas faltando: {conferencia.faltando.join(', ')}</div>
            ) : (
              <div className="ok">Todas as colunas esperadas presentes ✓</div>
            )}
            {conferencia.extras.length > 0 && (
              <div>Colunas extras (vão junto no merge): {conferencia.extras.join(', ')}</div>
            )}
            {!temChaves && (
              <div className="erro">O arquivo precisa das colunas <b>cnpj</b> (ou cnpj_empregador) e <b>email</b> para o cruzamento.</div>
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

          <div className="campo-modelo">
            <label>Nome da lista</label>
            <input
              type="text"
              value={nomeLista}
              placeholder="ex.: Carga julho educacional"
              onChange={(e) => setNomeLista(e.target.value)}
            />
          </div>
          <div className="campo-modelo">
            <label>Etiquetas (separadas por vírgula)</label>
            <input
              type="text"
              value={etiquetas}
              placeholder="ex.: julho, prioridade, sp"
              onChange={(e) => setEtiquetas(e.target.value)}
            />
          </div>

          <div className="acoes">
            <button
              className="btn-primario"
              style={{ background: etapa.cor }}
              disabled={!temChaves || salvando || !nomeLista.trim()}
              onClick={salvarLista}
            >
              {salvando ? 'Cruzando…' : 'Salvar lista e cruzar com a base'}
            </button>
          </div>
          {msg && <div className="banner">{msg}</div>}

          {/* resultado do cruzamento */}
          {resultado && (
            <div className="resumo-carga" style={{ marginTop: 14 }}>
              <div><b>{resultado.casados}</b> de <b>{resultado.total}</b> casaram com a base prospectada (elegíveis para envio).</div>
              {resultado.fora && resultado.fora.length > 0 && (
                <>
                  <div className="erro">{resultado.fora.length} fora da base (não recebem e-mail):</div>
                  <div className="preview-wrap">
                    <table className="preview">
                      <thead>
                        <tr><th>Nome</th><th>CNPJ</th><th>E-mail</th></tr>
                      </thead>
                      <tbody>
                        {resultado.fora.slice(0, 20).map((f, i) => (
                          <tr key={i}>
                            <td>{f.nome || '—'}</td>
                            <td>{f.cnpj || '—'}</td>
                            <td>{f.email || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="acoes">
                    <button className="btn-secundario" onClick={importarFora}>
                      Importar {resultado.fora.length} contato(s) para a base
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* 3) DISPARO POR LISTA + 4) ACOMPANHAMENTO -------------------- */}
      <DisparoPorLista etapa={etapa} versaoListas={versaoListas} />
    </div>
  )
}

// Seções 3 (disparo por lista salva) e 4 (acompanhamento/analytics de envios).
function DisparoPorLista({ etapa, versaoListas }) {
  const [listas, setListas] = useState([])
  const [envios, setEnvios] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [disparando, setDisparando] = useState(false)
  const [listaSel, setListaSel] = useState('')
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('')
  const [modelo, setModelo] = useState((etapa.modelos && etapa.modelos[0]?.id) || '')

  async function carregar() {
    setLoading(true); setErro('')
    try {
      const [ls, es] = await Promise.all([listarListas(), lerEnviosListas()])
      setListas(ls)
      setEnvios(es)
    } catch (e) {
      setErro('Não consegui ler as listas do n8n (' + e.message + ')')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [versaoListas])

  // só listas desta etapa; filtro opcional por etiqueta
  const daEtapa = listas.filter((l) => (l.etapa || 'Educacional') === etapa.valorEtapa)
  const filtradas = filtroEtiqueta
    ? daEtapa.filter((l) => (l.etiquetas || '').toLowerCase().includes(filtroEtiqueta.toLowerCase()))
    : daEtapa
  const lista = filtradas.find((l) => String(l.id) === String(listaSel)) || null

  const modeloAtual = (etapa.modelos || []).find((m) => m.id === modelo)

  const enviosDaEtapa = envios.filter((e) => (e.etapa || '') === etapa.valorEtapa)

  async function disparar() {
    if (!lista) return
    if (!window.confirm(`Disparar o modelo "${modeloAtual?.nome || modelo}" para os ${lista.casados} contato(s) casados da lista "${lista.nome}"?`)) return
    try {
      setDisparando(true)
      setMsg('Disparando…')
      const r = await dispararLista(lista.id, modelo)
      setMsg(`Disparo concluído: ${r.enviados} enviado(s), ${r.falhas} falha(s).`)
      carregar()
    } catch (e) {
      setMsg('Erro no disparo: ' + e.message)
    } finally {
      setDisparando(false)
    }
  }

  return (
    <section className="secao">
      <h2>3. Disparo por lista e acompanhamento <small>(RF-19/24/34)</small></h2>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : (
        <>
          {erro && <div className="banner">{erro}</div>}

          <div className="campo-modelo">
            <label>Filtrar por etiqueta</label>
            <input
              type="text"
              value={filtroEtiqueta}
              placeholder="ex.: julho"
              onChange={(e) => setFiltroEtiqueta(e.target.value)}
            />
          </div>

          <div className="campo-modelo">
            <label>Lista salva ({filtradas.length} nesta etapa)</label>
            <select value={listaSel} onChange={(e) => setListaSel(e.target.value)}>
              <option value="">— escolha uma lista —</option>
              {filtradas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} · {l.casados}/{l.total} casados · {l.etiquetas || 'sem etiqueta'} · {l.criada_em}
                </option>
              ))}
            </select>
          </div>

          {etapa.modelos && etapa.modelos.length > 0 && (
            <div className="campo-modelo">
              <label>Modelo de e-mail</label>
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
              style={{ background: etapa.cor }}
              disabled={disparando || !lista || !lista.casados}
              onClick={disparar}
            >
              {disparando ? 'Disparando…' : lista
                ? `Disparar "${lista.nome}" (${lista.casados} casados)`
                : 'Disparar (escolha uma lista)'}
            </button>
            <button className="btn-refresh" onClick={carregar}>Atualizar</button>
          </div>
          {msg && <div className="banner">{msg}</div>}

          {/* 4) acompanhamento: log de envios (analytics) */}
          <div className="ajuda" style={{ marginTop: 18 }}>
            {enviosDaEtapa.length} envio(s) registrados nesta etapa.
          </div>
          <table className="preview">
            <thead>
              <tr><th>Data</th><th>Lista</th><th>Etiquetas</th><th>CNPJ</th><th>E-mail</th><th>Modelo</th><th>Status</th></tr>
            </thead>
            <tbody>
              {enviosDaEtapa.slice(0, 20).map((e, i) => (
                <tr key={e.id ?? i}>
                  <td>{e.data_envio || '—'}</td>
                  <td>{e.lista || '—'}</td>
                  <td>{e.etiquetas || '—'}</td>
                  <td>{e.cnpj || '—'}</td>
                  <td>{e.email || '—'}</td>
                  <td>{e.modelo || '—'}</td>
                  <td><PillStatus status={e.status} /></td>
                </tr>
              ))}
              {enviosDaEtapa.length === 0 && (
                <tr><td colSpan={7} className="empty">Nenhum envio registrado nesta etapa.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
