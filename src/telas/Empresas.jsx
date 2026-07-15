import { useEffect, useMemo, useRef, useState } from 'react'
import { listarEmpresas, enriquecerEmpresa, descobrirEmpresa, descobrirRapido, salvarEmpresa, ocultarEmpresa, sugerirDominios, iniciarValidacaoLote, lerValidacoes, rhPreview, rhRevelar, rhValidar } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'
import PainelEmpresa from '../componentes/PainelEmpresa'
import { nomeProprio, formatarCnpj, confiancaDominio, faltaLiberarRh } from '../lib/formato'
import { iniciarLoteJob, assinarLote, estadoLote, limparConcluidoLote, resolverPendente, descartarPendente } from '../lib/loteJob'

// Cargos-alvo do filtro de RH: os mesmos termos que o back usa pra marcar `eh_rh`.
// Mostramos como hashtags no card pra deixar claro que contatos buscamos.
const CARGOS_ALVO = ['rh', 'recursos humanos', 'talent', 'recrutamento', 'people']

// Adicionar/editar/ocultar empresa dependem das rotas empresa-salvar/empresa-ocultar
// no n8n, que ainda NÃO foram publicadas. Enquanto não existirem, os botões ficam
// escondidos pra não dar erro de rede. Virar true assim que o backend subir.
const CRUD_EMPRESA_ATIVO = false

// Chip de confiança do domínio (verificação RDAP): % + bolinha colorida. Vazio =
// não verificável → vermelho. Reusado nas duas visões de tabela de Empresas.
// Selo "escolhido pelo robô": aparece quando o domínio foi decidido automaticamente
// pela descoberta (IA + Snov + RDAP), sem o usuário ter forçado. Some se foi manual.
function SeloRobo({ e }) {
  if (!e || !(e.dominio_por_robo === true || e.dominio_por_robo === 't')) return null
  return <span className="selo-robo" title="Domínio escolhido automaticamente pelo robô (IA + Snov + RDAP). Você pode trocar se estiver errado.">🤖 robô</span>
}

function ChipConfianca({ e }) {
  const cf = confiancaDominio(e.dominio_score)
  const tt = 'Confiança do domínio (RDAP): ' + (cf.pct != null ? cf.pct + '% · ' : '') + cf.txt
    + (e.razao_titular ? ' · titular: ' + e.razao_titular : '')
    + (e.cnpj_titular ? ' · CNPJ ' + e.cnpj_titular : '')
  return (
    <span className={'conf-chip conf-' + cf.cor} title={tt}>
      <i className="conf-dot" />{cf.pct != null ? cf.pct + '%' : '—'}
    </span>
  )
}

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
  // Mostra todos os candidatos (mesmo os de 0 e-mail), ordenados por quantidade.
  const cands = [...mapa.values()].sort((a, b) => (b.count || 0) - (a.count || 0))
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

// Escolha de domínio de uma empresa INCERTA (fase de confirmação do lote).
// Mostra os candidatos da descoberta (grátis) + a sugestão da IA em destaque.
// Clicar em "usar" lista o RH daquele domínio (aí sim gasta crédito).
function EscolhaDominio({ item, onUsar, onDescartar }) {
  const [manual, setManual] = useState('')
  const rec = (item.ia && item.ia.recomendado) || item.dominio_sugerido || ''
  // Ordena pela confiança (score 0-100 vindo do back: casa CNPJ via RDAP > nome >
  // domínio oficial > e-mails). Empate → mais e-mails públicos.
  const cands = (item.candidatos || []).slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.emails || 0) - (a.emails || 0))
  return (
    <div className="pendente-emp">
      <div className="pendente-topo">
        <CompanyLogo dominio={rec} nome={item.empresa} size={28} />
        <div className="pendente-nome">
          <strong>{nomeProprio(item.empresa)}</strong>
          <small>{formatarCnpj(item.cnpj) || 'sem CNPJ'}</small>
        </div>
        <button className="btn-mini" onClick={onDescartar}>descartar</button>
      </div>
      {item.ia && item.ia.motivo && <div className="pendente-ia">🤖 IA: {item.ia.motivo}</div>}
      <div className="ajuda">Escolha o domínio certo — só então listamos o RH (<b>gasta crédito</b>).</div>
      <div className="dominio-picker">
        {cands.length > 0 ? cands.map((c) => (
          <div key={c.domain} className={'dom-cand' + (c.domain === rec ? ' recomendado' : '') + (c.match_cnpj ? ' confere' : '')}>
            <CompanyLogo dominio={c.domain} nome={c.domain} size={20} />
            <div className="dom-info">
              <span className="dom-nome">
                {c.domain}{c.oficial ? ' ★' : ''}
                {c.domain === rec && <span className="dom-ia">IA sugere</span>}
                {c.match_cnpj && <span className="dom-confere" title="O CNPJ do titular do domínio (WHOIS/RDAP) bate com o CNPJ da empresa">CNPJ confere ✓</span>}
              </span>
              {c.razao_rdap && <small className="dom-razao">titular: {nomeProprio(c.razao_rdap)}</small>}
            </div>
            {typeof c.score === 'number' && (
              <div className="dom-conf" title={`confiança ${c.score}%`}>
                <div className="barra"><div className="barra-fill" style={{ width: Math.max(0, Math.min(100, c.score)) + '%' }} /></div>
                <small>{c.score}%</small>
              </div>
            )}
            <small className="dom-emails">{c.emails ?? 0} e-mail(s)</small>
            <button className="btn-mini" onClick={() => onUsar(c.domain)}>usar</button>
          </div>
        )) : <div className="ajuda">Sem candidatos — digite o domínio abaixo.</div>}
        <div className="dom-manual">
          <input placeholder="ex.: empresa.com.br" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="btn-mini" disabled={!manual.trim()} onClick={() => onUsar(manual.trim())}>usar</button>
        </div>
      </div>
    </div>
  )
}

// Formulário de cadastro/edição manual de empresa (modal). No modo 'novo' o CNPJ é
// obrigatório (é a chave da lista, agrupada por CNPJ); no 'editar' ele fica fixo.
// Domínio é opcional — se ficar vazio no cadastro, a tela dispara a descoberta grátis.
function FormEmpresa({ inicial, salvando, onSalvar, onFechar }) {
  const ed = inicial.modo === 'editar'
  const [f, setF] = useState(inicial)
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }))
  const cnpjDigits = String(f.cnpj || '').replace(/\D/g, '')
  const podeSalvar = f.empresa.trim() && (ed || cnpjDigits.length === 14)
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-emp" onClick={(e) => e.stopPropagation()}>
        <h3>{ed ? 'Editar empresa' : 'Adicionar empresa'}</h3>
        <label className="campo">
          <span>Empresa *</span>
          <input value={f.empresa} onChange={set('empresa')} placeholder="Razão social ou nome" autoFocus />
        </label>
        <label className="campo">
          <span>CNPJ {ed ? '(fixo)' : '*'}</span>
          <input value={f.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" disabled={ed} />
          {!ed && cnpjDigits.length > 0 && cnpjDigits.length !== 14 && (
            <small className="campo-erro">CNPJ precisa ter 14 dígitos.</small>
          )}
        </label>
        <label className="campo">
          <span>Domínio</span>
          <input value={f.dominio} onChange={set('dominio')} placeholder="ex.: empresa.com.br (opcional)" />
        </label>
        <div className="campo-dupla">
          <label className="campo"><span>Localização</span><input value={f.localizacao} onChange={set('localizacao')} placeholder="Cidade/UF" /></label>
          <label className="campo"><span>Porte</span><input value={f.porte} onChange={set('porte')} placeholder="ex.: Grande porte" /></label>
        </div>
        {!ed && <small className="ajuda">Sem domínio? A gente descobre grátis (RDAP/Snov) ao salvar.</small>}
        <div className="modal-acoes">
          <button className="btn-refresh" onClick={onFechar} disabled={salvando}>cancelar</button>
          <button className="btn-primario" disabled={!podeSalvar || salvando} onClick={() => onSalvar({ ...f, modo: inicial.modo })}>
            {salvando ? 'salvando…' : 'salvar'}
          </button>
        </div>
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

// Reduz uma URL/site a só o host (tira https://, www e o caminho): a Snov
// e o rh-preview esperam o domínio "pelado" (ex.: magazineluiza.com.br).
function soHost(v) {
  let s = String(v || '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '')
  s = s.split('/')[0].split('?')[0].split('#')[0]
  return s.trim()
}

// Lê um CSV simples (delimitador , ou ;). Aceita cabeçalho com colunas
// empresa/nome/razão social, cnpj e — opcional — site/domínio; sem cabeçalho,
// adivinha pelas colunas (CNPJ pelos dígitos, domínio pelo ponto sem espaço).
function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!linhas.length) return []
  const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ','
  const split = (l) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
  const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const head = split(linhas[0]).map(norm)
  const colsEmp = ['empresa', 'nome', 'razaosocial', 'cliente', 'empregador']
  const colsDom = ['dominio', 'site', 'url', 'website', 'link', 'dominiocorporativo', 'pagina']
  const temHeader = head.some((h) => colsEmp.includes(h) || h === 'cnpj' || colsDom.includes(h))
  let idxEmp = -1, idxCnpj = -1, idxDom = -1
  if (temHeader) {
    idxEmp = head.findIndex((h) => colsEmp.includes(h))
    idxCnpj = head.findIndex((h) => h === 'cnpj')
    idxDom = head.findIndex((h) => colsDom.includes(h))
  }
  const corpo = temHeader ? linhas.slice(1) : linhas
  const out = []
  for (const l of corpo) {
    const cols = split(l)
    let empresa = '', cnpj = '', dominio = ''
    if (temHeader) {
      empresa = idxEmp >= 0 ? (cols[idxEmp] || '') : ''
      cnpj = idxCnpj >= 0 ? (cols[idxCnpj] || '') : ''
      dominio = idxDom >= 0 ? soHost(cols[idxDom]) : ''
    } else {
      const cnpjCol = cols.find((c) => c.replace(/\D/g, '').length >= 11)
      cnpj = cnpjCol || ''
      // domínio = coluna com ponto, sem espaço, que não seja o CNPJ
      const domCol = cols.find((c) => c !== cnpjCol && /\./.test(c) && !/\s/.test(c) && c.replace(/\D/g, '').length < 11)
      dominio = soHost(domCol)
      // nome = coluna que não é o CNPJ nem o domínio E não parece um CNPJ (evita
      // usar "01.105.558/0001-02" como nome quando só o CNPJ foi colado).
      empresa = cols.find((c) => c && c !== cnpjCol && c !== domCol && c.replace(/\D/g, '').length < 11) || ''
    }
    // aceita a linha se tiver ao menos um identificador (nome, CNPJ ou domínio).
    if (empresa || cnpj || dominio) out.push({ empresa, cnpj, dominio })
  }
  return out
}

function ValidacaoLote({ onEnriquecido, irParaEmpresas }) {
  const [entrada, setEntrada] = useState([])       // [{empresa, cnpj, dominio}] lido do CSV/texto
  const [arquivo, setArquivo] = useState('')
  const [texto, setTexto] = useState('')
  const [job, setJob] = useState(estadoLote())      // progresso do lote (global, sobrevive à troca de aba)
  const concluiuRef = useRef(job.concluido)
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

  // Monta as linhas da "planilha" a partir dos registros importados (com domínio).
  // melhor_dominio já vem da planilha; candidatos = só esse domínio (marcado oficial).
  const semear = (registros) => registros.map((r) => ({
    empresa: r.empresa,
    cnpj: r.cnpj,
    melhor_dominio: r.dominio || '',
    candidatos: r.dominio ? [{ domain: r.dominio, total: null, oficial: true }] : [],
  }))

  // Limpa qualquer resquício de lote antigo (o fluxo agora enriquece na hora via rh-preview).
  useEffect(() => {
    try { localStorage.removeItem('kard_lote') } catch { /* ignora */ }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Assina o job global: o progresso aparece mesmo se a tela foi remontada.
  useEffect(() => assinarLote(setJob), [])

  // Fases do lote: descobrir (grátis) e listar (gasta crédito). Compartilhado
  // pelo início do lote e pela resolução de cada empresa incerta (pendente).
  const fnsLote = useMemo(() => ({
    descobrir: descobrirEmpresa,
    listar: (e, c, d) => enriquecerEmpresa(e, c, false, d),
  }), [])

  // Quando o lote termina, atualiza a lista. Só volta pra aba Empresas se NÃO
  // sobrou nenhuma empresa aguardando escolha de domínio (senão fica aqui pra resolver).
  useEffect(() => {
    if (job.concluido && !concluiuRef.current) {
      concluiuRef.current = true
      onEnriquecido && onEnriquecido()
      if (!job.pendentes.length) irParaEmpresas && irParaEmpresas()
      limparConcluidoLote()
    }
    if (!job.concluido) concluiuRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.concluido])

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
  // Enriquece cada empresa via rh-preview (GRÁTIS): descobre o domínio (Receita)
  // quando não veio na planilha, e lista o RH — salvando no rh_enriquecimento.
  // Empresas COM domínio na planilha pulam a Receita (vão direto na Snov, rápido).
  // Sem domínio, respeitamos ~3/min da Receita entre as chamadas.
  function validar() {
    if (!entrada.length || job.rodando) return
    setMsg('')
    // dispara o job global; ele continua rodando mesmo se você trocar de aba/tela.
    // Fase 1 descobre o domínio (grátis); confiança alta lista sozinho, baixa cai em "Confirmar domínio".
    iniciarLoteJob(entrada, fnsLote, onEnriquecido)
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
      <p className="ajuda lote-intro">
        Suba um CSV (ou cole abaixo) com <b>nome da empresa</b> e <b>CNPJ</b> — e, se tiver, o <b>site/domínio</b>.
        Ao clicar em <b>Descobrir</b>, achamos o domínio (<b>grátis</b>): se estiver claro, já listamos o RH;
        se ficar <b>incerto</b>, mostramos os candidatos + sugestão da <b>IA</b> em <b>Confirmar domínio</b> pra você
        escolher o certo — só então gasta crédito.
      </p>

      {msg && <div className="banner">{msg}</div>}

      {job.rodando ? (
        <div className="lote-progresso">
          <div className="lote-prog-topo">
            <strong>Descobrindo domínio &amp; listando RH…</strong>
            <span className="lote-prog-n">{job.n}/{job.total}</span>
          </div>
          <div className="barra"><div className="barra-fill" style={{ width: job.total ? `${Math.round((job.n / job.total) * 100)}%` : '0%' }} /></div>
          <div className="ajuda">
            processando: <b>{nomeProprio(job.nome)}</b>
            {' '}· pode <b>trocar de aba/tela</b> à vontade que ele continua rodando aqui.
          </div>
        </div>
      ) : (
        <div className="lote-card">
          <div className="lote-topo">
            <label className="arquivo-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Escolher CSV
              <input type="file" accept=".csv,text/csv" onChange={carregarArquivo} hidden />
            </label>
            {arquivo && <span className="arquivo-nome">{arquivo}</span>}
            <span className="lote-ou">ou cole abaixo — uma empresa por linha</span>
          </div>
          <textarea
            className="lote-textarea"
            placeholder={'empresa;cnpj;site\nMagazine Luiza;47.960.950/0001-21;magazineluiza.com.br\nO Boticário;;boticario.com.br'}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setEntrada(parseCSV(e.target.value)) }}
            rows={5}
          />
          <div className="lote-rodape">
            <span className="ajuda">
              {entrada.length > 0
                ? <><b>{entrada.length}</b> empresa(s) lida(s){entrada.filter((r) => r.dominio).length > 0 && <> · {entrada.filter((r) => r.dominio).length} já com domínio</>}</>
                : 'nenhuma empresa lida ainda'}
            </span>
            <button className="btn-primario" onClick={validar} disabled={!entrada.length}>
              {`Descobrir domínio & RH de ${entrada.length || ''} empresa(s)`}
            </button>
          </div>
        </div>
      )}

      {job.pendentes.length > 0 && (
        <div className="confirmar-dominio">
          <h3>Confirmar domínio ({job.pendentes.length})</h3>
          <p className="ajuda">
            Estas empresas ficaram <b>incertas</b> na descoberta (sem CNPJ ou sem domínio oficial claro).
            Escolha o domínio correto pra listar o RH — só aí gasta crédito.
          </p>
          {job.pendentes.map((item, i) => (
            <EscolhaDominio
              key={(item.cnpj || item.empresa) + '-' + i}
              item={item}
              onUsar={(dom) => resolverPendente(item, dom, fnsLote, onEnriquecido)}
              onDescartar={() => descartarPendente(item)}
            />
          ))}
        </div>
      )}

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
  const [revelando, setRevelando] = useState(new Set()) // ids de RH sendo desbloqueados
  const [mostrarSemEmail, setMostrarSemEmail] = useState(false) // na Tabela: exibir contatos sem e-mail liberado
  const [empresaAberta, setEmpresaAberta] = useState(null)      // chave da empresa com o painel lateral aberto
  const [ordCol, setOrdCol] = useState(null)     // coluna de ordenação (null = ordem do back)
  const [ordDir, setOrdDir] = useState('asc')    // 'asc' | 'desc'
  const [filtroCor, setFiltroCor] = useState('todas') // 'todas' | 'verde' | 'ambar' | 'vermelho'
  const [formEmp, setFormEmp] = useState(null)   // null | { modo:'novo'|'editar', cnpj, empresa, ... }
  const [salvandoEmp, setSalvandoEmp] = useState(false)
  const [desfazer, setDesfazer] = useState(null) // null | { cnpj, nome } — empresa recém-ocultada
  const [autoLib, setAutoLib] = useState(false)  // rodando o auto-liberar 3 RH (≥60%)

  // teto de 3 RH por empresa, só ≥60% (helper compartilhado em lib/formato)
  const faltaLiberar = faltaLiberarRh

  const chaveEmp = (e) => e.cnpj || e.empresa || ''
  const corEmp = (e) => confiancaDominio(e.dominio_score).cor  // 'verde' | 'ambar' | 'vermelho'

  // Ordenação: valor comparável por coluna. Numéricas (contatos/confiança/data)
  // comparam número; as demais texto (localeCompare pt-BR).
  const COLS_NUM = ['contatos', 'confianca', 'enriquecido']
  function valOrdenar(e, col) {
    switch (col) {
      case 'empresa': return nomeProprio(e.empresa) || ''
      case 'cnpj': return String(e.cnpj || '')
      case 'dominio': return String(e.dominio || '').toLowerCase()
      case 'localizacao': return String(e.localizacao || '').toLowerCase()
      case 'porte': return String(e.porte || '').toLowerCase()
      case 'contatos': return Number(e.total_prospects ?? 0)
      case 'confianca': return Number(e.dominio_score ?? -1)
      case 'enriquecido': { // "DD/MM/YYYY" → AAAAMMDD
        const m = String(e.enriquecido_em || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
        return m ? Number(m[3] + m[2] + m[1]) : 0
      }
      default: return ''
    }
  }
  function ordenarPor(col) {
    if (ordCol === col) setOrdDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdCol(col); setOrdDir(COLS_NUM.includes(col) ? 'desc' : 'asc') }
  }
  // cabeçalho clicável: mostra ▲/▼ na coluna ativa, ⇅ nas demais
  const thOrd = (col, label, cls = '') => (
    <th className={'th-ord' + (cls ? ' ' + cls : '') + (ordCol === col ? ' ativo' : '')}
      onClick={() => ordenarPor(col)} title="Ordenar por esta coluna">
      <span className="th-label">{label}<span className="sort-ind">{ordCol === col ? (ordDir === 'asc' ? '▲' : '▼') : '⇅'}</span></span>
    </th>
  )

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

  function abrirNovaEmpresa() {
    setFormEmp({ modo: 'novo', cnpj: '', empresa: '', dominio: '', localizacao: '', porte: '' })
  }
  function editarEmpresa(e) {
    setFormEmp({ modo: 'editar', cnpj: e.cnpj || '', empresa: e.empresa || '', dominio: e.dominio || '', localizacao: e.localizacao || '', porte: e.porte || '' })
  }

  // Salva o cadastro/edição. No cadastro sem domínio, dispara a descoberta grátis
  // (RDAP/Snov) e grava o domínio sugerido — sem gastar crédito de listagem.
  async function salvarForm(d) {
    setSalvandoEmp(true); setMsg('')
    try {
      await salvarEmpresa(d)
      if (d.modo === 'novo' && !String(d.dominio || '').trim()) {
        setMsg(`🔎 Descobrindo domínio de "${d.empresa}"…`)
        try {
          const r = await descobrirEmpresa(d.empresa, d.cnpj)
          const dom = r && (r.dominio_sugerido || (r.ia && r.ia.recomendado))
          if (dom) await salvarEmpresa({ ...d, modo: 'editar', dominio: dom })
        } catch { /* descoberta é best-effort; a empresa já foi salva */ }
      }
      setFormEmp(null)
      setMsg('✓ Empresa salva.')
      await carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    } finally {
      setSalvandoEmp(false)
    }
  }

  // "Excluir" = ocultar (reversível): some da lista na hora e oferece desfazer.
  async function ocultarEmp(e) {
    try {
      await ocultarEmpresa(e.cnpj, true)
      setRows((prev) => prev.filter((x) => chaveEmp(x) !== chaveEmp(e)))
      if (empresaAberta === chaveEmp(e)) setEmpresaAberta(null)
      setDesfazer({ cnpj: e.cnpj, nome: e.empresa })
      setMsg('')
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }
  async function desfazerOcultar() {
    if (!desfazer) return
    try {
      await ocultarEmpresa(desfazer.cnpj, false)
      setDesfazer(null)
      await carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  // 1) só a busca textual (base para as contagens do filtro de cor)
  const porBusca = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((e) =>
      [e.empresa, e.cnpj, e.dominio, e.localizacao].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  // contagem por cor (dentro do que a busca já filtrou) — alimenta os chips
  const contagemCor = useMemo(() => {
    const c = { verde: 0, ambar: 0, vermelho: 0 }
    for (const e of porBusca) c[corEmp(e)]++
    return c
  }, [porBusca])

  // 2) aplica filtro de cor + ordenação por coluna
  const visiveis = useMemo(() => {
    let arr = filtroCor === 'todas' ? porBusca : porBusca.filter((e) => corEmp(e) === filtroCor)
    if (ordCol) {
      const num = COLS_NUM.includes(ordCol)
      const sinal = ordDir === 'asc' ? 1 : -1
      arr = [...arr].sort((a, b) => {
        const va = valOrdenar(a, ordCol), vb = valOrdenar(b, ordCol)
        const r = num ? (va - vb) : String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' })
        return sinal * r
      })
    }
    return arr
  }, [porBusca, filtroCor, ordCol, ordDir])

  // Exporta a tabela (uma linha por contato de RH) em CSV que o Excel abre.
  // BOM UTF-8 pros acentos e ; como separador (padrão do Excel pt-BR).
  function exportarExcel() {
    const cols = ['Empresa', 'CNPJ', 'Localização', 'Porte', 'Capital social', 'Categoria', 'Domínio', 'Nome', 'Cargo', 'E-mail', 'Validade', 'Enriquecido em']
    const esc = (v) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[";\n]/.test(s) ? `"${s}"` : s
    }
    const validadeTxt = (v) => {
      const s = String(v).toLowerCase()
      if (v === true || s === 'valido' || s === 'valid') return 'Válido'
      if (v === false || s === 'invalido' || s === 'invalid') return 'Inválido'
      return '—'
    }
    const linhas = []
    for (const e of visiveis) {
      const base = [nomeProprio(e.empresa), formatarCnpj(e.cnpj), e.localizacao, e.porte, e.capital_social, e.categoria, e.dominio]
      // exporta os dados salvos no banco (todos os contatos); respeita o toggle
      // "Mostrar sem e-mail" (senão, só os que já têm e-mail liberado).
      const todos = e.rh_contatos || []
      const contatos = mostrarSemEmail ? todos : todos.filter((c) => c.email)
      if (contatos.length === 0) {
        linhas.push([...base, '', '', '', '', e.enriquecido_em])
      } else {
        for (const c of contatos) {
          linhas.push([...base, nomeProprio(c.nome), c.cargo, c.email || '', validadeTxt(c.valido), e.enriquecido_em])
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

  // PAGO: auto-libera até 3 RH por empresa nas que têm confiança de domínio ≥60%
  // (pula vermelhos/divergentes) e ainda não chegaram a 3 revelados. Roda em pool
  // paralelo (a rota de reveal não usa ReceitaWS, então dá pra concorrer).
  async function autoLiberarRh() {
    const alvos = rows.map((e) => ({ e, q: faltaLiberar(e) })).filter((x) => x.q > 0 && x.e.cnpj)
    if (!alvos.length) { setMsg('Nada a liberar: nenhuma empresa ≥60% com RH pendente (teto de 3).'); return }
    const credEst = alvos.reduce((s, x) => s + x.q, 0)
    if (!window.confirm(`Auto-liberar RH em ${alvos.length} empresa(s) (domínio ≥60%), até 3 cada.\nAté ~${credEst} crédito(s) Snov (1 por e-mail encontrado). Continuar?`)) return
    setAutoLib(true); setMsg('')
    let feitas = 0, falhas = 0
    const fila = alvos.slice()
    const LIMITE = 4
    async function worker() {
      while (fila.length) {
        const { e, q } = fila.shift()
        setMsg(`Liberando RH ${++feitas}/${alvos.length}: ${e.empresa} (até ${q})…`)
        try { await rhRevelar(e.cnpj, [], 'primeiros_n', q) } catch { falhas++ }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(LIMITE, fila.length) }, worker))
      setMsg(`Auto-liberação concluída: ${alvos.length} empresa(s)` + (falhas ? `, ${falhas} com falha` : '') + '. Clique em Atualizar em instantes.')
      carregar()
    } finally {
      setAutoLib(false)
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

  // PAGO: desbloqueia o e-mail de um contato de RH (1 crédito Snov, se achado).
  // Idempotente no back — reclicar num já revelado não recobra.
  async function desbloquear(e, contato) {
    if (revelando.has(contato.id)) return
    if (!window.confirm(`Desbloquear o e-mail de ${contato.nome || 'este contato'}?\nGasta 1 crédito Snov (se o e-mail for encontrado).`)) return
    setRevelando((prev) => new Set(prev).add(contato.id))
    try {
      await rhRevelar(e.cnpj, [contato.id], 'selecionados')
      await carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    } finally {
      setRevelando((prev) => { const s = new Set(prev); s.delete(contato.id); return s })
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
        <ValidacaoLote onEnriquecido={carregar} irParaEmpresas={() => setAba('empresas')} />
      ) : (
      <>
      <p className="ajuda">Empresas enriquecidas via Snov.io: domínio, site, localização, porte, categoria, logo e e-mails de RH com cargo (RF-09/10/37).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}
      {desfazer && (
        <div className="banner banner-undo">
          Empresa <b>{nomeProprio(desfazer.nome)}</b> ocultada da lista.
          <button className="link-mini" onClick={desfazerOcultar}>desfazer</button>
          <button className="link-mini link-x" onClick={() => setDesfazer(null)}>×</button>
        </div>
      )}

      <div className="toolbar">
        <input placeholder="Buscar empresa, CNPJ, domínio ou local..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
        {CRUD_EMPRESA_ATIVO && <button className="btn-refresh" onClick={abrirNovaEmpresa}>+ Adicionar</button>}
        <button className="btn-primario" disabled={emLote || rows.length === 0} onClick={enriquecerTudo}>
          {emLote ? 'Enriquecendo…' : 'Enriquecer tudo'}
        </button>
        {(() => {
          const nAuto = rows.reduce((s, e) => s + (e.cnpj ? Math.min(1, faltaLiberar(e)) : 0), 0)
          return (
            <button className="btn-primario btn-liberar-lote" disabled={autoLib || nAuto === 0} onClick={autoLiberarRh}
              title="Libera até 3 e-mails de RH por empresa com confiança de domínio ≥60% (gasta crédito Snov)">
              {autoLib ? 'Liberando…' : `🔓 Auto-liberar 3 RH${nAuto ? ` (${nAuto})` : ''}`}
            </button>
          )
        })()}
        <button className="btn-refresh btn-excel" disabled={visiveis.length === 0} onClick={exportarExcel} title="Exportar Excel" aria-label="Exportar Excel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z" fill="#fff" stroke="#1D6F42" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M13 2v7h7" stroke="#1D6F42" strokeWidth="1.5" strokeLinejoin="round"/>
            <rect x="7" y="12" width="10" height="7" rx="1" fill="#1D6F42"/>
            <path d="M9.4 13.7l3.2 3.6M12.6 13.7l-3.2 3.6" stroke="#fff" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="filtro-cor">
        <span className="fc-label">Confiança do domínio:</span>
        {[
          { k: 'todas', txt: 'Todas', n: porBusca.length },
          { k: 'verde', txt: 'Confere', n: contagemCor.verde },
          { k: 'ambar', txt: 'Nome coerente', n: contagemCor.ambar },
          { k: 'vermelho', txt: 'Revisar', n: contagemCor.vermelho },
        ].map(({ k, txt, n }) => (
          <button key={k}
            className={'fc-chip' + (filtroCor === k ? ' ativo' : '') + (k !== 'todas' ? ' conf-' + k : '')}
            onClick={() => setFiltroCor((cur) => (cur === k ? 'todas' : k))}>
            {k !== 'todas' && <i className="conf-dot" />}{txt} <b>{n}</b>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="secao"><div className="empty">Nenhuma empresa enriquecida ainda.</div></div>
      ) : view === 'cards' ? (
        <>
          <table className="preview">
            <thead>
              <tr>
                {thOrd('empresa', 'Empresa')}
                {thOrd('cnpj', 'CNPJ')}
                {thOrd('dominio', 'Domínio')}
                {thOrd('confianca', 'Confiança', 'col-cen')}
                {thOrd('localizacao', 'Localização')}
                {thOrd('porte', 'Porte')}
                {thOrd('contatos', 'Contatos', 'col-cen')}
                {thOrd('enriquecido', 'Enriquecido em')}
                {CRUD_EMPRESA_ATIVO && <th className="col-cen">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((e, i) => (
                <tr key={e.cnpj || e.empresa || i} className="linha-clicavel" onClick={() => setEmpresaAberta(chaveEmp(e))} title="Ver empresa">
                  <td><span className="empresa-cel"><CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={24} />{nomeProprio(e.empresa) || '—'}</span></td>
                  <td>{formatarCnpj(e.cnpj) || '—'}</td>
                  <td>{e.dominio || '—'}{e.dominio_count != null && <small className="dom-count"> · {e.dominio_count}</small>}<SeloRobo e={e} /></td>
                  <td className="col-cen"><ChipConfianca e={e} /></td>
                  <td>{e.localizacao || '—'}</td>
                  <td>{e.porte || '—'}</td>
                  <td className="col-cen">{e.total_prospects ?? 0}{(e.total_rh ?? 0) > 0 && <span className="tag-rh"> · {e.total_rh} RH</span>}</td>
                  <td>{e.enriquecido_em || '—'}</td>
                  {CRUD_EMPRESA_ATIVO && (
                    <td className="col-cen col-acoes" onClick={(ev) => ev.stopPropagation()}>
                      <button className="btn-acao" title="Editar dados da empresa" onClick={() => editarEmpresa(e)}>✏️</button>
                      <button className="btn-acao btn-acao-del" title="Ocultar empresa da lista (reversível)" onClick={() => ocultarEmp(e)}>🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
              {visiveis.length === 0 && <tr><td colSpan={CRUD_EMPRESA_ATIVO ? 9 : 8} className="empty">Nenhuma empresa.</td></tr>}
            </tbody>
          </table>
          <small className="ajuda">Clique numa empresa pra abrir o painel com domínio, contatos e ações (desbloquear e-mail, trocar domínio, reenriquecer).</small>
        </>
      ) : (
        <div className="preview-wrap tabela-full">
          <table className="grade">
            <thead>
              <tr>
                {thOrd('empresa', 'Empresa', 'col-emp')}
                {thOrd('cnpj', 'CNPJ')}
                {thOrd('localizacao', 'Localização')}
                {thOrd('porte', 'Porte')}
                {thOrd('dominio', 'Domínio')}
                <th>Nome</th>
                <th>Cargo</th>
                <th>E-mail</th>
                <th className="col-cen">Validade</th>
                <th>Enriquecido em</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.flatMap((e, i) => {
                // dados salvos no banco (rh_contatos): todos os contatos, com ou sem
                // e-mail liberado. Sem o toggle, mostra só os que já têm e-mail.
                const todos = e.rh_contatos || []
                const contatos = mostrarSemEmail ? todos : todos.filter((c) => c.email)
                const cnpj = e.cnpj || e.empresa || ''   // chave estável p/ React key
                const cabec = () => (
                  <>
                    <td className="col-emp"><span className="empresa-cel"><CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={22} />{nomeProprio(e.empresa) || '—'}</span></td>
                    <td>{formatarCnpj(e.cnpj) || '—'}</td>
                    <td>{e.localizacao || '—'}</td>
                    <td>{e.porte || '—'}</td>
                    <td>{e.dominio || '—'}<ChipConfianca e={e} /><SeloRobo e={e} /></td>
                  </>
                )
                if (contatos.length === 0) {
                  const semTexto = todos.length > 0
                    ? 'contatos sem e-mail liberado — clique em “Mostrar sem e-mail”'
                    : 'nenhum contato salvo ainda'
                  return [(
                    <tr key={cnpj + '-vazia'} className="grupo-inicio">
                      {cabec()}
                      <td colSpan={3} className="cel-vazia">{semTexto}</td>
                      <td className="col-cen">—</td>
                      <td>{e.enriquecido_em || '—'}</td>
                    </tr>
                  )]
                }
                return contatos.map((c, j) => (
                  <tr key={cnpj + '-' + (c.id ?? j)} className={j === 0 ? 'grupo-inicio' : 'grupo-cont'}>
                    {j === 0
                      ? cabec()
                      : <><td className="col-emp"></td><td></td><td></td><td></td><td></td></>}
                    <td>{nomeProprio(c.nome) || '—'}{c.eh_rh && <span className="tag-rh-mini">RH</span>}</td>
                    <td>{c.cargo || '—'}</td>
                    <td className="cel-email">
                      {c.email
                        ? c.email
                        : <button className="btn-olho" title="Desbloquear e-mail (1 crédito Snov)" disabled={revelando.has(c.id)} onClick={() => desbloquear(e, c)}>
                            {revelando.has(c.id) ? '…' : (
                              <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                                </svg>
                                desbloquear
                              </>
                            )}
                          </button>}
                    </td>
                    <td className="col-cen">{c.email ? <PillEmail valido={c.valido} /> : <span className="ajuda">—</span>}</td>
                    <td>{j === 0 ? (e.enriquecido_em || '—') : ''}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
          <small className="ajuda">Uma linha por contato salvo no banco. Clique em <b>“Mostrar sem e-mail”</b> pra ver quem ainda não foi desbloqueado e liberar direto aqui (👁).</small>
        </div>
      )}

      {empresaAberta && (
        <PainelEmpresa
          empresa={visiveis.find((x) => chaveEmp(x) === empresaAberta) || rows.find((x) => chaveEmp(x) === empresaAberta)}
          aoFechar={() => setEmpresaAberta(null)}
          aoAtualizar={carregar}
        />
      )}
      {formEmp && (
        <FormEmpresa inicial={formEmp} salvando={salvandoEmp} onSalvar={salvarForm} onFechar={() => { if (!salvandoEmp) setFormEmp(null) }} />
      )}
      </>
      )}
    </div>
  )
}
