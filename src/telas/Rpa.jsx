import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listarJobsRpa, salvarJobRpa, apagarJobRpa, ativarJobRpa, executarJobRpa,
  listarExecucoesRpa, cancelarExecucaoRpa, listarAgentesRpa,
} from '../api/n8n'
import { JobRpa } from '../models/JobRpa'
import { LINGUAGENS, MODELOS_CODIGO, PRESETS_CRON, descreverCron, validarCron } from '../config/rpa'
import './Rpa.css'

// Tela RPA: cria e agenda jobs de automação (Python/Node/bash). Cada job roda
// na nuvem (servidor do n8n) ou numa máquina com o agente instalado — quem
// decide é o campo "Onde roda". O painel só fala com os webhooks /rpa/* do
// workflow "RPA — API"; toda a execução e o agendamento vivem no n8n.
// Contrato completo: docs/RPA.md.

const RECARGA_MS = 15000

// Os webhooks podem ainda não existir na instância — erro genérico não ajuda.
function mensagemErro(err) {
  const texto = String(err?.message || err)
  if (/HTTP 404/.test(texto)) {
    return 'Os webhooks /rpa/* não responderam (404). Confira se os workflows "RPA — API" e "RPA — Agendador" estão publicados no n8n — passo a passo em docs/RPA.md.'
  }
  return texto
}

const quando = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Editor de código simples: textarea monoespaçada que aceita Tab sem
// perder o foco (senão não dá para indentar Python).
function EditorCodigo({ valor, aoMudar, linguagem }) {
  const ref = useRef(null)
  const linhas = String(valor || '').split('\n').length

  function teclado(ev) {
    if (ev.key !== 'Tab') return
    ev.preventDefault()
    const el = ref.current
    const { selectionStart: ini, selectionEnd: fim } = el
    const novo = valor.slice(0, ini) + '    ' + valor.slice(fim)
    aoMudar(novo)
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = ini + 4 })
  }

  return (
    <div className="rpa-editor">
      <div className="rpa-editor-topo">
        <span>{LINGUAGENS[linguagem]?.comando || ''}</span>
        <span className="rpa-editor-linhas">{linhas} linha{linhas === 1 ? '' : 's'}</span>
      </div>
      <textarea
        ref={ref}
        className="rpa-codigo"
        spellCheck="false"
        value={valor}
        onKeyDown={teclado}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </div>
  )
}

// Lista chave/valor das variáveis de ambiente do job.
function Variaveis({ variaveis, aoMudar }) {
  const pares = Object.entries(variaveis || {})

  function trocarChave(antiga, nova) {
    const saida = {}
    for (const [k, v] of pares) saida[k === antiga ? nova : k] = v
    aoMudar(saida)
  }

  return (
    <div className="rpa-vars">
      {pares.map(([chave, valor]) => (
        <div className="rpa-var-linha" key={chave}>
          <input
            className="rpa-input"
            value={chave}
            placeholder="CHAVE"
            onChange={(e) => trocarChave(chave, e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
          />
          <input
            className="rpa-input"
            value={valor}
            placeholder="valor"
            onChange={(e) => aoMudar({ ...variaveis, [chave]: e.target.value })}
          />
          <button
            className="btn-acao btn-acao-del"
            title="Remover variável"
            onClick={() => {
              const saida = { ...variaveis }
              delete saida[chave]
              aoMudar(saida)
            }}
          >×</button>
        </div>
      ))}
      <button
        className="btn-mini"
        onClick={() => aoMudar({ ...variaveis, [`VAR_${pares.length + 1}`]: '' })}
      >+ variável</button>
      <p className="rpa-dica">
        Chegam ao script como variáveis de ambiente. Ficam salvas em texto no n8n —
        <strong> não coloque senha ou token aqui</strong>; use credenciais do n8n.
      </p>
    </div>
  )
}

// Painel lateral de edição/criação de job.
function PainelJob({ job, agentes, salvando, aoFechar, aoSalvar }) {
  const [rascunho, setRascunho] = useState(job)
  // `r` já tem todos os campos normalizados; o construtor só re-normaliza o que mudou.
  const mudar = (campos) => setRascunho((r) => new JobRpa({ ...r, ...campos }))
  const problemas = rascunho.problemas()
  const erroCron = validarCron(rascunho.cron)

  // Trocar a linguagem só reescreve o código se ele ainda for o modelo inicial.
  function trocarLinguagem(nova) {
    const eraModelo = Object.values(MODELOS_CODIGO).includes(rascunho.codigo)
    mudar({ linguagem: nova, codigo: eraModelo ? MODELOS_CODIGO[nova] : rascunho.codigo })
  }

  return (
    <>
      <div className="painel-backdrop" onClick={aoFechar} />
      <aside className="rpa-painel">
        <div className="painel-topo">
          <h3 className="rpa-painel-titulo">{job.id ? 'Editar job' : 'Novo job'}</h3>
          <button className="painel-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>

        <div className="painel-corpo">
          <div className="rpa-campo-dupla">
            <label>
              <span className="rpa-rotulo">Nome</span>
              <input className="rpa-input" value={rascunho.nome} placeholder="Ex.: Baixar retorno do banco"
                onChange={(e) => mudar({ nome: e.target.value })} />
            </label>
            <label>
              <span className="rpa-rotulo">Linguagem</span>
              <select className="rpa-input" value={rascunho.linguagem} onChange={(e) => trocarLinguagem(e.target.value)}>
                {Object.entries(LINGUAGENS).map(([k, l]) => <option key={k} value={k}>{l.label}</option>)}
              </select>
            </label>
          </div>

          <label>
            <span className="rpa-rotulo">Descrição</span>
            <input className="rpa-input" value={rascunho.descricao} placeholder="O que esse job faz (opcional)"
              onChange={(e) => mudar({ descricao: e.target.value })} />
          </label>

          <div className="rpa-bloco">
            <span className="rpa-rotulo">Onde roda</span>
            <div className="rpa-destinos">
              <button className={'rpa-destino' + (rascunho.destino === 'nuvem' ? ' ativo' : '')}
                onClick={() => mudar({ destino: 'nuvem' })}>
                <strong>☁ Nuvem (n8n)</strong>
                <span>Roda no servidor, mesmo com seu PC desligado.</span>
              </button>
              <button className={'rpa-destino' + (rascunho.destino === 'agente' ? ' ativo' : '')}
                onClick={() => mudar({ destino: 'agente' })}>
                <strong>💻 Máquina local</strong>
                <span>Roda num PC com o agente instalado — acessa arquivos e sistemas internos.</span>
              </button>
            </div>
            {rascunho.destino === 'agente' && (
              <label className="rpa-agente-escolha">
                <span className="rpa-rotulo">Agente</span>
                <input className="rpa-input" list="rpa-agentes-conhecidos" value={rascunho.agente}
                  placeholder="nome da máquina (ex.: PC-GABRIELLA)"
                  onChange={(e) => mudar({ agente: e.target.value })} />
                <datalist id="rpa-agentes-conhecidos">
                  {agentes.map((a) => <option key={a.nome} value={a.nome}>{a.online ? 'online' : 'offline'}</option>)}
                </datalist>
              </label>
            )}
          </div>

          <div className="rpa-bloco">
            <span className="rpa-rotulo">Agendamento</span>
            <div className="rpa-campo-dupla">
              <select className="rpa-input"
                value={PRESETS_CRON.some((p) => p.cron === rascunho.cron) ? rascunho.cron : '__livre'}
                onChange={(e) => { if (e.target.value !== '__livre') mudar({ cron: e.target.value }) }}>
                {PRESETS_CRON.map((p) => <option key={p.cron || 'manual'} value={p.cron}>{p.label}</option>)}
                <option value="__livre">Cron personalizado…</option>
              </select>
              <input className={'rpa-input' + (erroCron ? ' rpa-input-erro' : '')} value={rascunho.cron}
                placeholder="*/30 * * * *" onChange={(e) => mudar({ cron: e.target.value })} />
            </div>
            <p className="rpa-dica">
              {erroCron || `${descreverCron(rascunho.cron)} · fuso America/São_Paulo`}
            </p>
            <label className="rpa-check">
              <input type="checkbox" checked={rascunho.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
              <span>Agendamento ligado</span>
            </label>
          </div>

          <div className="rpa-campo-dupla">
            <label>
              <span className="rpa-rotulo">Timeout (segundos)</span>
              <input className="rpa-input" type="number" min="10" value={rascunho.timeout_seg}
                onChange={(e) => mudar({ timeout_seg: Number(e.target.value) })} />
            </label>
            <label>
              <span className="rpa-rotulo">Retentativas em caso de erro</span>
              <input className="rpa-input" type="number" min="0" max="5" value={rascunho.max_retentativas}
                onChange={(e) => mudar({ max_retentativas: Number(e.target.value) })} />
            </label>
          </div>

          <div className="rpa-bloco">
            <span className="rpa-rotulo">Variáveis</span>
            <Variaveis variaveis={rascunho.variaveis} aoMudar={(v) => mudar({ variaveis: v })} />
          </div>

          <div className="rpa-bloco">
            <span className="rpa-rotulo">Código</span>
            <EditorCodigo valor={rascunho.codigo} linguagem={rascunho.linguagem}
              aoMudar={(c) => mudar({ codigo: c })} />
          </div>

          {problemas.length > 0 && (
            <ul className="rpa-problemas">
              {problemas.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>

        <div className="rpa-painel-rodape">
          <button className="btn-mini" onClick={aoFechar}>Cancelar</button>
          <button className="btn-primario" disabled={problemas.length > 0 || salvando}
            onClick={() => aoSalvar(rascunho, false)}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="btn-primario" disabled={problemas.length > 0 || salvando}
            onClick={() => aoSalvar(rascunho, true)}>
            Salvar e executar
          </button>
        </div>
      </aside>
    </>
  )
}

// Painel lateral com o histórico de execuções de um job (log expandível).
function PainelExecucoes({ job, execucoes, carregando, aoFechar, aoAtualizar, aoCancelar }) {
  const [aberta, setAberta] = useState(null)

  return (
    <>
      <div className="painel-backdrop" onClick={aoFechar} />
      <aside className="rpa-painel">
        <div className="painel-topo">
          <h3 className="rpa-painel-titulo">Execuções — {job.nome}</h3>
          <button className="painel-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="painel-corpo">
          <button className="btn-refresh" onClick={aoAtualizar} disabled={carregando}>
            {carregando ? 'Atualizando…' : '↻ Atualizar'}
          </button>
          {execucoes.length === 0 && !carregando && (
            <p className="empty">Esse job ainda não rodou.</p>
          )}
          {execucoes.map((ex) => (
            <div className={'rpa-exec' + (aberta === ex.id ? ' aberta' : '')} key={ex.id}>
              <button className="rpa-exec-topo" onClick={() => setAberta(aberta === ex.id ? null : ex.id)}>
                <span className={'pill ' + ex.pill}>{ex.rotulo}</span>
                <span className="rpa-exec-quando">{quando(ex.inicio)}</span>
                <span className="rpa-exec-dur">{ex.duracao}</span>
                <span className="rpa-exec-origem">{ex.origem === 'cron' ? 'agendado' : ex.origem}</span>
                <span className="chevron">{aberta === ex.id ? '⌄' : '›'}</span>
              </button>
              {aberta === ex.id && (
                <div className="rpa-exec-corpo">
                  <div className="rpa-exec-meta">
                    {ex.agente && <span>agente: {ex.agente}</span>}
                    {ex.codigo_saida != null && <span>código de saída: {ex.codigo_saida}</span>}
                    {ex.tentativa > 1 && <span>tentativa {ex.tentativa}</span>}
                    {ex.status === 'fila' && (
                      <button className="btn-mini" onClick={() => aoCancelar(ex.id)}>Tirar da fila</button>
                    )}
                  </div>
                  <pre className="rpa-log">{ex.log}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}

export default function Rpa() {
  const [jobs, setJobs] = useState([])
  const [agentes, setAgentes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [historicoDe, setHistoricoDe] = useState(null)
  const [execucoes, setExecucoes] = useState([])
  const [carregandoExec, setCarregandoExec] = useState(false)

  const carregar = useCallback(async (silencioso) => {
    if (!silencioso) setCarregando(true)
    try {
      const [lista, ags] = await Promise.all([
        listarJobsRpa(),
        listarAgentesRpa().catch(() => []),
      ])
      setJobs(lista)
      setAgentes(ags)
      setErro('')
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setCarregando(false)
    }
  }, [])

  const carregarExecucoes = useCallback(async (jobId) => {
    setCarregandoExec(true)
    try {
      setExecucoes(await listarExecucoesRpa(jobId, 50))
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setCarregandoExec(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Enquanto o histórico está aberto, atualiza sozinho — execução em agente
  // pode demorar a ser puxada e é chato ficar clicando em atualizar.
  useEffect(() => {
    if (!historicoDe) return
    const t = setInterval(() => {
      carregarExecucoes(historicoDe.id)
      carregar(true)
    }, RECARGA_MS)
    return () => clearInterval(t)
  }, [historicoDe, carregarExecucoes, carregar])

  const agentesOnline = useMemo(() => agentes.filter((a) => a.online), [agentes])

  async function salvar(job, executarDepois) {
    setSalvando(true)
    try {
      const salvo = await salvarJobRpa(job)
      setEditando(null)
      setMsg(`Job "${salvo.nome}" salvo.`)
      await carregar(true)
      if (executarDepois && salvo.id) await executar(salvo)
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setSalvando(false)
    }
  }

  async function executar(job) {
    try {
      await executarJobRpa(job.id)
      setMsg(job.destino === 'agente'
        ? `"${job.nome}" foi para a fila do agente ${job.agente}.`
        : `"${job.nome}" está rodando na nuvem.`)
      setHistoricoDe(job)
      await carregarExecucoes(job.id)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }

  async function alternarAtivo(job) {
    // otimista: o toggle responde na hora e a lista se corrige na recarga
    setJobs((lista) => lista.map((j) => (j.id === job.id ? new JobRpa({ ...j, ativo: !j.ativo }) : j)))
    try {
      await ativarJobRpa(job.id, !job.ativo)
      await carregar(true)
    } catch (err) {
      setErro(mensagemErro(err))
      await carregar(true)
    }
  }

  async function apagar(job) {
    if (!window.confirm(`Apagar o job "${job.nome}"? O histórico de execuções também some.`)) return
    try {
      await apagarJobRpa(job.id)
      setMsg(`Job "${job.nome}" apagado.`)
      if (historicoDe?.id === job.id) setHistoricoDe(null)
      await carregar(true)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }

  async function cancelar(execucaoId) {
    try {
      await cancelarExecucaoRpa(execucaoId)
      if (historicoDe) await carregarExecucoes(historicoDe.id)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }

  return (
    <div className="secao">
      <div className="pagina-head rpa-head">
        <div>
          <h2 className="secao-titulo">RPA</h2>
          <p className="rpa-intro">
            Jobs de automação em Python, Node ou shell — agendados por cron, rodando
            na nuvem do n8n ou numa máquina com o agente instalado.
          </p>
        </div>
        <div className="rpa-acoes-topo">
          <span className="rpa-agentes-chip" title={agentes.map((a) => `${a.nome} (${a.online ? 'online' : 'offline'})`).join('\n') || 'Nenhum agente registrado'}>
            💻 {agentesOnline.length}/{agentes.length} agente(s) online
          </span>
          <button className="btn-refresh" onClick={() => carregar()} disabled={carregando}>↻</button>
          <button className="btn-primario" onClick={() => setEditando(JobRpa.novo())}>+ Novo job</button>
        </div>
      </div>

      {erro && <div className="banner rpa-banner-erro">{erro} <button className="btn-mini" onClick={() => setErro('')}>ok</button></div>}
      {msg && <div className="banner">{msg} <button className="btn-mini" onClick={() => setMsg('')}>ok</button></div>}

      {carregando && <p className="loading">Carregando jobs…</p>}

      {!carregando && jobs.length === 0 && !erro && (
        <div className="empty rpa-vazio">
          <p>Nenhum job ainda.</p>
          <button className="btn-primario" onClick={() => setEditando(JobRpa.novo())}>Criar o primeiro job</button>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="tabela-rolagem">
          <table className="rpa-tabela">
            <thead>
              <tr>
                <th>Job</th>
                <th>Onde roda</th>
                <th>Agendamento</th>
                <th>Última execução</th>
                <th>Ligado</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div className="rpa-nome">{job.nome}</div>
                    <div className="rpa-sub">
                      <span className="rpa-ling">{LINGUAGENS[job.linguagem]?.label}</span>
                      {job.descricao && <span className="rpa-desc">{job.descricao}</span>}
                    </div>
                  </td>
                  <td>{job.onde}</td>
                  <td>
                    <div>{descreverCron(job.cron)}</div>
                    {job.cron && <code className="rpa-cron">{job.cron}</code>}
                  </td>
                  <td>
                    {job.ultimo_status
                      ? <span className={'pill ' + (job.ultimo_status === 'ok' ? 'pill-ok' : job.ultimo_status === 'fila' || job.ultimo_status === 'rodando' ? 'pill-neutro' : 'pill-erro')}>{job.ultimo_status}</span>
                      : <span className="pill pill-neutro">nunca rodou</span>}
                    <div className="rpa-sub">{quando(job.ultima_execucao_em)}</div>
                  </td>
                  <td>
                    <label className="rpa-toggle" title={job.cron ? 'Ligar/desligar o agendamento' : 'Job sem cron roda só manualmente'}>
                      <input type="checkbox" checked={job.ativo} disabled={!job.cron} onChange={() => alternarAtivo(job)} />
                      <span />
                    </label>
                  </td>
                  <td className="col-acoes">
                    <button className="btn-acao" title="Executar agora" onClick={() => executar(job)}>▶</button>
                    <button className="btn-acao" title="Execuções" onClick={() => { setHistoricoDe(job); carregarExecucoes(job.id) }}>🕘</button>
                    <button className="btn-acao" title="Editar" onClick={() => setEditando(job)}>✎</button>
                    <button className="btn-acao btn-acao-del" title="Apagar" onClick={() => apagar(job)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <PainelJob job={editando} agentes={agentes} salvando={salvando}
          aoFechar={() => setEditando(null)} aoSalvar={salvar} />
      )}

      {historicoDe && (
        <PainelExecucoes job={historicoDe} execucoes={execucoes} carregando={carregandoExec}
          aoFechar={() => setHistoricoDe(null)}
          aoAtualizar={() => carregarExecucoes(historicoDe.id)}
          aoCancelar={cancelar} />
      )}
    </div>
  )
}
