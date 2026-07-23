import { useEffect, useRef, useState } from 'react'
import { validarDominioIA, listarLotesDominio, urlCsvLote, apagarLote } from '../api/n8n'
import CompanyLogo from './CompanyLogo'

// Validação de domínio em lote via IA (workflow n8n post-enriquecer-dominio).
// Dispara até 10 empresas em paralelo; cada vaga puxa a próxima da fila ao terminar.
// Cada resultado também é salvo pelo n8n na Data Table `enriquecimento_dominio`.

// Lê linhas no formato "empresa;cnpj" (cnpj opcional). Ignora linhas vazias e
// o cabeçalho (ex.: "RAZÃO SOCIAL;CNPJ"), que não é uma empresa de verdade.
function parseLinhas(texto) {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [empresa = '', cnpj = ''] = l.split(';').map((c) => c.trim())
      return { empresa, cnpj }
    })
    .filter((r) => r.empresa)
    .filter((r) => {
      const emp = r.empresa.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      const ehCabecalho = ['razao social', 'empresa', 'nome', 'cliente'].includes(emp) || r.cnpj.toLowerCase() === 'cnpj'
      return !ehCabecalho
    })
}

const CHAVE_STORAGE = 'kard_lote_ia'
const LOTE_PAGINA = 30 // cards renderizados por "página" da rolagem infinita
const CHAVE_CARGOS = 'kard_cargos_lote_ia'
// mesmos cargos-padrão do PainelEmpresa: definem quais contatos interessam nos e-mails por fonte
const CARGOS_PADRAO = ['RH', 'Recursos Humanos', 'DP', 'Departamento Pessoal', 'Gente e Gestão', 'Financeiro', 'Jurídico', 'Contabilidade']

// Id único por lote: data+hora+sufixo aleatório (ex.: "lote-0723-1432-x7pq").
// Antes era lote-<qtd de empresas>, que colidia: dois lotes do mesmo tamanho
// (ou re-execuções) se misturavam no histórico do banco.
function gerarLoteId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6)
  return `lote-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${rand}`
}

export default function ValidacaoIALote() {
  const [texto, setTexto] = useState('')
  const [fila, setFila] = useState([])          // empresas ainda não processadas
  const [resultados, setResultados] = useState([]) // já validadas nesta sessão
  const [rodando, setRodando] = useState(false)
  const [msg, setMsg] = useState('')
  const [paralelo, setParalelo] = useState(3) // quantas rodam ao mesmo tempo
  const [historico, setHistorico] = useState(null) // null = fechado; [] = aberto (lista de lotes)
  const [carregandoHist, setCarregandoHist] = useState(false)
  const pararRef = useRef(false)
  const loteIdRef = useRef('') // id do lote em andamento (persistido pra "Continuar lote")
  const [visiveis, setVisiveis] = useState(LOTE_PAGINA) // cards renderizados (rolagem infinita)
  // cargos-alvo do lote (editável; vai junto em cada validação e filtra os e-mails Snov/Apollo)
  const [cargos, setCargos] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(CHAVE_CARGOS) || 'null'); if (Array.isArray(s) && s.length) return s } catch { /* ignora */ }
    return CARGOS_PADRAO
  })
  const [novoCargo, setNovoCargo] = useState('')
  function salvarCargos(novos) {
    setCargos(novos)
    try { localStorage.setItem(CHAVE_CARGOS, JSON.stringify(novos)) } catch { /* ignora */ }
  }
  function addCargo() {
    const t = novoCargo.trim()
    if (!t) return
    if (!cargos.some((x) => x.toLowerCase() === t.toLowerCase())) salvarCargos([...cargos, t])
    setNovoCargo('')
  }
  const removerCargo = (t) => salvarCargos(cargos.filter((x) => x !== t))
  const sentinelaRef = useRef(null)

  // Rolagem infinita: quando a "sentinela" no fim da lista entra na tela,
  // renderiza mais uma página de cards (renderizar 400+ de uma vez trava o front).
  useEffect(() => {
    const el = sentinelaRef.current
    if (!el) return
    const obs = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) setVisiveis((v) => v + LOTE_PAGINA)
    }, { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [resultados.length, visiveis])

  // Recupera resultados de um lote interrompido (os dados também estão no banco).
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_STORAGE) || 'null')
      if (salvo?.resultados?.length) {
        loteIdRef.current = salvo.loteId || ''
        setResultados(salvo.resultados)
        if (salvo.fila?.length) {
          setFila(salvo.fila)
          setMsg(`Lote anterior interrompido: faltam ${salvo.fila.length} empresa(s). Clique em "Continuar lote".`)
        }
      }
    } catch { /* storage corrompido: ignora */ }
  }, [])

  function salvarEstado(fila, resultados, loteId) {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ fila, resultados, loteId }))
  }

  function carregarArquivo(ev) {
    const f = ev.target.files && ev.target.files[0]
    if (!f) return
    const leitor = new FileReader()
    leitor.onload = () => setTexto(String(leitor.result || ''))
    leitor.readAsText(f)
  }

  // Processa a fila com até `paralelo` requisições ao mesmo tempo.
  // Cada "trabalhador" pega a próxima empresa da fila assim que termina a sua.
  async function processar(filaInicial, resultadosIniciais, loteId) {
    const PARALELO = paralelo
    setRodando(true)
    pararRef.current = false
    const filaAtual = [...filaInicial]
    let acumulado = [...resultadosIniciais]
    const total = filaAtual.length + acumulado.length
    const emVoo = new Set() // empresas em requisição agora: contam como "fila" no localStorage

    // Persiste fila + em-voo: se a página recarregar no meio, as empresas cuja
    // requisição estava em andamento voltam pra fila em vez de sumirem
    // (era assim que um lote de 408 terminava com 399 no CSV).
    function persistir() {
      salvarEstado([...filaAtual, ...emVoo], acumulado, loteId)
    }

    // registra um resultado e atualiza tela/estado (chamado pelos trabalhadores)
    function registrar(item) {
      acumulado = [...acumulado, item]
      setResultados(acumulado)
      setFila([...filaAtual, ...emVoo]) // inclui as em requisição: senão o contador da barra "perde" até 10
      persistir()
      setMsg(`Validando… ${acumulado.length}/${total} concluídas (${Math.min(PARALELO, filaAtual.length)} em paralelo).`)
    }

    async function trabalhador() {
      while (filaAtual.length > 0 && !pararRef.current) {
        const alvo = filaAtual.shift() // remove da fila ANTES de chamar (evita duplicar)
        if (!alvo || !String(alvo.empresa || '').trim()) continue // fila antiga pode ter lixo
        emVoo.add(alvo)
        persistir()
        try {
          const r = await validarDominioIA(alvo.empresa, alvo.cnpj, loteId, cargos)
          emVoo.delete(alvo)
          registrar({ ...alvo, ...r })
        } catch (err) {
          emVoo.delete(alvo)
          const tentativas = (alvo.tentativas || 0) + 1
          if (tentativas <= 2) {
            // falha temporária (timeout/sobrecarga): volta pro FIM da fila e tenta de novo
            filaAtual.push({ ...alvo, tentativas })
            persistir()
          } else {
            // 3 falhas seguidas: registra o erro no card e segue
            registrar({ ...alvo, score: 0, confianca: 'nenhuma', observacao: 'erro: ' + err.message + ' (3 tentativas)' })
          }
        }
      }
    }

    setMsg(`Iniciando ${Math.min(PARALELO, filaAtual.length)} validações em paralelo…`)
    await Promise.all(Array.from({ length: Math.min(PARALELO, filaAtual.length) }, trabalhador))

    setRodando(false)
    if (!filaAtual.length) setMsg(`Lote concluído: ${acumulado.length} empresa(s) validadas e salvas no banco. ✅`)
    else setMsg(`Lote pausado: ${acumulado.length}/${total} feitas. Clique em "Continuar lote" para retomar.`)
  }

  function iniciar() {
    const linhas = parseLinhas(texto)
    if (!linhas.length) { setMsg('Cole a lista no formato empresa;cnpj (uma por linha).'); return }
    setResultados([])
    loteIdRef.current = gerarLoteId()
    processar(linhas, [], loteIdRef.current)
  }

  function novoLote() {
    pararRef.current = true
    localStorage.removeItem(CHAVE_STORAGE)
    setFila([]); setResultados([]); setTexto(''); setMsg(''); setVisiveis(LOTE_PAGINA)
  }

  function baixarCSV() {
    const juntar = (v) => (Array.isArray(v) ? v.join(' | ') : v) || ''
    const linhas = [['razao_social', 'cnpj', 'dominio', 'linkedin', 'emails', 'emails_snov', 'emails_apollo', 'score', 'confianca', 'observacao']]
    for (const r of resultados) {
      linhas.push([
        r.razao_social || r.empresa || '', r.cnpj_informado || r.cnpj || '', r.dominio || '',
        r.linkedin || '', juntar(r.emails), juntar(r.emails_snov), juntar(r.emails_apollo),
        String(r.score ?? ''), r.confianca || '', String(r.observacao || '').replace(/"/g, "'"),
      ])
    }
    // ﻿ (BOM) + \r\n: sem o BOM o Excel abre UTF-8 como Latin-1 e os acentos viram "DomÃ­nio"
    const csv = linhas.map((l) => l.map((c) => `"${String(c)}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'validacao-dominios-ia.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // Abre/fecha o histórico de lotes (todos os lotes já salvos no banco pelo n8n).
  async function alternarHistorico() {
    if (historico) { setHistorico(null); return }
    setCarregandoHist(true)
    try {
      setHistorico(await listarLotesDominio())
    } catch (err) {
      setMsg('Não deu pra carregar o histórico: ' + err.message)
    } finally {
      setCarregandoHist(false)
    }
  }

  // Apaga um lote inteiro do banco (com confirmação) e atualiza a lista.
  async function apagarDoHistorico(l) {
    if (!window.confirm(`Apagar o lote "${l.lote_id}" (${l.empresas} empresa(s)) do banco? Não dá pra desfazer.`)) return
    try {
      await apagarLote(l.lote_id)
      setHistorico((prev) => (prev || []).filter((x) => x.lote_id !== l.lote_id))
      setMsg(`Lote "${l.lote_id}" apagado.`)
    } catch (err) {
      setMsg('Não deu pra apagar: ' + err.message)
    }
  }

  // "2026-07-23T12:17:57..." → "23/07/2026 12:17"
  function dataCurta(iso) {
    const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : '—'
  }

  const total = fila.length + resultados.length

  return (
    <div>
      {msg && <div className="banner">{msg}</div>}

      {!rodando && (
        <div className="ia-entrada">
          <div className="ia-entrada-topo">
            <div>
              <strong>Lista de empresas</strong>
              <span className="ajuda"> — uma por linha, no formato <code>empresa;cnpj</code></span>
            </div>
            <label className="btn-secundario arquivo-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 15V3m0 0L8 7m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Escolher CSV
              <input type="file" accept=".csv,text/csv,.txt" onChange={carregarArquivo} hidden />
            </label>
          </div>
          <textarea
            className="ia-textarea"
            placeholder={'Cole aqui ou arraste um CSV…\n\nLUKE S ENGENHARIA LTDA;30.678.636/0001-58\nCOAMO AGROINDUSTRIA COOPERATIVA;75.904.383/0001-21'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files && e.dataTransfer.files[0]
              if (!f) return
              const leitor = new FileReader()
              leitor.onload = () => setTexto(String(leitor.result || ''))
              leitor.readAsText(f)
            }}
            rows={6}
          />
          <div className="ia-entrada-rodape">
            <span className="ajuda">
              {parseLinhas(texto).length > 0
                ? <><b>{parseLinhas(texto).length}</b> empresa(s) prontas para validar</>
                : 'nenhuma empresa lida ainda'}
            </span>
            <span className="ajuda ia-entrada-dica">
              validação por IA (Serper → Snov → Apollo + RDAP) · resultados salvos no banco · se fechar a aba, dá pra continuar
            </span>
          </div>
        </div>
      )}

      {!rodando && (
        <>
          <div className="cargos-alvo">
            {cargos.map((t) => (
              <span className="hashtag" key={t}>
                {t}
                <button type="button" className="tag-x" title="remover cargo" onClick={() => removerCargo(t)}>×</button>
              </span>
            ))}
            <input
              className="cargo-add"
              value={novoCargo}
              onChange={(ev) => setNovoCargo(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCargo() } }}
              onBlur={addCargo}
              placeholder="+ cargo"
            />
          </div>
          <small className="ajuda">Esses cargos filtram os <b>e-mails Snov/Apollo</b> de cada empresa validada (fica salvo neste navegador).</small>
        </>
      )}

      <div className="toolbar">
        {!rodando && (
          <label className="ajuda" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Velocidade:
            <select className="dom-select" value={paralelo} onChange={(e) => setParalelo(Number(e.target.value))}>
              <option value={1}>1 por vez (mais seguro, bem lento)</option>
              <option value={3}>3 em paralelo (recomendado)</option>
              <option value={5}>5 em paralelo</option>
              <option value={10}>10 em paralelo (rápido, pode dar timeout)</option>
            </select>
          </label>
        )}
        {!rodando && (
          <button className="btn-primario" onClick={iniciar} disabled={!texto.trim()}>
            {`Validar ${parseLinhas(texto).length || ''} domínio(s) em lote`}
          </button>
        )}
        {!rodando && fila.length > 0 && (
          <button className="btn-primario" onClick={() => { if (!loteIdRef.current) loteIdRef.current = gerarLoteId(); processar(fila, resultados, loteIdRef.current) }}>
            {`Continuar lote (faltam ${fila.length})`}
          </button>
        )}
        {rodando && (
          <button className="btn-refresh" onClick={() => { pararRef.current = true }}>Pausar</button>
        )}
        {resultados.length > 0 && (
          <button className="btn-refresh btn-icone" onClick={baixarCSV} title="Baixar resultado (CSV)" aria-label="Baixar resultado em CSV">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {!rodando && (resultados.length > 0 || fila.length > 0) && (
          <button className="btn-refresh btn-icone" onClick={novoLote} title="Novo lote" aria-label="Começar um novo lote">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {!rodando && (
          <button
            className={'btn-refresh btn-icone' + (historico ? ' ativo' : '')}
            onClick={alternarHistorico}
            disabled={carregandoHist}
            title={historico ? 'Fechar histórico' : 'Histórico de lotes'}
            aria-label={historico ? 'Fechar histórico de lotes' : 'Abrir histórico de lotes'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M3 11h18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        )}
        {total > 0 && <span className="ajuda">{resultados.length}/{total} concluídas</span>}
      </div>

      {historico && (
        <div className="hist-lotes">
          <h3>Histórico de lotes <span className="hist-qtd">{historico.length}</span></h3>
          {historico.length === 0 ? (
            <p className="ajuda">Nenhum lote salvo no banco ainda.</p>
          ) : (
            <table className="hist-tabela">
              <thead>
                <tr>
                  <th>Lote</th><th>Data</th><th className="num">Empresas</th>
                  <th className="num">Com domínio</th><th>Confiança</th><th>E-mails</th><th></th>
                </tr>
              </thead>
              <tbody>
                {historico.map((l) => (
                  <tr key={l.lote_id}>
                    <td className="hist-nome">{l.lote_id}</td>
                    <td className="hist-data">{dataCurta(l.inicio)}</td>
                    <td className="num">{l.empresas}</td>
                    <td className="num">
                      {l.com_dominio > 0
                        ? <span className="pill pill-ok">{l.com_dominio}</span>
                        : <span className="pill pill-neutro">0</span>}
                    </td>
                    <td>
                      <div className="hist-conf">
                        {l.alta > 0 && <span className="pill pill-ok" title="confiança alta">{l.alta} alta</span>}
                        {l.media > 0 && <span className="pill pill-neutro" title="confiança média">{l.media} média</span>}
                        {l.baixa > 0 && <span className="pill pill-erro" title="confiança baixa">{l.baixa} baixa</span>}
                        {!l.alta && !l.media && !l.baixa && <span className="ajuda">—</span>}
                      </div>
                    </td>
                    <td>
                      <div className="hist-conf">
                        {l.com_email > 0 && <span className="pill pill-ok" title="empresas com algum e-mail encontrado">✉ {l.com_email}</span>}
                        {l.com_email_snov > 0 && <span className="pill pill-neutro" title="empresas com e-mail via Snov">snov {l.com_email_snov}</span>}
                        {l.com_email_apollo > 0 && <span className="pill pill-neutro" title="empresas com e-mail via Apollo">apollo {l.com_email_apollo}</span>}
                        {!l.com_email && !l.com_email_snov && !l.com_email_apollo && <span className="ajuda">—</span>}
                      </div>
                    </td>
                    <td className="hist-acao">
                      <a className="hist-baixar" href={urlCsvLote(l.lote_id)} title="Baixar o CSV completo deste lote" aria-label={`Baixar CSV do ${l.lote_id}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 3v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </a>
                      <button type="button" className="hist-baixar hist-apagar" onClick={() => apagarDoHistorico(l)} title="Apagar este lote do banco (não dá pra desfazer)" aria-label={`Apagar lote ${l.lote_id}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a2 2 0 01-2 1.9H8.8a2 2 0 01-2-1.9L6 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {resultados.length > 0 && (
        <div className="lote-resultados">
          {resultados.slice(0, visiveis).map((r, i) => (
            <div className="lote-card" key={(r.cnpj || '') + (r.razao_social || r.empresa || '') + i}>
              <div className="lote-topo">
                <CompanyLogo dominio={r.dominio} nome={r.razao_social || r.empresa} size={44} />
                <div className="empresa-id">
                  <div className="empresa-nome">{r.razao_social || r.empresa}</div>
                  <div className="empresa-cnpj">{r.cnpj_informado || r.cnpj || 'CNPJ —'}</div>
                </div>
              </div>
              <div className="ia-box">
                {r.dominio && r.dominio !== '-'
                  ? <span className="pill pill-ok">{r.dominio}</span>
                  : <span className="pill pill-erro">sem domínio</span>}
                <span className={'pill ' + (Number(r.score) >= 75 ? 'pill-ok' : Number(r.score) >= 45 ? 'pill-neutro' : 'pill-erro')}>
                  score {r.score ?? 0} · {r.confianca || 'nenhuma'}
                </span>
                {r.do_banco && <span className="pill pill-neutro" title="Resultado reaproveitado do banco (validado há menos de 3 meses)">💾 do banco</span>}
                {r.observacao && <span className="ia-just">{r.observacao}</span>}
              </div>
              {Array.isArray(r.emails) && r.emails.length > 0 && r.emails[0] !== '-' && (
                <div className="ia-linha">
                  <span className="chave">E-mails</span>
                  <span className="ia-valor">
                    {r.emails.map((em) => <span className="ia-email" key={em}>{em}</span>)}
                  </span>
                </div>
              )}
              {Array.isArray(r.emails_snov) && r.emails_snov.length > 0 && (
                <div className="ia-linha">
                  <span className="chave">Snov</span>
                  <span className="ia-valor">
                    {r.emails_snov.map((em) => <span className="ia-email" key={em}>{em}</span>)}
                  </span>
                </div>
              )}
              {Array.isArray(r.emails_apollo) && r.emails_apollo.length > 0 && (
                <div className="ia-linha">
                  <span className="chave">Apollo</span>
                  <span className="ia-valor">
                    {r.emails_apollo.map((em) => <span className="ia-email" key={em}>{em}</span>)}
                  </span>
                </div>
              )}
              {r.linkedin && r.linkedin !== '-' && (
                <div className="ia-linha">
                  <span className="chave">LinkedIn</span>
                  <a className="ia-valor ia-link" href={r.linkedin} target="_blank" rel="noreferrer">
                    {(() => { try { return decodeURI(r.linkedin) } catch { return r.linkedin } })().replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {resultados.length > visiveis && (
        <div ref={sentinelaRef} className="lote-sentinela">
          Mostrando {visiveis} de {resultados.length} — role para carregar mais…
        </div>
      )}
    </div>
  )
}
