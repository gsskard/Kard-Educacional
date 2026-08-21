import { useMemo, useRef, useState } from 'react'
import { enviarEmailEmpregadorTeste } from '../api/n8n'

// Aba "Disparar" da tela Disparos — fluxo único de envio em LOTE dos 2 modelos
// educativos de e-mail para empregadores.
//   1. Modelo + canal  2. CSV de destinatários (email + nome)  3. Enviar (teste 1 / lote)
// O merge é só do nome (*|NOME|*); manda direto pra cada linha do CSV (sem cruzamento).
// O loop do lote acontece aqui no front, 1 chamada por linha ao webhook já testado.

const MODELOS_EMP = [
  { id: 'repasse', nome: 'Repasse (dia 20)', assunto: 'Hoje (dia 20) é o prazo do repasse - Crédito do Trabalhador' },
  { id: 'escrituracao', nome: 'Prazo de escrituração', assunto: 'O prazo para a escrituração está quase vencendo' },
]
const CANAIS = [
  { id: 'outlook', nome: 'Outlook', dica: 'Microsoft Graph — entrega direto na caixa' },
  { id: 'cybertalk', nome: 'CyberTalk', dica: 'Passa pelo assistente (eventos/tracking)' },
]
const EMAIL_PADRAO = 'gabriella.silva@kard.com.br'
const CONCORRENCIA = 4

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)

// CSV simples (detecta ; ou ,), sem dependência.
function parseCSV(texto) {
  const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  if (!linhas.length) return { cabecalho: [], registros: [] }
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ','
  const cabecalho = linhas[0].split(sep).map((c) => c.trim().replace(/^﻿/, ''))
  const registros = linhas.slice(1).map((l) => {
    const v = l.split(sep)
    const o = {}
    cabecalho.forEach((c, i) => (o[c] = (v[i] ?? '').trim()))
    return o
  })
  return { cabecalho, registros }
}

export default function DispararEmpregadores() {
  const [canal, setCanal] = useState('outlook')
  const [modelo, setModelo] = useState('escrituracao')

  const [carga, setCarga] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const inputArq = useRef(null)

  // teste unitário
  const [testeDestino, setTesteDestino] = useState(EMAIL_PADRAO)
  const [testeNome, setTesteNome] = useState('Kard Teste LTDA')
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [resultadoTeste, setResultadoTeste] = useState(null)

  // lote
  const [enviandoLote, setEnviandoLote] = useState(false)
  const [progresso, setProgresso] = useState(null) // { feitos, total, falhas }
  const [resultadoLote, setResultadoLote] = useState(null) // { total, enviados, falhas, erros[] }
  const [msg, setMsg] = useState('')

  const modeloAtual = MODELOS_EMP.find((m) => m.id === modelo) || MODELOS_EMP[0]
  const canalAtual = CANAIS.find((c) => c.id === canal) || CANAIS[0]

  // Detecção de colunas + destinatários válidos (email + nome), dedup por e-mail.
  const analise = useMemo(() => {
    if (!carga) return null
    const cols = carga.cabecalho
    const cEmail = cols.find((c) => /e-?mail/i.test(c))
    const cNome = cols.find((c) => /nome|empresa|raz[aã]o/i.test(c))
    const vistos = new Set()
    const validos = []
    let invalidos = 0
    carga.registros.forEach((r) => {
      const email = String(cEmail ? r[cEmail] : '').trim().toLowerCase()
      const nome = String(cNome ? r[cNome] : '').trim()
      if (!emailValido(email) || vistos.has(email)) { invalidos++; return }
      vistos.add(email)
      validos.push({ email, nome })
    })
    return { cEmail, cNome, validos, invalidos, total: carga.registros.length }
  }, [carga])

  function processarArquivo(arquivo) {
    if (!arquivo) return
    setNomeArquivo(arquivo.name)
    setResultadoLote(null); setProgresso(null); setMsg('')
    const leitor = new FileReader()
    leitor.onload = () => setCarga(parseCSV(String(leitor.result)))
    leitor.readAsText(arquivo, 'utf-8')
  }
  function aoSoltar(e) { e.preventDefault(); setArrastando(false); processarArquivo(e.dataTransfer.files?.[0]) }

  async function enviarTeste() {
    if (!emailValido(testeDestino) || !testeNome.trim()) return
    if (!window.confirm(`Enviar 1 teste do modelo "${modeloAtual.nome}" via ${canalAtual.nome} para ${testeDestino}?`)) return
    setEnviandoTeste(true); setResultadoTeste(null)
    try {
      const r = await enviarEmailEmpregadorTeste({ canal, modelo, destino: testeDestino.trim(), nome: testeNome.trim() })
      setResultadoTeste(r)
    } catch (e) {
      setResultadoTeste({ status: 'falha', resposta: e.message })
    } finally {
      setEnviandoTeste(false)
    }
  }

  async function enviarLote() {
    if (!analise || !analise.validos.length) return
    const alvos = analise.validos
    if (!window.confirm(`Disparar o modelo "${modeloAtual.nome}" via ${canalAtual.nome} para ${alvos.length} destinatário(s)?\n\nIsso envia ${alvos.length} e-mail(s) de verdade.`)) return
    setEnviandoLote(true); setResultadoLote(null); setMsg('')
    let feitos = 0, falhas = 0
    const erros = []
    setProgresso({ feitos, total: alvos.length, falhas })
    let idx = 0
    async function worker() {
      while (idx < alvos.length) {
        const d = alvos[idx++]
        try {
          const r = await enviarEmailEmpregadorTeste({ canal, modelo, destino: d.email, nome: d.nome })
          const ok = r && (r.status === 'enviado' || r.status === 'aceito_pela_api')
          if (!ok) { falhas++; erros.push({ email: d.email, motivo: (r && r.status) || 'falha' }) }
        } catch (e) {
          falhas++; erros.push({ email: d.email, motivo: e.message })
        }
        feitos++
        setProgresso({ feitos, total: alvos.length, falhas })
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, alvos.length) }, worker))
      setResultadoLote({ total: alvos.length, enviados: alvos.length - falhas, falhas, erros })
    } catch (e) {
      setMsg('Erro inesperado no lote: ' + e.message)
    } finally {
      setEnviandoLote(false)
    }
  }

  const okTeste = resultadoTeste && (resultadoTeste.status === 'enviado' || resultadoTeste.status === 'aceito_pela_api')
  const pct = progresso && progresso.total ? Math.round((progresso.feitos / progresso.total) * 100) : 0

  return (
    <>
      {/* 1. MODELO + CANAL ------------------------------------------------ */}
      <div className="bloco">
        <h2>1. Modelo e canal</h2>
        <p className="explica">Escolha qual dos <b>2 modelos educativos</b> disparar e por qual canal. O nome de cada linha do CSV entra no lugar do <span className="mono">*|NOME|*</span>.</p>

        <label className="campo"><span>Modelo</span>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {MODELOS_EMP.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <p className="ajuda">Assunto: “{modeloAtual.assunto}”</p>

        <label className="campo"><span>Canal de envio</span></label>
        <div className="abas" style={{ marginBottom: 8 }}>
          {CANAIS.map((c) => (
            <button key={c.id} data-etapa={c.id === 'outlook' ? 'educacional' : 'cobranca'}
              aria-pressed={canal === c.id} onClick={() => setCanal(c.id)}>{c.nome}</button>
          ))}
        </div>
        <p className="ajuda" style={{ marginTop: -2 }}>
          {canalAtual.dica}{canal === 'cybertalk' && ' — obs.: pode voltar “aceito” sem entregar (contenção do assistente).'}
        </p>
      </div>

      {/* 2. CSV ----------------------------------------------------------- */}
      <div className="bloco">
        <h2>2. Lista de destinatários <small>(.csv)</small></h2>
        <p className="explica">Suba um CSV com as colunas <b>email</b> e <b>nome</b> (razão social/empresa). Cada linha vira um e-mail.</p>
        <div className={'area' + (arrastando ? ' hot' : '')}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragEnter={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={aoSoltar}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>{nomeArquivo ? '📄' : '📤'}</div>
          <div className="frase">{nomeArquivo || <>Arraste o CSV ou <a onClick={() => inputArq.current?.click()}>escolha um arquivo</a></>}</div>
          <div className="obs">{nomeArquivo ? 'Clique abaixo para trocar' : 'Colunas: email, nome'}</div>
          <input ref={inputArq} type="file" accept=".csv,.txt,text/csv" style={{ display: 'none' }}
            onChange={(e) => processarArquivo(e.target.files?.[0])} />
        </div>

        {carga && analise && (
          <div style={{ marginTop: 18 }}>
            {!analise.cEmail ? (
              <div className="erro-box">O CSV precisa de uma coluna de <b>e-mail</b>. Colunas encontradas: {carga.cabecalho.join(', ') || 'nenhuma'}.</div>
            ) : (
              <>
                <div className="retorno-carga">
                  <div><div className="retorno-num">{analise.validos.length}</div><div className="retorno-rot">destinatários válidos</div></div>
                  {analise.invalidos > 0 && <div><div className="retorno-num fraco">{analise.invalidos}</div><div className="retorno-rot">inválidos/repetidos</div></div>}
                  <div style={{ fontSize: 13, color: 'var(--fraco)', marginLeft: 'auto', alignSelf: 'center' }}>
                    email → <span className="mono">{analise.cEmail}</span>{analise.cNome ? <> · nome → <span className="mono">{analise.cNome}</span></> : ' · (sem coluna de nome — *|NOME|* fica vazio)'}
                  </div>
                </div>
                <table>
                  <thead><tr><th>E-mail</th><th>Nome (merge)</th></tr></thead>
                  <tbody>
                    {analise.validos.slice(0, 5).map((d, i) => (
                      <tr key={i}><td className="mono">{d.email}</td><td>{d.nome || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
                {analise.validos.length > 5 && <p className="ajuda" style={{ marginTop: 8 }}>Mostrando 5 de {analise.validos.length}.</p>}
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. ENVIAR -------------------------------------------------------- */}
      <div className="bloco">
        <h2>3. Enviar</h2>

        <p className="explica" style={{ marginBottom: 10 }}><b>Teste rápido</b> — manda 1 e-mail pra você conferir o layout antes do lote.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
          <label className="campo" style={{ marginBottom: 0, flex: '1 1 240px' }}><span>E-mail de teste</span>
            <input type="text" value={testeDestino} onChange={(e) => setTesteDestino(e.target.value)} /></label>
          <label className="campo" style={{ marginBottom: 0, flex: '1 1 200px' }}><span>Nome</span>
            <input type="text" value={testeNome} onChange={(e) => setTesteNome(e.target.value)} /></label>
          <button className={'bt claro'} disabled={enviandoTeste || !emailValido(testeDestino) || !testeNome.trim()} onClick={enviarTeste} style={{ height: 44 }}>
            {enviandoTeste ? 'Enviando…' : 'Enviar 1 teste'}
          </button>
        </div>
        {resultadoTeste && (
          <p className="ajuda" style={{ margin: '0 0 6px' }}>
            <span className={'st ' + (okTeste ? 'ok' : 'err')}>{okTeste ? (resultadoTeste.status === 'enviado' ? 'enviado (Outlook)' : 'aceito (CyberTalk)') : 'falha'}</span>
            {resultadoTeste.aviso ? ' ' + resultadoTeste.aviso : (resultadoTeste.resposta ? ' ' + resultadoTeste.resposta : '')}
          </p>
        )}

        <div style={{ height: 1, background: 'var(--linha)', margin: '18px 0' }} />

        <p className="explica" style={{ marginBottom: 10 }}><b>Disparo em lote</b> — envia para todos os destinatários válidos do CSV.</p>
        <div className="acoes">
          <button className={'bt' + (canal === 'cybertalk' ? ' amb' : '')}
            disabled={enviandoLote || !analise || !analise.validos.length}
            onClick={enviarLote}>
            {enviandoLote ? 'Disparando…' : analise && analise.validos.length ? `Disparar em lote (${analise.validos.length}) via ${canalAtual.nome}` : 'Disparar em lote (suba um CSV)'}
          </button>
        </div>

        {progresso && (
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 10, background: '#EDF1F5', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: 'var(--verde)', transition: 'width .2s' }} />
            </div>
            <p className="ajuda" style={{ margin: '6px 0 0' }}>{progresso.feitos} de {progresso.total} processados{progresso.falhas ? ` · ${progresso.falhas} falha(s)` : ''}</p>
          </div>
        )}

        {msg && <div className="banner" style={{ marginTop: 12 }}>{msg}</div>}

        {resultadoLote && (
          <div className="banner" style={{ marginTop: 14 }}>
            <div style={{ marginBottom: resultadoLote.erros.length ? 8 : 0 }}>
              <span className="st ok">{resultadoLote.enviados} enviado(s)</span>
              {resultadoLote.falhas > 0 && <span className="st err" style={{ marginLeft: 8 }}>{resultadoLote.falhas} falha(s)</span>}
              <span style={{ marginLeft: 10, color: 'var(--fraco)' }}>de {resultadoLote.total} · via {canalAtual.nome}</span>
            </div>
            {resultadoLote.erros.length > 0 && (
              <table>
                <thead><tr><th>E-mail com falha</th><th>Motivo</th></tr></thead>
                <tbody>
                  {resultadoLote.erros.slice(0, 20).map((e, i) => (
                    <tr key={i}><td className="mono">{e.email}</td><td>{e.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  )
}
