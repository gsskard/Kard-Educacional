import { useEffect, useMemo, useState } from 'react'
import DispararEmpregadores from './DispararEmpregadores'
import './Disparos.css'

// Tela "Disparos" (substitui as antigas telas espelho Educacional/Cobrança).
// Dois modos:
//   • Disparar   — envio em LOTE dos 2 modelos educativos de e-mail para
//                  empregadores (CSV → modelo → canal Outlook/CyberTalk).
//   • Acompanhar — protótipo VISUAL (dados de exemplo) do percurso por empresa
//                  ao longo dos ciclos mensais. Será ligado ao n8n depois.

/* ============================ helpers ============================ */
const iniciais = (n) => String(n || '').split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase()
const fmt = (d) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const soData = (d) => fmt(d).split(',')[0]
const dias = (d) => Math.floor((Date.now() - d.getTime()) / 864e5)
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const cicloDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
const cicloNome = (c) => { const [a, m] = c.split('-'); return MESES[+m - 1] + '/' + a.slice(2) }
const cicloAtual = () => cicloDe(new Date())

/* ============================ tela ============================ */
export default function Disparos() {
  const [modo, setModo] = useState('disparar')
  const [contagemCiclo, setContagemCiclo] = useState(0)

  return (
    <div className="disparos">
      <h1 className="pagina">Disparos</h1>

      <div className="modos">
        <button data-modo="disparar" aria-pressed={modo === 'disparar'} onClick={() => setModo('disparar')}>Disparar</button>
        <button data-modo="acompanhar" aria-pressed={modo === 'acompanhar'} onClick={() => setModo('acompanhar')}>
          Acompanhar <span className="cnt">{contagemCiclo}</span>
        </button>
      </div>

      <div className={modo === 'disparar' ? '' : 'oculto'}><DispararEmpregadores /></div>
      <div className={modo === 'acompanhar' ? '' : 'oculto'}>
        <AcompanharView ativo={modo === 'acompanhar'} onContagem={setContagemCiclo} />
      </div>
    </div>
  )
}

/* ==================================================================
 * MODO ACOMPANHAR — protótipo visual (dados de exemplo)
 * ================================================================== */
const PERCURSO = [
  { modelo: 'Lembrete amigável', etapa: 'educacional', curto: '1º lembrete' },
  { modelo: 'Segundo lembrete', etapa: 'educacional', curto: '2º lembrete' },
  { modelo: 'Cobrança padrão', etapa: 'cobranca', curto: 'Cobrança' },
  { modelo: 'Notificação final', etapa: 'cobranca', curto: 'Notificação final' },
]

// histórico fictício (mesmo do mockup) — construído uma vez.
function construirEnviosDemo() {
  const envios = []
  const at = (d) => new Date(Date.now() - d * 864e5)
  const r = (d, emp, cnpj, mail, mod, st, lst, etq) => envios.push({
    ts: at(d), empresa: emp, cnpj, email: mail, modelo: mod, status: st, lista: lst, etiqueta: etq,
    etapa: PERCURSO.find((p) => p.modelo === mod).etapa,
  })
  r(18, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Lembrete amigável', 'enviado', 'Base julho', 'julho')
  r(11, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Segundo lembrete', 'enviado', 'Base julho', 'julho')
  r(10, 'Transportes Beta', '98.765.432/0001-11', 'contas@transportesbeta.com.br', 'Lembrete amigável', 'enviado', 'Base agosto', 'agosto')
  r(21, 'Lumina Tech', '45.222.109/0001-32', 'adm@luminatech.com.br', 'Lembrete amigável', 'enviado', 'Base julho', 'julho')
  r(14, 'Lumina Tech', '45.222.109/0001-32', 'adm@luminatech.com.br', 'Segundo lembrete', 'enviado', 'Base julho', 'julho')
  r(3, 'Lumina Tech', '45.222.109/0001-32', 'paulo@luminatech.com.br', 'Cobrança padrão', 'enviado', 'Inadimplentes agosto', 'agosto')
  r(9, 'Grupo Aster', '33.019.884/0001-05', 'contato@grupoaster.com.br', 'Lembrete amigável', 'erro', 'Base agosto', 'agosto')
  r(16, 'Vértice', '77.410.556/0001-28', 'pagamentos@vertice.com.br', 'Lembrete amigável', 'enviado', 'Base julho', 'julho')
  r(8, 'Vértice', '77.410.556/0001-28', 'pagamentos@vertice.com.br', 'Segundo lembrete', 'enviado', 'Base agosto', 'agosto')
  r(30, 'Campelo Indústria', '21.556.700/0001-49', 'diretoria@campelo.ind.br', 'Lembrete amigável', 'enviado', 'Base julho', 'julho')
  r(23, 'Campelo Indústria', '21.556.700/0001-49', 'diretoria@campelo.ind.br', 'Segundo lembrete', 'enviado', 'Base julho', 'julho')
  r(12, 'Campelo Indústria', '21.556.700/0001-49', 'ricardo@campelo.ind.br', 'Cobrança padrão', 'enviado', 'Inadimplentes agosto', 'agosto')
  r(2, 'Campelo Indústria', '21.556.700/0001-49', 'ricardo@campelo.ind.br', 'Notificação final', 'enviado', 'Inadimplentes agosto', 'agosto')
  r(1, 'Nova Fonte Alimentos', '64.882.301/0001-14', 'contas@novafonte.com.br', 'Lembrete amigável', 'enviado', 'Base agosto', 'agosto')
  r(19, 'Norte Soluções', '88.222.415/0001-63', 'rh@nortesolucoes.com.br', 'Lembrete amigável', 'enviado', 'Base julho', 'julho')
  r(13, 'Norte Soluções', '88.222.415/0001-63', 'rh@nortesolucoes.com.br', 'Segundo lembrete', 'enviado', 'Base julho', 'julho')
  r(26, 'Pilar Logística', '29.774.605/0001-88', 'fiscal@pilarlog.com.br', 'Lembrete amigável', 'enviado', 'Base julho', 'julho')
  r(20, 'Pilar Logística', '29.774.605/0001-88', 'fiscal@pilarlog.com.br', 'Segundo lembrete', 'enviado', 'Base julho', 'julho')
  r(6, 'Pilar Logística', '29.774.605/0001-88', 'socio@pilarlog.com.br', 'Cobrança padrão', 'enviado', 'Inadimplentes agosto', 'agosto')
  r(5, 'Ferragem Uatuma', '11.173.362/0001-09', 'compras@ferragemuatuma.com.br', 'Lembrete amigável', 'erro', 'Base agosto', 'agosto')
  // ciclos anteriores — reincidência
  r(78, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Lembrete amigável', 'enviado', 'Base maio', 'maio')
  r(71, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Segundo lembrete', 'enviado', 'Base maio', 'maio')
  r(64, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Cobrança padrão', 'enviado', 'Inadimplentes maio', 'maio')
  r(48, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Lembrete amigável', 'enviado', 'Base junho', 'junho')
  r(41, 'Metalvale', '12.345.678/0001-90', 'financeiro@metalvale.com.br', 'Segundo lembrete', 'enviado', 'Base junho', 'junho')
  r(74, 'Campelo Indústria', '21.556.700/0001-49', 'diretoria@campelo.ind.br', 'Lembrete amigável', 'enviado', 'Base maio', 'maio')
  r(67, 'Campelo Indústria', '21.556.700/0001-49', 'diretoria@campelo.ind.br', 'Segundo lembrete', 'enviado', 'Base maio', 'maio')
  r(45, 'Campelo Indústria', '21.556.700/0001-49', 'ricardo@campelo.ind.br', 'Cobrança padrão', 'enviado', 'Inadimplentes junho', 'junho')
  r(52, 'Pilar Logística', '29.774.605/0001-88', 'fiscal@pilarlog.com.br', 'Lembrete amigável', 'enviado', 'Base junho', 'junho')
  r(44, 'Vértice', '77.410.556/0001-28', 'pagamentos@vertice.com.br', 'Lembrete amigável', 'enviado', 'Base junho', 'junho')
  r(60, 'Aliança Têxtil', '07.998.221/0001-60', 'financeiro@aliancatextil.com.br', 'Lembrete amigável', 'enviado', 'Base maio', 'maio')
  r(53, 'Aliança Têxtil', '07.998.221/0001-60', 'financeiro@aliancatextil.com.br', 'Segundo lembrete', 'enviado', 'Base maio', 'maio')
  return envios
}

// agrupa envios por CNPJ dentro de um ciclo e calcula o percurso.
function agrupar(envios, alvoCiclo) {
  const c = alvoCiclo
  const m = new Map()
  envios.filter((e) => !c || cicloDe(e.ts) === c).forEach((e) => {
    const k = e.cnpj.replace(/\D/g, '')
    if (!m.has(k)) m.set(k, { chave: k, cnpj: e.cnpj, empresa: e.empresa || '—', emails: new Set(), hist: [] })
    const g = m.get(k); g.emails.add(e.email); g.hist.push(e)
  })
  const fim = c ? new Date(+c.split('-')[0], +c.split('-')[1], 0, 23, 59) : null
  const encerrado = c && c !== cicloAtual()
  return [...m.values()].map((g) => {
    g.hist.sort((a, b) => a.ts - b.ts)
    const feitos = new Set(g.hist.filter((h) => h.status === 'enviado').map((h) => h.modelo))
    let i = -1; PERCURSO.forEach((p, k) => { if (feitos.has(p.modelo)) i = k })
    g.idx = i; g.ultimo = g.hist[g.hist.length - 1]
    g.parado = encerrado ? Math.floor((fim - g.ultimo.ts) / 864e5) : dias(g.ultimo.ts)
    g.encerrado = encerrado
    g.temErro = g.hist.some((h) => h.status === 'erro')
    g.concluido = i === PERCURSO.length - 1
    g.fase = g.concluido ? 'final' : (g.temErro && i < 0) ? 'erro' : i >= 2 ? 'cobranca' : 'educacional'
    g.proximo = g.concluido ? null : PERCURSO[i + 1]
    const meus = [...new Set(envios.filter((e) => e.cnpj.replace(/\D/g, '') === g.chave).map((e) => cicloDe(e.ts)))].sort()
    g.ciclos = c ? meus.filter((x) => x <= c) : meus
    g.reincidencia = g.ciclos.length
    return g
  })
}

function historicoCiclos(envios, chave, ate) {
  const meus = envios.filter((e) => e.cnpj.replace(/\D/g, '') === chave)
  const porCiclo = new Map()
  meus.forEach((e) => {
    const c = cicloDe(e.ts); if (ate && c > ate) return
    if (!porCiclo.has(c)) porCiclo.set(c, [])
    porCiclo.get(c).push(e)
  })
  return [...porCiclo.entries()].sort((a, b) => (b[0] < a[0] ? -1 : 1)).map(([c, hist]) => {
    hist.sort((a, b) => a.ts - b.ts)
    const feitos = new Set(hist.filter((h) => h.status === 'enviado').map((h) => h.modelo))
    let i = -1; PERCURSO.forEach((p, k) => { if (feitos.has(p.modelo)) i = k })
    return { ciclo: c, hist, idx: i }
  })
}

function Faixa({ idx, small }) {
  return (
    <div className="percurso" style={small ? { minWidth: 96 } : undefined}>
      {PERCURSO.map((p, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className={'l ' + (i <= idx ? 'on' : '')} />}
          <span className={'p ' + (i <= idx ? (p.etapa === 'educacional' ? 'edu' : 'cob') : '') + (!small && i === idx ? ' agora' : '')} title={p.curto} />
        </span>
      ))}
    </div>
  )
}

function Situacao({ g }) {
  if (g.concluido) return <span className="st ok">Percurso concluído</span>
  if (g.temErro && g.idx < 0) return <span className="st err">Falha — corrigir contato</span>
  return (
    <>
      <span className={'et ' + (g.proximo.etapa === 'educacional' ? 'edu' : 'cob')}>próximo: {g.proximo.curto}</span>
      {g.temErro && <> <span className="st err">1 falha</span></>}
    </>
  )
}

const papelContato = (e) => (/rh@|recursos/.test(e) ? 'RH' : /socio|paulo|ricardo|diretor/.test(e) ? 'SÓCIO' : 'FINANCEIRO')

function AcompanharView({ ativo, onContagem }) {
  const [envios] = useState(construirEnviosDemo)
  const [ciclo, setCiclo] = useState(null) // null = ainda não inicializado; '' = todos
  const [fase, setFase] = useState('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('parado')
  const [selecao, setSelecao] = useState(() => new Set())
  const [aberto, setAberto] = useState(null) // chave da empresa na gaveta
  const [aviso, setAviso] = useState('')

  const ciclosExistentes = useMemo(
    () => [...new Set(envios.map((e) => cicloDe(e.ts)))].sort().reverse(),
    [envios],
  )

  // inicializa o ciclo no mais recente
  useEffect(() => {
    if (ciclo === null) setCiclo(ciclosExistentes[0] || cicloAtual())
  }, [ciclo, ciclosExistentes])

  // conta empresas do ciclo atual para o badge do modo "Acompanhar"
  useEffect(() => {
    onContagem(agrupar(envios, cicloAtual()).length)
  }, [envios, onContagem])

  // ESC fecha a gaveta
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && setAberto(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (ciclo === null) return null
  const cicloAtivo = ciclo === '' ? undefined : ciclo
  const encerrado = ciclo && ciclo !== cicloAtual()
  const todas = agrupar(envios, cicloAtivo)

  const defs = [
    ['', 'Todas', '#8B96A5', todas.length],
    ['educacional', 'Só educacional', '#22C55E', todas.filter((g) => g.fase === 'educacional').length],
    ['cobranca', 'Já em cobrança', '#F59E0B', todas.filter((g) => g.fase === 'cobranca').length],
    ['final', 'Concluído', '#6B7280', todas.filter((g) => g.concluido).length],
    ['reincidente', 'Reincidentes', '#7C3AED', todas.filter((g) => g.reincidencia > 1).length],
    ['erro', 'Com falha', '#DC2626', todas.filter((g) => g.temErro).length],
    ['parado', 'Parados +14d', '#0EA5E9', todas.filter((g) => g.parado > 14 && !g.concluido).length],
  ]

  const q = busca.toLowerCase().trim()
  const vis = todas
    .filter((g) => (!q || g.cnpj.includes(q) || g.empresa.toLowerCase().includes(q) || [...g.emails].some((e) => e.includes(q)))
      && (!fase || (fase === 'erro' ? g.temErro : fase === 'parado' ? (g.parado > 14 && !g.concluido) : fase === 'reincidente' ? g.reincidencia > 1 : g.fase === fase)))
    .sort((a, b) => (ordem === 'parado' ? b.parado - a.parado : b.ultimo.ts - a.ultimo.ts))

  function trocaCiclo(c) { setCiclo(c); setSelecao(new Set()) }
  function toggleSel(chave) {
    setSelecao((s) => { const n = new Set(s); n.has(chave) ? n.delete(chave) : n.add(chave); return n })
  }
  function marcarTodos(marcar) {
    setSelecao((s) => {
      const n = new Set(s)
      vis.forEach((g) => (marcar ? n.add(g.chave) : n.delete(g.chave)))
      return n
    })
  }
  function criarListaSelecao() {
    const alvo = todas.filter((g) => selecao.has(g.chave))
    const totalContatos = alvo.reduce((s, g) => s + g.emails.size, 0)
    setAviso(`(protótipo) ${alvo.length} empresa(s) / ${totalContatos} contato(s) selecionados. Ligue o Acompanhar ao n8n para gerar listas reais na aba Disparar.`)
    setSelecao(new Set())
    setAberto(null)
  }

  const gAberto = aberto ? todas.find((g) => g.chave === aberto) : null

  return (
    <div className="bloco">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="abas">
          {ciclosExistentes.map((c) => (
            <button key={c} aria-pressed={ciclo === c} data-etapa="educacional" onClick={() => trocaCiclo(c)}>
              {cicloNome(c)}{c === cicloAtual() ? ' · atual' : ''}
            </button>
          ))}
          <button aria-pressed={ciclo === ''} data-etapa="educacional" onClick={() => trocaCiclo('')}>Todos</button>
        </div>
        <span style={{ fontSize: 13, color: 'var(--fraco)' }}>
          {ciclo === '' ? 'Visão consolidada — o percurso soma todos os ciclos.'
            : encerrado ? 'Ciclo encerrado — somente leitura.' : 'Ciclo em andamento.'}
        </span>
      </div>
      <p className="explica" style={{ marginBottom: 16 }}>
        O percurso reinicia a cada ciclo mensal. Empresas que voltam em ciclos seguidos aparecem marcadas como reincidentes.
      </p>

      <div className="faixa"><div className="grupo-filtro">
        {defs.map(([v, l, c, n]) => (
          <button key={v || 'todas'} className={'fp' + (n === 0 ? ' zero' : '')} aria-pressed={fase === v} onClick={() => setFase(v)}>
            <span className="pt" style={{ background: c }} />{l}<span className="n">{n}</span>
          </button>
        ))}
      </div></div>

      {aviso && <div className="banner" style={{ marginBottom: 12 }}>{aviso}</div>}

      <div className="busca">
        <input type="text" value={busca} placeholder="Buscar empresa, CNPJ ou e-mail" onChange={(e) => setBusca(e.target.value)} />
        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ maxWidth: 230 }}>
          <option value="parado">Parados há mais tempo</option>
          <option value="recente">Último envio mais recente</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--fraco)' }}>{vis.length} de {todas.length} empresas</span>
      </div>

      <table>
        <thead><tr>
          <th style={{ width: 36 }}>
            <input type="checkbox" disabled={encerrado}
              checked={vis.length > 0 && vis.every((g) => selecao.has(g.chave))}
              onChange={(e) => marcarTodos(e.target.checked)} />
          </th>
          <th style={{ width: '27%' }}>Empresa</th><th style={{ width: '22%' }}>Percurso</th>
          <th style={{ width: '16%' }}>Último envio</th><th style={{ width: '11%' }}>Parado há</th><th>Situação</th>
        </tr></thead>
        <tbody>
          {vis.length ? vis.map((g) => (
            <tr key={g.chave} className={'clicavel' + (selecao.has(g.chave) ? ' sel' : '')} onClick={() => setAberto(g.chave)}>
              <td onClick={(e) => e.stopPropagation()}>
                {!encerrado && <input type="checkbox" checked={selecao.has(g.chave)} onChange={() => toggleSel(g.chave)} />}
              </td>
              <td>
                <span className="avatar">{iniciais(g.empresa)}</span>
                <span style={{ fontWeight: 600, color: 'var(--tinta)' }}>{g.empresa}</span>
                {g.reincidencia > 1 && <span className="et" style={{ background: '#F1E9FD', color: '#6D28D9', marginLeft: 6 }}>{g.reincidencia}º ciclo</span>}
                <div className="mono" style={{ color: 'var(--fraco)', marginLeft: 35 }}>{g.cnpj}</div>
              </td>
              <td><Faixa idx={g.idx} /><div className="sub">Parou em <b>{g.idx >= 0 ? PERCURSO[g.idx].curto : 'nenhum envio'}</b></div></td>
              <td className="mono">{soData(g.ultimo.ts)}<div style={{ color: 'var(--fraco)', fontSize: 12 }}>{g.ultimo.modelo}</div></td>
              <td className={'mono ' + (g.parado > 14 && !g.concluido && !encerrado ? 'parado' : '')}>{g.parado} d</td>
              <td><Situacao g={g} /></td>
            </tr>
          )) : <tr><td colSpan={6} className="vazio">Nenhuma empresa com esses filtros.</td></tr>}
        </tbody>
      </table>

      {selecao.size > 0 && !encerrado && (
        <div className="barra-sel">
          <b>{selecao.size}</b> empresa(s) selecionada(s)
          <button className="bt claro" style={{ marginLeft: 'auto' }} onClick={() => setSelecao(new Set())}>Limpar</button>
          <button className="bt" onClick={criarListaSelecao}>Criar lista com estas</button>
        </div>
      )}

      <Gaveta g={gAberto} ciclo={ciclo} envios={envios} onFechar={() => setAberto(null)}
        onSelecionar={(k) => { setSelecao((s) => new Set(s).add(k)); setAberto(null) }} />
    </div>
  )
}

function Gaveta({ g, ciclo, envios, onFechar, onSelecionar }) {
  const anteriores = g ? historicoCiclos(envios, g.chave, ciclo || undefined).filter((c) => c.ciclo !== ciclo) : []
  return (
    <>
      <div className={'veu' + (g ? ' on' : '')} onClick={onFechar} />
      <aside className={'gaveta' + (g ? ' on' : '')} aria-hidden={!g}>
        {g && (
          <>
            <div className="g-topo">
              <div className="marca">{iniciais(g.empresa)}</div>
              <div style={{ minWidth: 0 }}><h3>{g.empresa}</h3><div className="cn">{g.cnpj}</div></div>
              <button className="fechar" aria-label="Fechar" onClick={onFechar}>✕</button>
            </div>
            <div className="g-corpo">
              <div className="g-linha"><span className="rot">Ciclo</span><span className="val">{ciclo ? cicloNome(ciclo) : 'todos'}{g.encerrado ? ' · encerrado' : ''}</span></div>
              <div className="g-linha"><span className="rot">Reincidência</span><span className="val">{g.reincidencia > 1 ? `${g.reincidencia}º ciclo` : 'primeiro ciclo'}</span></div>
              <div className="g-linha"><span className="rot">Fase</span><span className="val">{g.concluido ? 'Percurso concluído' : g.fase === 'cobranca' ? 'Em cobrança' : 'Educacional'}</span></div>
              <div className="g-linha"><span className="rot">Parou em</span><span className="val">{g.idx >= 0 ? PERCURSO[g.idx].curto : '—'}</span></div>
              <div className="g-linha"><span className="rot">Próximo passo</span><span className="val">{g.proximo ? g.proximo.curto : '—'}</span></div>
              <div className="g-linha"><span className="rot">Sem contato há</span><span className="val">{g.parado} dias</span></div>

              <div className="g-sec">Percurso deste ciclo</div><Faixa idx={g.idx} />

              <div className="g-sec">Contatos ({g.emails.size})</div>
              {[...g.emails].map((e) => (
                <div className="cartao-contato" key={e}><span className="papel">{papelContato(e)}</span><span className="em">{e}</span></div>
              ))}

              <div className="g-sec">Envios deste ciclo</div>
              {g.hist.slice().reverse().map((h, i) => (
                <div className="passo" key={i}>
                  <span className="mono" style={{ minWidth: 104, color: 'var(--fraco)' }}>{soData(h.ts)}</span>
                  <span style={{ minWidth: 120 }}>{h.modelo}</span>
                  <span className="mono" style={{ flex: 1, color: 'var(--fraco)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.email}</span>
                  <span className={'st ' + (h.status === 'enviado' ? 'ok' : 'err')}>{h.status}</span>
                </div>
              ))}

              {anteriores.length ? (
                <>
                  <div className="g-sec">Ciclos anteriores ({anteriores.length})</div>
                  {anteriores.map((c) => (
                    <details className="ciclo-ant" key={c.ciclo}>
                      <summary>
                        <b style={{ color: 'var(--tinta)', minWidth: 62 }}>{cicloNome(c.ciclo)}</b>
                        <span style={{ flex: 1 }}><Faixa idx={c.idx} small /></span>
                        <span style={{ fontSize: 12.5, color: 'var(--fraco)' }}>{c.hist.length} envio(s)</span>
                      </summary>
                      <div className="corpo-ciclo">
                        {c.hist.slice().reverse().map((h, i) => (
                          <div className="passo" key={i}>
                            <span className="mono" style={{ minWidth: 96, color: 'var(--fraco)' }}>{soData(h.ts)}</span>
                            <span style={{ flex: 1 }}>{h.modelo}</span>
                            <span className={'st ' + (h.status === 'enviado' ? 'ok' : 'err')}>{h.status}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </>
              ) : (
                <>
                  <div className="g-sec">Ciclos anteriores</div>
                  <p style={{ fontSize: 13, color: 'var(--fraco)', margin: 0 }}>Nenhum registro em ciclos anteriores.</p>
                </>
              )}

              {!g.encerrado && (
                <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                  <button className="bt mini" onClick={() => onSelecionar(g.chave)}>Adicionar à seleção</button>
                  <button className="bt claro mini">Marcar como resolvido</button>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}
