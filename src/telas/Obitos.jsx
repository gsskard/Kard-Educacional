import { useEffect, useMemo, useRef, useState } from 'react'
import { nvCheckCpf } from '../api/n8n'

// Tela Óbitos: sobe/cola um CSV com CPFs e consulta cada um no workflow
// NVCheck (Nova Vida TI) via n8n. Mostra situação cadastral, ÓBITO (S/N),
// score/risco e contatos; exporta tudo em CSV no formato da base enriquecida.
// O progresso fica salvo no navegador — dá pra continuar se fechar a aba.

const CHAVE_STORAGE = 'kard_lote_obitos'
const PAGINA = 50

// Extrai CPFs do texto: usa a coluna "cpf" se houver cabeçalho; senão pega o
// primeiro campo com 11 dígitos de cada linha. Preserva zeros à esquerda.
function parseCpfs(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!linhas.length) return []
  const sep = linhas[0].includes(';') ? ';' : ','
  const cab = linhas[0].toLowerCase().split(sep).map((c) => c.trim().replace(/"/g, ''))
  const idxCpf = cab.findIndex((c) => c === 'cpf' || c === 'cpf_original' || c === 'documento')
  const comeco = idxCpf >= 0 ? 1 : 0
  const out = []
  const vistos = new Set()
  for (const linha of linhas.slice(comeco)) {
    const campos = linha.split(sep).map((c) => c.trim().replace(/"/g, ''))
    let bruto = idxCpf >= 0 ? campos[idxCpf] : (campos.find((c) => c.replace(/\D/g, '').length === 11) || '')
    const cpf = String(bruto || '').replace(/\D/g, '').padStart(11, '0')
    if (cpf.length !== 11 || /^0+$/.test(cpf) || vistos.has(cpf)) continue
    vistos.add(cpf)
    out.push(cpf)
  }
  return out
}

const fmtCpf = (c) => String(c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

// Colunas do CSV exportado — mesmas da base enriquecida gerada pelo workflow.
const COLS = ['cpf', 'status_validacao', 'nome', 'nome_mae', 'nascimento', 'idade', 'sexo',
  'situacao_cadastral', 'obito', 'pep', 'score', 'faixa_risco', 'propensao_pagamento', 'renda',
  'classe_economica', 'fonte_renda', 'possivel_profissao', 'possivel_aposentado', 'qtd_telefones',
  'telefone_1', 'whatsapp_1', 'telefone_2', 'whatsapp_2', 'telefone_3', 'email_1', 'email_2',
  'logradouro', 'bairro', 'cidade', 'uf', 'cep', 'qtd_sociedades', 'erro']

export default function Obitos() {
  const [texto, setTexto] = useState('')
  const [fila, setFila] = useState([])
  const [resultados, setResultados] = useState([])
  const [rodando, setRodando] = useState(false)
  const [msg, setMsg] = useState('')
  const [busca, setBusca] = useState('')
  const [visiveis, setVisiveis] = useState(PAGINA)
  const pararRef = useRef(false)
  const sentinelaRef = useRef(null)

  // Recupera lote interrompido.
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_STORAGE) || 'null')
      if (salvo?.resultados?.length || salvo?.fila?.length) {
        setResultados(salvo.resultados || [])
        setFila(salvo.fila || [])
        if (salvo.fila?.length) setMsg(`Lote anterior interrompido: faltam ${salvo.fila.length} CPF(s). Clique em "Continuar".`)
      }
    } catch { /* storage corrompido: ignora */ }
  }, [])

  // Rolagem infinita da tabela.
  useEffect(() => {
    const el = sentinelaRef.current
    if (!el) return
    const obs = new IntersectionObserver((es) => { if (es[0].isIntersecting) setVisiveis((v) => v + PAGINA) }, { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [resultados.length, visiveis])

  function salvar(fila, resultados) {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ fila, resultados }))
  }

  function carregarArquivo(ev) {
    const f = ev.target.files && ev.target.files[0]
    if (!f) return
    const leitor = new FileReader()
    leitor.onload = () => setTexto(String(leitor.result || ''))
    leitor.readAsText(f)
  }

  // Consulta a fila com 2 requisições em paralelo (a NVCheck aguenta, mas não
  // precisamos afogar o n8n). CPFs "em voo" ficam salvos como fila.
  async function processar(filaInicial, resultadosIniciais) {
    setRodando(true)
    pararRef.current = false
    const filaAtual = [...filaInicial]
    let acumulado = [...resultadosIniciais]
    const total = filaAtual.length + acumulado.length
    const emVoo = new Set()
    const persistir = () => salvar([...filaAtual, ...emVoo], acumulado)

    function registrar(item) {
      acumulado = [...acumulado, item]
      setResultados(acumulado)
      setFila([...filaAtual, ...emVoo])
      persistir()
      setMsg(`Consultando… ${acumulado.length}/${total} concluídas.`)
    }

    async function trabalhador() {
      while (filaAtual.length > 0 && !pararRef.current) {
        const cpf = filaAtual.shift()
        if (!cpf) continue
        emVoo.add(cpf)
        persistir()
        try {
          const r = await nvCheckCpf(cpf)
          emVoo.delete(cpf)
          registrar({ cpf, ...r })
        } catch (err) {
          emVoo.delete(cpf)
          registrar({ cpf, status_validacao: 'ERRO', erro: err.message })
        }
      }
    }

    setMsg('Iniciando consultas…')
    await Promise.all(Array.from({ length: Math.min(2, filaAtual.length) }, trabalhador))
    setRodando(false)
    setFila([...filaAtual])
    persistir()
    if (!filaAtual.length) setMsg(`Lote concluído: ${acumulado.length} CPF(s) consultados. ✅`)
    else setMsg(`Pausado: ${acumulado.length}/${total} feitas. Clique em "Continuar".`)
  }

  function iniciar() {
    const cpfs = parseCpfs(texto)
    if (!cpfs.length) { setMsg('Cole/suba um CSV com uma coluna de CPF (11 dígitos).'); return }
    setResultados([])
    processar(cpfs, [])
  }

  function novoLote() {
    pararRef.current = true
    localStorage.removeItem(CHAVE_STORAGE)
    setFila([]); setResultados([]); setTexto(''); setMsg(''); setVisiveis(PAGINA)
  }

  function baixarCSV() {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
    const linhas = [COLS.join(';')]
    for (const r of resultados) {
      linhas.push(COLS.map((c) => esc(c === 'cpf' ? fmtCpf(r.cpf) : r[c])).join(';'))
    }
    // BOM + \r\n: sem isso o Excel abre UTF-8 como Latin-1
    const url = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'obitos-nvcheck.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const total = fila.length + resultados.length
  const obitos = resultados.filter((r) => String(r.obito).toUpperCase() === 'S').length
  const erros = resultados.filter((r) => r.erro).length

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return resultados
    return resultados.filter((r) => [r.nome, r.cpf, r.cidade, r.email_1].some((c) => String(c || '').toLowerCase().includes(q)))
  }, [resultados, busca])

  return (
    <div>
      <header className="pagina-head"><h1>Óbitos</h1></header>
      <p className="ajuda">
        Consulta cadastral por CPF na <b>Nova Vida TI</b> (NVCheck): situação, <b>óbito</b>, score de
        risco, renda e contatos. Suba/cole um CSV com a coluna <b>cpf</b> — cada CPF consultado
        <b> gasta crédito NVCheck</b>. O resultado fica salvo neste navegador até você baixar o CSV.
      </p>

      {msg && <div className="banner">{msg}</div>}

      {!rodando && (
        <div className="ia-entrada">
          <div className="ia-entrada-topo">
            <div>
              <strong>Lista de CPFs</strong>
              <span className="ajuda"> — CSV com coluna <code>cpf</code>, ou um CPF por linha</span>
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
            placeholder={'Cole aqui ou arraste um CSV…\n\ncpf\n009.602.533-60\n618.860.841-49'}
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
              {parseCpfs(texto).length > 0
                ? <><b>{parseCpfs(texto).length}</b> CPF(s) prontos para consultar</>
                : 'nenhum CPF lido ainda'}
            </span>
            <span className="ajuda ia-entrada-dica">workflow NVCheck (Nova Vida TI) via n8n · 2 em paralelo</span>
          </div>
        </div>
      )}

      <div className="toolbar">
        {rodando ? (
          <button className="btn-refresh" onClick={() => { pararRef.current = true }}>Pausar</button>
        ) : (
          <>
            <button className="btn-primario" disabled={!parseCpfs(texto).length} onClick={iniciar}>
              {`Consultar ${parseCpfs(texto).length || ''} CPF(s)`}
            </button>
            {fila.length > 0 && (
              <button className="btn-primario" onClick={() => processar(fila, resultados)}>
                {`Continuar (faltam ${fila.length})`}
              </button>
            )}
          </>
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
        {total > 0 && (
          <span className="ajuda">
            {resultados.length}/{total} concluídas
            {obitos > 0 && <> · <b style={{ color: 'var(--vermelho)' }}>{obitos} óbito(s)</b></>}
            {erros > 0 && <> · {erros} erro(s)</>}
          </span>
        )}
      </div>

      {resultados.length > 0 && (
        <>
          <div className="toolbar">
            <input placeholder="Buscar nome, CPF, cidade ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="tabela-rolagem">
            <table className="preview contatos-tabela">
              <thead>
                <tr>
                  <th>Nome</th><th>CPF</th><th>Situação</th><th>Óbito</th><th>Risco</th><th>Telefone</th><th>E-mail</th><th>Cidade/UF</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, visiveis).map((r, i) => (
                  <tr key={r.cpf ?? i}>
                    <td className="cel-nome">
                      <div className="contato-nome">
                        <strong className="cel-trunca" title={r.nome}>{r.nome || '—'}</strong>
                        {r.possivel_profissao && <small className="contato-cargo cel-trunca" title={r.possivel_profissao}>{r.possivel_profissao}</small>}
                      </div>
                    </td>
                    <td className="cel-nowrap">{fmtCpf(r.cpf)}</td>
                    <td className="cel-nowrap">
                      {r.erro
                        ? <span className="pill pill-erro" title={r.erro}>erro</span>
                        : <span className={'pill ' + (String(r.situacao_cadastral).toUpperCase() === 'REGULAR' ? 'pill-ok' : 'pill-neutro')}>{r.situacao_cadastral || '—'}</span>}
                    </td>
                    <td className="cel-nowrap">
                      {String(r.obito).toUpperCase() === 'S'
                        ? <span className="pill pill-erro">✝ óbito</span>
                        : r.erro ? <span className="ajuda">—</span> : <span className="pill pill-ok">não</span>}
                    </td>
                    <td className="cel-nowrap" title={`score ${r.score ?? '—'}`}>{r.faixa_risco || '—'}</td>
                    <td className="cel-nowrap">{r.telefone_1 || '—'}{r.whatsapp_1 === 'SIM' ? ' 📱' : ''}</td>
                    <td className="cel-email"><span className="cel-trunca" title={r.email_1}>{r.email_1 || '—'}</span></td>
                    <td className="cel-nowrap">{r.cidade ? `${r.cidade}/${r.uf || ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length > visiveis && (
            <div ref={sentinelaRef} className="lote-sentinela">
              Mostrando {visiveis} de {filtrados.length} — role para carregar mais…
            </div>
          )}
        </>
      )}
    </div>
  )
}
