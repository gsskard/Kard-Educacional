import { useEffect, useMemo, useRef, useState } from 'react'
import { listarEmpresas, enriquecerEmpresa, sugerirDominios, iniciarValidacaoLote, lerValidacoes, rhPreview, rhRevelar, rhValidar } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'

// Cargos-alvo do filtro de RH: os mesmos termos que o back usa pra marcar `eh_rh`.
// Mostramos como hashtags no card pra deixar claro que contatos buscamos.
const CARGOS_ALVO = ['rh', 'recursos humanos', 'talent', 'recrutamento', 'people']

// Painel de troca de domínio: lista os domínios que a IA/Snov acharam com a
// contagem de e-mails públicos (grátis) + campo manual. Clicar em "enriquecer"
// re-busca os contatos de RH por aquele domínio — aí sim gasta crédito Snov.
function TrocaDominio({ empresa, onEnriquecer, onFechar }) {
  const [manual, setManual] = useState('')
  const [live, setLive] = useState(null)   // null = buscando; [] = sem sugestões
  useEffect(() => {
    let ativo = true
    sugerirDominios(empresa.empresa).then((s) => { if (ativo) setLive(s || []) })
    return () => { ativo = false }
  }, [empresa.empresa])

  // Junta os candidatos salvos (Snov, com ★ oficial) com as sugestões ao vivo
  // (Hunter), sem duplicar domínio, e ordena por quantidade de e-mails.
  const mapa = new Map()
  for (const c of (empresa.candidatos || [])) {
    mapa.set(c.domain, { domain: c.domain, count: c.emails ?? 0, oficial: c.oficial === true })
  }
  for (const s of (live || [])) {
    const ex = mapa.get(s.domain)
    if (ex) { if (ex.count == null) ex.count = s.total }
    else mapa.set(s.domain, { domain: s.domain, count: s.total ?? 0, oficial: false })
  }
  // Só mostra domínios com e-mails (>0) — mas sempre mantém o oficial (★) e o
  // domínio em uso, mesmo com 0 — pra não poluir com os chutes que a busca gera.
  const cands = [...mapa.values()]
    .filter((c) => (c.count || 0) > 0 || c.oficial || c.domain === empresa.dominio)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 10)
  const carregando = live === null

  return (
    <div className="dominio-picker">
      <div className="ajuda">
        Domínios de <b>{empresa.empresa}</b> — o número é de e-mails públicos (grátis).
        <b> Enriquecer</b> busca os contatos de RH na Snov e <b>gasta crédito</b>.
      </div>
      {carregando ? (
        <div className="ajuda">buscando domínios…</div>
      ) : cands.length > 0 ? (
        cands.map((c) => (
          <div key={c.domain} className={'dom-cand' + (c.domain === empresa.dominio ? ' atual' : '')}>
            <CompanyLogo dominio={c.domain} nome={c.domain} size={20} />
            <span className="dom-nome">{c.domain}{c.oficial ? ' ★' : ''}</span>
            <small>{c.count ?? 0} e-mail(s)</small>
            <button className="btn-mini" onClick={() => onEnriquecer(c.domain)}>enriquecer</button>
          </div>
        ))
      ) : (
        <div className="ajuda">Sem candidatos — digite o domínio abaixo e clique em usar.</div>
      )}
      <div className="dom-manual">
        <input placeholder="ex.: kard.com.br" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn-mini" disabled={!manual.trim()} onClick={() => onEnriquecer(manual.trim())}>usar</button>
        <button className="btn-mini" onClick={onFechar}>fechar</button>
      </div>
    </div>
  )
}

// Selo de validade do e-mail
function PillEmail({ valido }) {
  const v = String(valido || '').toLowerCase()
  if (v === 'valido' || v === 'valid') return <span className="pill pill-ok">VÁLIDO</span>
  if (v === 'invalido' || v === 'invalid') return <span className="pill pill-erro">INVÁLIDO</span>
  return <span className="pill pill-neutro">?</span>
}

// -------------------------------------------------------------------------
// Validação de domínio em lote
// Sobe um CSV com CNPJ / nome de empresa; para cada linha o n8n devolve os
// domínios candidatos (com a contagem de e-mails do Hunter — grátis), a logo
// e o palpite da IA (qual domínio é o corporativo mais provável + %).
// O analista escolhe o certo e clica "enriquecer" só nesse (aí sim gasta cota).
// -------------------------------------------------------------------------

// Lê um CSV simples (delimitador , ou ;). Aceita cabeçalho com colunas
// empresa/nome/razão social e cnpj; sem cabeçalho, adivinha pelas colunas.
function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!linhas.length) return []
  const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ','
  const split = (l) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
  const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const head = split(linhas[0]).map(norm)
  const colsEmp = ['empresa', 'nome', 'razaosocial', 'cliente', 'empregador']
  const temHeader = head.some((h) => colsEmp.includes(h) || h === 'cnpj')
  let idxEmp = -1, idxCnpj = -1
  if (temHeader) {
    idxEmp = head.findIndex((h) => colsEmp.includes(h))
    idxCnpj = head.findIndex((h) => h === 'cnpj')
  }
  const corpo = temHeader ? linhas.slice(1) : linhas
  const out = []
  for (const l of corpo) {
    const cols = split(l)
    let empresa = '', cnpj = ''
    if (temHeader) {
      empresa = idxEmp >= 0 ? (cols[idxEmp] || '') : ''
      cnpj = idxCnpj >= 0 ? (cols[idxCnpj] || '') : ''
    } else {
      const cnpjCol = cols.find((c) => c.replace(/\D/g, '').length >= 11)
      cnpj = cnpjCol || ''
      empresa = cols.find((c) => c && c !== cnpjCol) || cols[0] || ''
    }
    if (empresa) out.push({ empresa, cnpj })
  }
  return out
}

function ValidacaoLote({ onEnriquecido }) {
  const [entrada, setEntrada] = useState([])       // [{empresa, cnpj}] lido do CSV/texto
  const [arquivo, setArquivo] = useState('')
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([]) // linhas da tabela validacoes (candidatos já parseado)
  const [lote, setLote] = useState(null)           // { loteId, total }
  const [msg, setMsg] = useState('')
  const [rhPorCard, setRhPorCard] = useState({})   // { [key]: { dominio, loading, busy, prospects, sel:Set, msg } }
  const [dominioSel, setDominioSel] = useState({}) // domínio escolhido por empresa (key -> domínio)
  const [trocaDom, setTrocaDom] = useState(null)   // key da empresa com o seletor de domínio aberto
  const [nGlobal, setNGlobal] = useState(3)        // "liberar os primeiros N de cada"
  const [busca, setBusca] = useState('')           // filtro da planilha (empresa/cargo/nome/e-mail)
  const [emLoteRh, setEmLoteRh] = useState(false)  // operação de RH em lote em andamento
  const timerRef = useRef(null)

  // Atualiza o estado de RH de um card específico (merge parcial).
  function setRh(key, patch) {
    setRhPorCard((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  // Junta prospects atualizados (com e-mail/validade) na lista do card, casando por hash.
  // Só aplica campos preenchidos: uma resposta de revelar traz só o e-mail e uma de
  // validar só a validade, então não podemos sobrescrever o que já existe com vazio.
  function mesclarRh(key, atualizados) {
    setRhPorCard((prev) => {
      const atual = prev[key] || {}
      const mapa = new Map((atual.prospects || []).map((p) => [p.hash_revelar, p]))
      for (const a of atualizados) {
        const merged = { ...(mapa.get(a.hash_revelar) || {}) }
        for (const [k, v] of Object.entries(a)) {
          if (v !== null && v !== undefined && v !== '') merged[k] = v
        }
        mapa.set(a.hash_revelar, merged)
      }
      return { ...prev, [key]: { ...atual, prospects: [...mapa.values()] } }
    })
  }

  // Chave estável por empresa (mesma usada na tabela).
  const keyOf = (r, i) => (r.cnpj || '') + r.empresa + i
  // Domínio escolhido para a empresa (default = palpite da IA / 1º candidato).
  function domEscolhido(r, key) {
    const cands = r.candidatos || []
    return dominioSel[key] || r.melhor_dominio || (cands[0] && cands[0].domain) || ''
  }

  // Resumo global (medidor de crédito): listados/liberados/validados no total e
  // quantos contatos estão selecionados aguardando liberação (= créditos a gastar).
  const resumo = useMemo(() => {
    let listados = 0, liberados = 0, validados = 0, selNaoLib = 0
    for (const key of Object.keys(rhPorCard)) {
      const ps = rhPorCard[key].prospects || []
      const sel = rhPorCard[key].sel || new Set()
      listados += ps.length
      for (const p of ps) {
        if (p.email) liberados++
        if (p.status_validacao) validados++
        if (sel.has(p.hash_revelar) && !p.email) selNaoLib++
      }
    }
    return { listados, liberados, validados, selNaoLib }
  }, [rhPorCard])

  // GRÁTIS: lista o RH de uma empresa pelo domínio escolhido (sem revelar e-mail).
  async function listarRh(r, key, dominio) {
    setRh(key, { dominio, loading: true, busy: false, prospects: [], sel: new Set(), msg: '' })
    try {
      const lista = await rhPreview(r.empresa, r.cnpj, dominio, [])
      setRh(key, { loading: false, prospects: lista, msg: lista.length ? '' : 'Nenhum contato de RH neste domínio.' })
    } catch (err) {
      setRh(key, { loading: false, msg: '⏳ ' + err.message })
    }
  }

  // Troca o domínio da empresa e re-lista o RH (fecha o seletor inline).
  function mudarDom(r, key, dom) {
    setDominioSel((prev) => ({ ...prev, [key]: dom }))
    setTrocaDom(null)
    listarRh(r, key, dom)
  }

  // PAGO: revela o e-mail de um único contato (clique no cadeado da planilha).
  async function liberarUm(r, key, hash) {
    if (!window.confirm('Liberar este e-mail? Gasta 1 crédito Snov (se encontrado).')) return
    setRh(key, { busy: true })
    try { const at = await rhRevelar(r.cnpj, [hash], 'selecionados'); mesclarRh(key, at) }
    catch (err) { setMsg('⏳ ' + err.message) }
    finally { setRh(key, { busy: false }) }
  }

  // GRÁTIS em lote: lista o RH de todas as empresas de uma vez.
  async function listarTodas() {
    setEmLoteRh(true); setMsg('Listando RH de todas as empresas (grátis)…')
    try {
      for (let i = 0; i < resultados.length; i++) {
        const r = resultados[i], key = keyOf(r, i), dom = domEscolhido(r, key)
        if (!dom) continue
        setMsg(`Listando RH: ${r.empresa}…`)
        await listarRh(r, key, dom)
        await new Promise((res) => setTimeout(res, 250))
      }
      setMsg('RH listado para todas — nenhum crédito gasto. Selecione e libere só o que precisar.')
    } finally { setEmLoteRh(false) }
  }

  // PAGO em lote: libera os primeiros N contatos de cada empresa já listada.
  async function liberarPrimeirosDeCada() {
    const qtd = Math.max(1, Number(nGlobal) || 1)
    const alvos = resultados.map((r, i) => ({ r, key: keyOf(r, i) }))
      .filter(({ key }) => { const rh = rhPorCard[key]; return rh && (rh.prospects || []).some((p) => !p.email) })
    if (!alvos.length) { setMsg('Liste o RH primeiro ("Listar RH de todas").'); return }
    const est = alvos.reduce((acc, { key }) => {
      const rest = (rhPorCard[key].prospects || []).filter((p) => !p.email).length
      return acc + Math.min(qtd, rest)
    }, 0)
    if (!window.confirm(`Liberar os primeiros ${qtd} de ${alvos.length} empresa(s) ≈ ${est} crédito(s) Snov. Continuar?`)) return
    setEmLoteRh(true)
    try {
      for (const { r, key } of alvos) {
        setMsg(`Liberando ${r.empresa}…`)
        try { const at = await rhRevelar(r.cnpj, [], 'primeiros_n', qtd); mesclarRh(key, at) } catch { /* segue */ }
        await new Promise((res) => setTimeout(res, 350))
      }
      setMsg('E-mails liberados.')
    } finally { setEmLoteRh(false) }
  }

  // PAGO em lote: libera os contatos selecionados em todas as empresas.
  async function liberarSelecionadosTodas() {
    const alvos = resultados.map((r, i) => {
      const key = keyOf(r, i), rh = rhPorCard[key] || {}, sel = rh.sel || new Set()
      const hashes = (rh.prospects || []).filter((p) => sel.has(p.hash_revelar) && !p.email).map((p) => p.hash_revelar)
      return { r, key, hashes }
    }).filter((x) => x.hashes.length)
    const totalSel = alvos.reduce((a, x) => a + x.hashes.length, 0)
    if (!totalSel) { setMsg('Selecione ao menos um contato.'); return }
    if (!window.confirm(`Liberar ${totalSel} e-mail(s) selecionado(s) ≈ ${totalSel} crédito(s) Snov. Continuar?`)) return
    setEmLoteRh(true)
    try {
      for (const { r, key, hashes } of alvos) {
        setMsg(`Liberando ${r.empresa}…`)
        try { const at = await rhRevelar(r.cnpj, hashes, 'selecionados'); mesclarRh(key, at) } catch { /* segue */ }
        await new Promise((res) => setTimeout(res, 350))
      }
      setMsg('Selecionados liberados.')
    } finally { setEmLoteRh(false) }
  }

  // PAGO em lote: valida todos os e-mails já liberados.
  async function validarTodas() {
    const alvos = resultados.map((r, i) => {
      const key = keyOf(r, i), rh = rhPorCard[key] || {}
      const hashes = (rh.prospects || []).filter((p) => p.email).map((p) => p.hash_revelar)
      return { key, hashes, empresa: r.empresa }
    }).filter((x) => x.hashes.length)
    const total = alvos.reduce((a, x) => a + x.hashes.length, 0)
    if (!total) { setMsg('Nenhum e-mail liberado para validar.'); return }
    if (!window.confirm(`Validar ${total} e-mail(s) liberado(s)? A validação consome crédito Snov.`)) return
    setEmLoteRh(true)
    try {
      for (const { key, hashes, empresa } of alvos) {
        setMsg(`Validando ${empresa}…`)
        try { const at = await rhValidar(hashes); mesclarRh(key, at) } catch { /* segue */ }
        await new Promise((res) => setTimeout(res, 350))
      }
      setMsg('Validação concluída.')
    } finally { setEmLoteRh(false) }
  }

  function toggleRhSel(key, hash) {
    setRhPorCard((prev) => {
      const c = prev[key] || {}
      const s = new Set(c.sel || [])
      s.has(hash) ? s.delete(hash) : s.add(hash)
      return { ...prev, [key]: { ...c, sel: s } }
    })
  }

  // Marca/desmarca TODOS os contatos ainda sem e-mail visíveis na planilha.
  function alternarTodos(marcar) {
    setRhPorCard((prev) => {
      const next = { ...prev }
      for (const l of linhasPlanilha) {
        if (l.tipo !== 'contato' || l.p.email) continue
        const c = next[l.key] || {}
        const s = new Set(c.sel || [])
        if (marcar) s.add(l.p.hash_revelar); else s.delete(l.p.hash_revelar)
        next[l.key] = { ...c, sel: s }
      }
      return next
    })
  }

  // Retoma o último lote ao abrir a aba — permite fechar a tela e voltar depois.
  useEffect(() => {
    let salvo = null
    try { salvo = JSON.parse(localStorage.getItem('kard_lote') || 'null') } catch { salvo = null }
    if (salvo && salvo.loteId) { setLote(salvo); acompanhar(salvo.loteId, salvo.total) }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function carregarArquivo(ev) {
    const f = ev.target.files && ev.target.files[0]
    if (!f) return
    setArquivo(f.name)
    const leitor = new FileReader()
    leitor.onload = () => { setEntrada(parseCSV(String(leitor.result || ''))) }
    leitor.readAsText(f)
  }

  function carregarTexto() {
    setEntrada(parseCSV(texto)); setArquivo('')
  }

  // Lê os resultados salvos do lote e reagenda enquanto faltar empresa.
  async function acompanhar(loteId, total) {
    try {
      const rows = await lerValidacoes(loteId)
      setResultados(rows)
      if (!total || rows.length < total) {
        timerRef.current = setTimeout(() => acompanhar(loteId, total), 12000)
      } else {
        setMsg(`Lote concluído: ${rows.length}/${total} empresas. ✅`)
      }
    } catch (err) {
      timerRef.current = setTimeout(() => acompanhar(loteId, total), 15000)
    }
  }

  // Inicia o lote no servidor. Ele processa 1 empresa a cada ~20s (respeita a ReceitaWS 3/min);
  // a tela pode ser fechada — os resultados ficam salvos e reaparecem ao voltar.
  async function validar() {
    if (!entrada.length) return
    const loteId = 'L' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    setResultados([]); setMsg('')
    try {
      const r = await iniciarValidacaoLote(loteId, entrada)
      const total = (r && r.total) || entrada.length
      const eta = (r && r.eta_segundos) || total * 20
      const info = { loteId, total }
      setLote(info)
      localStorage.setItem('kard_lote', JSON.stringify(info))
      const min = Math.max(1, Math.round(eta / 60))
      setMsg(`Processando ${total} empresa(s) no servidor (~${min} min, cerca de 3/min pela Receita). Você pode fechar esta tela e voltar mais tarde — os resultados vão aparecendo aqui.`)
      if (timerRef.current) clearTimeout(timerRef.current)
      acompanhar(loteId, total)
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  function novoLote() {
    if (timerRef.current) clearTimeout(timerRef.current)
    localStorage.removeItem('kard_lote')
    setLote(null); setResultados([]); setMsg(''); setEntrada([]); setTexto(''); setArquivo('')
  }

  // Exporta a planilha: se já há RH listado, baixa os contatos (empresa→e-mail);
  // senão, baixa a validação de domínios.
  function baixarCSV() {
    const temContatos = Object.values(rhPorCard).some((c) => (c.prospects || []).length)
    let linhas
    if (temContatos) {
      linhas = [['empresa', 'cnpj', 'dominio', 'cargo', 'nome', 'email', 'validacao', 'linkedin']]
      resultados.forEach((r, i) => {
        const key = keyOf(r, i), rh = rhPorCard[key], dom = domEscolhido(r, key)
        for (const p of (rh && rh.prospects) || []) {
          linhas.push([r.empresa || '', r.cnpj || '', dom, p.cargo || '', p.nome || '', p.email || '', p.status_validacao || '', p.linkedin || ''])
        }
      })
    } else {
      linhas = [['empresa', 'cnpj', 'melhor_dominio_ia', 'probabilidade', 'justificativa', 'candidatos']]
      for (const r of resultados) {
        const cands = (r.candidatos || []).map((c) => `${c.domain}(${c.total})`).join(' | ')
        linhas.push([r.empresa || '', r.cnpj || '', r.melhor_dominio || '',
          String(r.probabilidade ?? ''), String(r.justificativa || '').replace(/"/g, "'"), cands])
      }
    }
    const csv = linhas.map((l) => l.map((c) => `"${String(c)}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = temContatos ? 'rh-contatos.csv' : 'validacao-dominios.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const feitas = resultados.length
  const total = (lote && lote.total) || 0

  // Linhas da planilha: uma por contato, agrupadas por empresa (a célula da
  // empresa/domínio só aparece na 1ª linha do grupo — visual de células mescladas).
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const q = norm(busca)
  const linhasPlanilha = []
  resultados.forEach((r, i) => {
    const key = keyOf(r, i), rh = rhPorCard[key], dom = domEscolhido(r, key)
    const ps = (rh && rh.prospects) || []
    if (!rh || rh.loading) {
      if (!q) linhasPlanilha.push({ tipo: 'empresa', estado: rh && rh.loading ? 'loading' : 'nao-listado', r, key, dom })
      return
    }
    const vis = q ? ps.filter((p) => [p.nome, p.cargo, p.email, r.empresa].some((x) => norm(x).includes(q))) : ps
    if (!vis.length) { if (!q) linhasPlanilha.push({ tipo: 'empresa', estado: 'sem-rh', r, key, dom }); return }
    vis.forEach((p, j) => linhasPlanilha.push({ tipo: 'contato', r, key, dom, p, primeira: j === 0, qtdGrupo: vis.length }))
  })
  const selecionaveis = linhasPlanilha.filter((l) => l.tipo === 'contato' && !l.p.email)
  const todosMarcados = selecionaveis.length > 0 &&
    selecionaveis.every((l) => (rhPorCard[l.key]?.sel || new Set()).has(l.p.hash_revelar))

  return (
    <div>
      <p className="ajuda">
        Suba um CSV com <b>CNPJ</b> e <b>nome da empresa</b> (colunas <code>empresa</code> e <code>cnpj</code>).
        O servidor processa <b>~3 empresas por minuto</b> (limite da Receita) e vai salvando os resultados —
        então <b>pode fechar a tela e voltar depois</b>. Listar o RH é <b>grátis</b>; só gasta crédito Snov ao
        <b> liberar</b> ou <b>validar</b> um e-mail — e dá pra fazer em lote pelos botões do topo.
      </p>

      {msg && <div className="banner">{msg}</div>}

      {!lote ? (
        <>
          <div className="lote-entrada">
            <label className="btn-secundario arquivo-label">
              Escolher CSV
              <input type="file" accept=".csv,text/csv" onChange={carregarArquivo} hidden />
            </label>
            {arquivo && <span className="arquivo-nome">{arquivo}</span>}
            <span className="ajuda">ou cole abaixo (uma empresa por linha):</span>
          </div>
          <textarea
            className="lote-textarea"
            placeholder={'empresa;cnpj\nMagazine Luiza;47.960.950/0001-21\nO Boticário;'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
          />
          <div className="toolbar">
            <button className="btn-refresh" onClick={carregarTexto} disabled={!texto.trim()}>Ler texto colado</button>
            <button className="btn-primario" onClick={validar} disabled={!entrada.length}>
              {`Validar ${entrada.length || ''} empresa(s)`}
            </button>
          </div>
        </>
      ) : (
        <div className="toolbar">
          <span className="ajuda">Lote em andamento: <b>{feitas}/{total}</b> concluídas.</span>
          {feitas > 0 && <button className="btn-refresh" onClick={baixarCSV}>Baixar resultado (CSV)</button>}
          <button className="btn-refresh" onClick={novoLote}>Novo lote</button>
        </div>
      )}

      {lote && feitas < total && <div className="loading">Aguardando o servidor processar… ({feitas}/{total})</div>}

      {feitas > 0 && (
        <>
          {/* Barra de ações em lote */}
          <div className="rh-barra">
            <button className="btn-primario" disabled={emLoteRh} onClick={listarTodas}>Listar RH de todas (grátis)</button>
            <span className="rh-inline">
              <button className="btn-refresh" disabled={emLoteRh} onClick={liberarPrimeirosDeCada}>Liberar primeiros</button>
              <input className="rh-n" type="number" min={1} value={nGlobal} onChange={(e) => setNGlobal(e.target.value)} />
              <span className="ajuda">de cada</span>
            </span>
            <input className="rh-filtro" placeholder="buscar (empresa, cargo, nome, e-mail)"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          {/* Medidor de crédito — sempre visível */}
          <div className="rh-meter">
            <span className="rh-meter-nums">{resumo.listados} listados · <b>{resumo.liberados}</b> liberados · {resumo.validados} validados</span>
            <span className={'rh-meter-custo' + (resumo.selNaoLib ? ' ativo' : '')}>
              {resumo.selNaoLib ? `${resumo.selNaoLib} selecionado(s) ≈ ${resumo.selNaoLib} crédito(s)` : 'nenhum selecionado'}
            </span>
            <button className="btn-primario" disabled={emLoteRh || !resumo.selNaoLib} onClick={liberarSelecionadosTodas}>🔓 Liberar selecionados</button>
            <button className="btn-refresh" disabled={emLoteRh || !resumo.liberados} onClick={validarTodas}>✓ Validar liberados</button>
          </div>

          {resumo.listados === 0 ? (
            <div className="secao"><div className="empty">
              Clique em <b>“Listar RH de todas (grátis)”</b> para preencher a planilha com os contatos de RH.
            </div></div>
          ) : (
            <div className="preview-wrap rh-wrap">
              <table className="preview planilha-rh">
                <thead>
                  <tr>
                    <th className="col-check"><input type="checkbox" checked={todosMarcados} onChange={(e) => alternarTodos(e.target.checked)} /></th>
                    <th>Empresa</th><th>Cargo</th><th>Contato</th><th>E-mail</th><th>Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasPlanilha.map((l, idx) => {
                    if (l.tipo === 'empresa') {
                      return (
                        <tr className="pl-vazia grupo-inicio" key={l.key + idx}>
                          <td className="col-check"></td>
                          <td className="cel-empresa" data-label="Empresa"><span className="empresa-cel"><CompanyLogo dominio={l.dom} nome={l.r.empresa} size={22} />{l.r.empresa}</span></td>
                          <td colSpan={4} className="ajuda" data-label="RH">
                            {l.estado === 'loading' ? 'listando RH…' : l.estado === 'sem-rh' ? 'nenhum contato de RH neste domínio' : 'RH ainda não listado'}
                          </td>
                        </tr>
                      )
                    }
                    const { r, key, dom, p } = l
                    const sel = rhPorCard[key]?.sel || new Set()
                    const cands = r.candidatos || []
                    return (
                      <tr className={'pl-contato' + (l.primeira ? ' grupo-inicio' : ' continuacao')} key={key + '-' + (p.hash_revelar || idx)}>
                        <td className="col-check">
                          {!p.email && <input type="checkbox" checked={sel.has(p.hash_revelar)} onChange={() => toggleRhSel(key, p.hash_revelar)} />}
                        </td>
                        <td className="cel-empresa" data-label="Empresa">
                          <span className="empresa-cel"><CompanyLogo dominio={dom} nome={r.empresa} size={22} />{r.empresa}</span>
                          {l.primeira && (
                            <div className="cel-dom">
                              {trocaDom === key && cands.length ? (
                                <select className="dom-select" autoFocus value={dom}
                                  onChange={(e) => mudarDom(r, key, e.target.value)} onBlur={() => setTrocaDom(null)}>
                                  {cands.map((c) => <option key={c.domain} value={c.domain}>{c.domain} ({c.total}){c.oficial ? ' ★' : ''}</option>)}
                                </select>
                              ) : (
                                <>{dom || '—'}{cands.length > 1 && <button className="link-mini" onClick={() => setTrocaDom(key)}>trocar</button>}</>
                              )}
                            </div>
                          )}
                        </td>
                        <td data-label="Cargo">{p.cargo || '—'}</td>
                        <td data-label="Contato">
                          <span className="pl-nome">{p.nome || '—'}</span>
                          {p.linkedin && <a className="pl-linkedin" href={p.linkedin} target="_blank" rel="noreferrer" title="LinkedIn">in</a>}
                        </td>
                        <td className="cel-email" data-label="E-mail">
                          {p.email
                            ? <span className="rh-email-val">{p.email}</span>
                            : <button className="btn-liberar" disabled={rhPorCard[key]?.busy} onClick={() => liberarUm(r, key, p.hash_revelar)}>🔓 liberar</button>}
                        </td>
                        <td data-label="Validade">{p.email ? <PillEmail valido={p.status_validacao} /> : <span className="ajuda">—</span>}</td>
                      </tr>
                    )
                  })}
                  {q && !linhasPlanilha.length && (
                    <tr><td className="col-check"></td><td colSpan={5} className="ajuda">Nada casa com “{busca}”.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <small className="ajuda">Marque contatos e use os botões do topo, ou clique em <b>🔓 liberar</b> numa linha pra soltar só ela. Domínio errado? Clique em “trocar”.</small>
        </>
      )}
    </div>
  )
}

// Tela de Empresas (RF-09/10/33/37): empresas enriquecidas via Hunter —
// logo, CNPJ, domínio/site, localização, nº de funcionários, categoria e os
// e-mails de RH com cargo/validade. Duas visões: Cartões e Tabela (tipo Excel).
// Aba extra: Validação de domínio em lote (CSV → candidatos + IA).

export default function Empresas() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState('empresas')       // 'empresas' | 'lote'
  const [view, setView] = useState('cards')         // 'cards' | 'tabela'
  const [emLote, setEmLote] = useState(false)
  const [pickerKey, setPickerKey] = useState(null)  // card com o seletor de domínio aberto

  async function carregar() {
    setLoading(true); setErro('')
    try {
      setRows(await listarEmpresas())
    } catch (e) {
      setErro('Ainda não consigo ler as empresas do n8n (' + e.message + ').')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((e) =>
      [e.empresa, e.cnpj, e.dominio, e.localizacao].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  // Exporta a tabela (uma linha por contato de RH) em CSV que o Excel abre.
  // BOM UTF-8 pros acentos e ; como separador (padrão do Excel pt-BR).
  function exportarExcel() {
    const cols = ['Empresa', 'CNPJ', 'Localização', 'Porte', 'Capital social', 'Categoria', 'Domínio', 'Nome', 'Cargo', 'E-mail', 'Validade', 'Enriquecido em']
    const esc = (v) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[";\n]/.test(s) ? `"${s}"` : s
    }
    const validadeTxt = (em) => (em.valido === true ? 'Válido' : em.valido === false ? 'Inválido' : '—')
    const linhas = []
    for (const e of visiveis) {
      const base = [e.empresa, e.cnpj, e.localizacao, e.porte, e.capital_social, e.categoria, e.dominio]
      const emails = e.emails_rh || []
      if (emails.length === 0) {
        linhas.push([...base, '', '', '', '', e.enriquecido_em])
      } else {
        for (const em of emails) {
          linhas.push([...base, em.nome, em.cargo, em.email, validadeTxt(em), e.enriquecido_em])
        }
      }
    }
    const csv = [cols, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const hoje = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `empresas-rh-${hoje}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Enriquece TODAS as empresas. Sem forçar: as que já estão no cache Redis
  // não gastam crédito; as que faltam (ex.: sem localização) vão ao Hunter.
  async function enriquecerTudo() {
    if (!window.confirm(`Enriquecer as ${rows.length} empresas? As que já estão no cache não gastam crédito; as novas consultam o Hunter.`)) return
    setEmLote(true); setMsg('')
    try {
      let n = 0
      for (const e of rows) {
        setMsg(`Enriquecendo ${++n}/${rows.length}: ${e.empresa}…`)
        await enriquecerEmpresa(e.empresa, e.cnpj, false, e.dominio)
        await new Promise((r) => setTimeout(r, 800))
      }
      setMsg('Enriquecimento em lote concluído. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    } finally {
      setEmLote(false)
    }
  }

  // reenriquecer força nova busca no Hunter (ignora o cache Redis)
  async function enriquecer(e) {
    try {
      setMsg(`Reenriquecendo "${e.empresa}" via Hunter (ignorando cache)...`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true, e.dominio)
      setMsg('Enriquecimento atualizado. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  // usa o domínio escolhido pelo usuário e reenriquece por esse domínio
  async function escolherDominio(e, dominio) {
    setPickerKey(null)
    try {
      setMsg(`Reenriquecendo "${e.empresa}" pelo domínio ${dominio}...`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true, dominio)
      setMsg('Domínio atualizado. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Empresas</h1></header>

      <div className="view-toggle abas-topo">
        <button className={aba === 'empresas' ? 'ativo' : ''} onClick={() => setAba('empresas')}>Empresas enriquecidas</button>
        <button className={aba === 'lote' ? 'ativo' : ''} onClick={() => setAba('lote')}>Validação de domínio em lote</button>
      </div>

      {aba === 'lote' ? (
        <ValidacaoLote onEnriquecido={carregar} />
      ) : (
      <>
      <p className="ajuda">Empresas enriquecidas via Snov.io: domínio, site, localização, porte, categoria, logo e e-mails de RH com cargo (RF-09/10/37).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <input placeholder="Buscar empresa, CNPJ, domínio ou local..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
        <button className="btn-primario" disabled={emLote || rows.length === 0} onClick={enriquecerTudo}>
          {emLote ? 'Enriquecendo…' : 'Enriquecer tudo'}
        </button>
        <button className="btn-refresh btn-excel" disabled={visiveis.length === 0} onClick={exportarExcel} title="Exportar Excel" aria-label="Exportar Excel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z" fill="#fff" stroke="#1D6F42" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M13 2v7h7" stroke="#1D6F42" strokeWidth="1.5" strokeLinejoin="round"/>
            <rect x="7" y="12" width="10" height="7" rx="1" fill="#1D6F42"/>
            <path d="M9.4 13.7l3.2 3.6M12.6 13.7l-3.2 3.6" stroke="#fff" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="view-toggle">
          <button className={view === 'cards' ? 'ativo' : ''} onClick={() => setView('cards')}>Cartões</button>
          <button className={view === 'tabela' ? 'ativo' : ''} onClick={() => setView('tabela')}>Tabela</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="secao"><div className="empty">Nenhuma empresa enriquecida ainda.</div></div>
      ) : view === 'cards' ? (
        <div className="empresas-grid">
          {visiveis.map((e, i) => (
            <div className="empresa-card" key={e.cnpj || e.empresa || i}>
              <div className="empresa-topo">
                <CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={48} />
                <div className="empresa-id">
                  <div className="empresa-nome">{e.empresa || '—'}</div>
                  <div className="empresa-cnpj">{e.cnpj || 'CNPJ —'}</div>
                </div>
              </div>

              <div className="empresa-linha">
                <span className="chave">Domínio</span>
                <span className="dom-linha">
                  {e.dominio || '—'}
                  {e.dominio_count != null && <small className="dom-count">· {e.dominio_count} e-mail(s)</small>}
                  <button className="link-mini" onClick={() => setPickerKey(pickerKey === (e.cnpj || e.empresa || i) ? null : (e.cnpj || e.empresa || i))}>trocar</button>
                </span>
              </div>
              {pickerKey === (e.cnpj || e.empresa || i) && (
                <TrocaDominio
                  empresa={e}
                  onEnriquecer={(dom) => {
                    if (window.confirm(`Enriquecer "${e.empresa}" pelo domínio ${dom}?\nIsso busca os contatos de RH na Snov e gasta crédito.`)) escolherDominio(e, dom)
                  }}
                  onFechar={() => setPickerKey(null)}
                />
              )}
              <div className="empresa-linha"><span className="chave">Site</span>{e.site ? <a href={e.site} target="_blank" rel="noreferrer">{e.site}</a> : <span>—</span>}</div>
              <div className="empresa-linha"><span className="chave">Localização</span><span>{e.localizacao || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Porte</span><span>{e.porte || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Capital social</span><span>{e.capital_social || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Categoria</span><span>{e.categoria || '—'}</span></div>

              <div className="empresa-rh">
                <div className="chave">
                  Contatos encontrados: {e.total_prospects ?? 0}
                  {(e.total_rh ?? 0) > 0 && <span className="tag-rh"> · {e.total_rh} de RH</span>}
                </div>
                <div className="cargos-alvo">
                  {CARGOS_ALVO.map((c) => <span className="hashtag" key={c}>#{c.replace(/\s+/g, '')}</span>)}
                </div>
                {(e.emails_rh && e.emails_rh.length > 0) ? (
                  <>
                    <small className="ajuda">E-mails já liberados ({e.emails_rh.length}):</small>
                    {e.emails_rh.map((em, j) => (
                      <div className="rh-item" key={j}>
                        <span className="rh-info">
                          <span>{em.email || em}</span>
                          {em.cargo && <small className="rh-cargo">{em.cargo}</small>}
                        </span>
                        <PillEmail valido={em.valido} />
                      </div>
                    ))}
                  </>
                ) : (e.total_prospects ?? 0) > 0 ? (
                  <span className="ajuda">Nenhum e-mail liberado ainda — use “liberar RH” para revelar (custo: 1 crédito por e-mail).</span>
                ) : (
                  <span className="ajuda">Nenhum contato encontrado para este domínio.</span>
                )}
              </div>

              <div className="acoes">
                <button className="btn-mini" onClick={() => enriquecer(e)}>reenriquecer</button>
                {e.enriquecido_em && <span className="ajuda">enriquecido em {e.enriquecido_em}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-wrap tabela-full">
          <table className="grade">
            <thead>
              <tr>
                <th className="col-emp">Empresa</th>
                <th>CNPJ</th>
                <th>Localização</th>
                <th>Porte</th>
                <th>Domínio</th>
                <th>Nome</th>
                <th>Cargo</th>
                <th>E-mail</th>
                <th className="col-cen">Validade</th>
                <th>Enriquecido em</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.flatMap((e, i) => {
                const emails = e.emails_rh || []
                const cnpj = e.cnpj || '—'
                const cabec = () => (
                  <>
                    <td className="col-emp"><span className="empresa-cel"><CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={22} />{e.empresa || '—'}</span></td>
                    <td>{cnpj}</td>
                    <td>{e.localizacao || '—'}</td>
                    <td>{e.porte || '—'}</td>
                    <td>{e.dominio || '—'}</td>
                  </>
                )
                if (emails.length === 0) {
                  return [(
                    <tr key={cnpj + '-vazia'} className="grupo-inicio">
                      {cabec()}
                      <td colSpan={3} className="cel-vazia">nenhum RH liberado ainda</td>
                      <td className="col-cen">—</td>
                      <td>{e.enriquecido_em || '—'}</td>
                    </tr>
                  )]
                }
                return emails.map((em, j) => (
                  <tr key={cnpj + '-' + j} className={j === 0 ? 'grupo-inicio' : 'grupo-cont'}>
                    {j === 0
                      ? cabec()
                      : <><td className="col-emp"></td><td></td><td></td><td></td><td></td></>}
                    <td>{em.nome || '—'}</td>
                    <td>{em.cargo || '—'}</td>
                    <td className="cel-email">{em.email || '—'}</td>
                    <td className="col-cen"><PillEmail valido={em.valido} /></td>
                    <td>{j === 0 ? (e.enriquecido_em || '—') : ''}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
          <small className="ajuda">Uma linha por contato de RH liberado. Use os cartões para liberar novos e-mails.</small>
        </div>
      )}
      </>
      )}
    </div>
  )
}
