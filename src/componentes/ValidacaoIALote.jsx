import { useEffect, useRef, useState } from 'react'
import { validarDominioIA } from '../api/n8n'
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

export default function ValidacaoIALote() {
  const [texto, setTexto] = useState('')
  const [fila, setFila] = useState([])          // empresas ainda não processadas
  const [resultados, setResultados] = useState([]) // já validadas nesta sessão
  const [rodando, setRodando] = useState(false)
  const [msg, setMsg] = useState('')
  const [paralelo, setParalelo] = useState(3) // quantas rodam ao mesmo tempo
  const pararRef = useRef(false)

  // Recupera resultados de um lote interrompido (os dados também estão no banco).
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_STORAGE) || 'null')
      if (salvo?.resultados?.length) {
        setResultados(salvo.resultados)
        if (salvo.fila?.length) {
          setFila(salvo.fila)
          setMsg(`Lote anterior interrompido: faltam ${salvo.fila.length} empresa(s). Clique em "Continuar lote".`)
        }
      }
    } catch { /* storage corrompido: ignora */ }
  }, [])

  function salvarEstado(fila, resultados) {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ fila, resultados }))
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
  async function processar(filaInicial, resultadosIniciais) {
    const PARALELO = paralelo
    setRodando(true)
    pararRef.current = false
    const filaAtual = [...filaInicial]
    let acumulado = [...resultadosIniciais]
    const total = filaAtual.length + acumulado.length

    // registra um resultado e atualiza tela/estado (chamado pelos trabalhadores)
    function registrar(item) {
      acumulado = [...acumulado, item]
      setResultados(acumulado)
      setFila([...filaAtual])
      salvarEstado([...filaAtual], acumulado)
      setMsg(`Validando… ${acumulado.length}/${total} concluídas (${Math.min(PARALELO, filaAtual.length)} em paralelo).`)
    }

    async function trabalhador() {
      while (filaAtual.length > 0 && !pararRef.current) {
        const alvo = filaAtual.shift() // remove da fila ANTES de chamar (evita duplicar)
        try {
          const r = await validarDominioIA(alvo.empresa, alvo.cnpj, `lote-${total}`)
          registrar({ ...alvo, ...r })
        } catch (err) {
          const tentativas = (alvo.tentativas || 0) + 1
          if (tentativas <= 2) {
            // falha temporária (timeout/sobrecarga): volta pro FIM da fila e tenta de novo
            filaAtual.push({ ...alvo, tentativas })
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
    processar(linhas, [])
  }

  function novoLote() {
    pararRef.current = true
    localStorage.removeItem(CHAVE_STORAGE)
    setFila([]); setResultados([]); setTexto(''); setMsg('')
  }

  function baixarCSV() {
    const linhas = [['razao_social', 'cnpj', 'dominio', 'linkedin', 'emails', 'score', 'confianca', 'observacao']]
    for (const r of resultados) {
      linhas.push([
        r.razao_social || r.empresa || '', r.cnpj_informado || r.cnpj || '', r.dominio || '',
        r.linkedin || '', (Array.isArray(r.emails) ? r.emails.join(' | ') : r.emails) || '',
        String(r.score ?? ''), r.confianca || '', String(r.observacao || '').replace(/"/g, "'"),
      ])
    }
    const csv = linhas.map((l) => l.map((c) => `"${String(c)}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'validacao-dominios-ia.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const total = fila.length + resultados.length

  return (
    <div>
      <p className="ajuda">
        Cole/suba a lista (<b>empresa;cnpj</b>, uma por linha). O robô valida os domínios via IA
        (Serper → Snov → Apollo + RDAP) rodando <b>até 10 em paralelo</b> (10 jobs no n8n) e
        <b> salva cada resultado no banco</b>. Deixe a aba aberta; se fechar, dá pra continuar de onde parou.
      </p>

      {msg && <div className="banner">{msg}</div>}

      {!rodando && (
        <>
          <div className="lote-entrada">
            <label className="btn-secundario arquivo-label">
              Escolher CSV
              <input type="file" accept=".csv,text/csv,.txt" onChange={carregarArquivo} hidden />
            </label>
            <span className="ajuda">ou cole abaixo — uma empresa por linha (empresa;cnpj)</span>
          </div>
          <textarea
            className="lote-textarea"
            placeholder={'LUKE S ENGENHARIA LTDA;30.678.636/0001-58\nCOAMO AGROINDUSTRIAL COOPERATIVA;75.904.383/0001-21'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
          />
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
          <button className="btn-primario" onClick={() => processar(fila, resultados)}>
            {`Continuar lote (faltam ${fila.length})`}
          </button>
        )}
        {rodando && (
          <button className="btn-refresh" onClick={() => { pararRef.current = true }}>Pausar</button>
        )}
        {resultados.length > 0 && <button className="btn-refresh" onClick={baixarCSV}>Baixar resultado (CSV)</button>}
        {!rodando && (resultados.length > 0 || fila.length > 0) && (
          <button className="btn-refresh" onClick={novoLote}>Novo lote</button>
        )}
        {total > 0 && <span className="ajuda">{resultados.length}/{total} concluídas</span>}
      </div>

      {resultados.length > 0 && (
        <div className="lote-resultados">
          {resultados.map((r, i) => (
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
                <div className="empresa-linha"><span className="chave">E-mails</span><span>{r.emails.join(', ')}</span></div>
              )}
              {r.linkedin && r.linkedin !== '-' && (
                <div className="empresa-linha"><span className="chave">LinkedIn</span><a href={r.linkedin} target="_blank" rel="noreferrer">{r.linkedin}</a></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
