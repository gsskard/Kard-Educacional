import { useEffect, useMemo, useRef, useState } from 'react'
import { listarEmpresas, enriquecerEmpresa, descobrirEmpresa, salvarEmpresa, ocultarEmpresa, sugerirDominios, rhRevelar } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'
import ValidacaoIALote from '../componentes/ValidacaoIALote'
import PainelEmpresa from '../componentes/PainelEmpresa'
import { nomeProprio, formatarCnpj, confiancaDominio, faltaLiberarRh } from '../lib/formato'

// Cargos-alvo do filtro de RH: os mesmos termos que o back usa pra marcar `eh_rh`.
// Mostramos como hashtags no card pra deixar claro que contatos buscamos.
const CARGOS_ALVO = ['rh', 'recursos humanos', 'talent', 'recrutamento', 'people']

// Adicionar/editar/ocultar empresa usam as rotas empresa-salvar/empresa-ocultar do n8n.
const CRUD_EMPRESA_ATIVO = true

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

// Tela de Empresas (RF-09/10/33/37): empresas enriquecidas via Hunter —
// logo, CNPJ, domínio/site, localização, nº de funcionários, categoria e os
// e-mails de RH com cargo/validade. Duas visões: Cartões e Tabela (tipo Excel).
// Aba extra: Validar domínios em lote (IA).

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
        <button className={aba === 'ia' ? 'ativo' : ''} onClick={() => setAba('ia')}>⚡ Validar domínios em lote (IA)</button>
      </div>

      {aba === 'ia' ? (
        <ValidacaoIALote />
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
          <div className="preview-wrap">
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
          </div>
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
