import { useEffect, useMemo, useState } from 'react'
import DispararEmpregadores from './DispararEmpregadores'
import { lerEnviosEmpregador } from '../api/n8n'
import './Disparos.css'

// Tela "Disparos" (substitui as antigas telas espelho Educacional/Cobrança).
// Dois modos:
//   • Disparar   — envio em LOTE dos 2 modelos educativos de e-mail para
//                  empregadores (CSV → modelo → canal Outlook/CyberTalk).
//   • Acompanhar — histórico REAL dos disparos (Data Table empregador_envios via
//                  /empregadores-envios), agrupado por empresa, por ciclo mensal.

/* ============================ helpers ============================ */
const iniciais = (n) => String(n || '').split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase()
const fmt = (d) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const soData = (d) => fmt(d).split(',')[0]
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const cicloDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
const cicloNome = (c) => { const [a, m] = String(c).split('-'); return (MESES[+m - 1] || m) + '/' + String(a).slice(2) }
const cicloAtual = () => cicloDe(new Date())

const MODELO_LABEL = { repasse: 'Repasse (dia 20)', escrituracao: 'Prazo de escrituração' }
const rotuloModelo = (m) => MODELO_LABEL[m] || m || '—'
const classeModelo = (m) => (m === 'escrituracao' ? 'cob' : 'edu')
const sucesso = (s) => s === 'enviado' || s === 'aceito_pela_api'
const rotuloStatus = (s) => (s === 'enviado' ? 'enviado' : s === 'aceito_pela_api' ? 'aceito' : (s || 'falha'))
const dataDe = (e) => new Date(e.data || e.createdAt || 0)

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
        <AcompanharView onContagem={setContagemCiclo} />
      </div>
    </div>
  )
}

/* ==================================================================
 * MODO ACOMPANHAR — histórico real por empresa, por ciclo mensal
 * ================================================================== */
function agruparPorEmpresa(envios) {
  const m = new Map()
  envios.forEach((e) => {
    const chave = (e.nome && e.nome.trim()) || e.destino || '—'
    if (!m.has(chave)) m.set(chave, { chave, nome: (e.nome && e.nome.trim()) || '(sem nome)', envios: [], modelos: new Set(), canais: new Set(), destinos: new Set() })
    const g = m.get(chave)
    g.envios.push(e)
    if (e.modelo) g.modelos.add(e.modelo)
    if (e.canal) g.canais.add(e.canal)
    if (e.destino) g.destinos.add(e.destino)
  })
  return [...m.values()].map((g) => {
    g.envios.sort((a, b) => dataDe(a) - dataDe(b))
    g.ultimo = g.envios[g.envios.length - 1]
    g.total = g.envios.length
    g.temFalha = g.envios.some((e) => !sucesso(e.status))
    g.todosOk = g.envios.every((e) => sucesso(e.status))
    return g
  })
}

function ChipsModelos({ modelos }) {
  return [...modelos].map((m) => (
    <span key={m} className={'et ' + classeModelo(m)} style={{ marginRight: 4 }}>{rotuloModelo(m)}</span>
  ))
}

function AcompanharView({ onContagem }) {
  const [envios, setEnvios] = useState(null) // null = carregando
  const [erro, setErro] = useState('')
  const [ciclo, setCiclo] = useState(null) // null = não inicializado; '' = todos
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('') // '' | 'repasse' | 'escrituracao' | 'falha'
  const [aberto, setAberto] = useState(null)

  async function carregar() {
    setErro('')
    try { setEnvios(await lerEnviosEmpregador()) }
    catch (e) { setErro('Não consegui ler os envios do n8n (' + e.message + ')'); setEnvios([]) }
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && setAberto(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const lista = envios || []
  const ciclosExistentes = useMemo(() => [...new Set(lista.map((e) => e.ciclo).filter(Boolean))].sort().reverse(), [lista])
  useEffect(() => { if (ciclo === null && ciclosExistentes.length) setCiclo(ciclosExistentes[0]) }, [ciclo, ciclosExistentes])
  useEffect(() => { onContagem(agruparPorEmpresa(lista.filter((e) => e.ciclo === cicloAtual())).length) }, [lista, onContagem])

  if (envios === null) return <div className="bloco"><p className="explica">Carregando envios…</p></div>

  const cicloAtivo = ciclo === '' ? null : ciclo
  const doCiclo = cicloAtivo ? lista.filter((e) => e.ciclo === cicloAtivo) : lista
  const grupos = agruparPorEmpresa(doCiclo)

  const defs = [
    ['', 'Todas', '#8B96A5', grupos.length],
    ['repasse', 'Repasse', '#22C55E', grupos.filter((g) => g.modelos.has('repasse')).length],
    ['escrituracao', 'Escrituração', '#F59E0B', grupos.filter((g) => g.modelos.has('escrituracao')).length],
    ['falha', 'Com falha', '#DC2626', grupos.filter((g) => g.temFalha).length],
  ]

  const q = busca.toLowerCase().trim()
  const vis = grupos
    .filter((g) => (!q || g.nome.toLowerCase().includes(q) || [...g.destinos].some((d) => d.includes(q)))
      && (!filtro || (filtro === 'falha' ? g.temFalha : g.modelos.has(filtro))))
    .sort((a, b) => dataDe(b.ultimo) - dataDe(a.ultimo))

  const gAberto = aberto ? grupos.find((g) => g.chave === aberto) : null

  return (
    <div className="bloco">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="abas">
          {ciclosExistentes.map((c) => (
            <button key={c} aria-pressed={ciclo === c} data-etapa="educacional" onClick={() => setCiclo(c)}>
              {cicloNome(c)}{c === cicloAtual() ? ' · atual' : ''}
            </button>
          ))}
          {ciclosExistentes.length > 0 && (
            <button aria-pressed={ciclo === ''} data-etapa="educacional" onClick={() => setCiclo('')}>Todos</button>
          )}
        </div>
        <button className="bt claro mini" onClick={carregar}>Atualizar</button>
        <span style={{ fontSize: 13, color: 'var(--fraco)' }}>histórico real dos disparos</span>
      </div>
      <p className="explica" style={{ marginBottom: 16 }}>
        Cada empresa mostra os modelos disparados no ciclo, o último envio e o status por canal. Os dados vêm do log real de disparos.
      </p>

      {erro && <div className="banner" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="faixa"><div className="grupo-filtro">
        {defs.map(([v, l, c, n]) => (
          <button key={v || 'todas'} className={'fp' + (n === 0 ? ' zero' : '')} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
            <span className="pt" style={{ background: c }} />{l}<span className="n">{n}</span>
          </button>
        ))}
      </div></div>

      <div className="busca">
        <input type="text" value={busca} placeholder="Buscar empresa ou e-mail" onChange={(e) => setBusca(e.target.value)} />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--fraco)' }}>{vis.length} de {grupos.length} empresas</span>
      </div>

      <table>
        <thead><tr>
          <th style={{ width: '26%' }}>Empresa</th>
          <th style={{ width: '28%' }}>Modelos enviados</th>
          <th style={{ width: '16%' }}>Último envio</th>
          <th style={{ width: '14%' }}>Canal</th>
          <th>Status</th>
        </tr></thead>
        <tbody>
          {vis.length ? vis.map((g) => (
            <tr key={g.chave} className="clicavel" onClick={() => setAberto(g.chave)}>
              <td>
                <span className="avatar">{iniciais(g.nome)}</span>
                <span style={{ fontWeight: 600, color: 'var(--tinta)' }}>{g.nome}</span>
                <div className="mono" style={{ color: 'var(--fraco)', marginLeft: 35 }}>{[...g.destinos][0] || '—'}{g.destinos.size > 1 ? ` +${g.destinos.size - 1}` : ''}</div>
              </td>
              <td><ChipsModelos modelos={g.modelos} /></td>
              <td className="mono">{soData(dataDe(g.ultimo))}<div style={{ color: 'var(--fraco)', fontSize: 12 }}>{rotuloModelo(g.ultimo.modelo)}</div></td>
              <td>{[...g.canais].map((c) => <span key={c} className="tag" style={{ marginRight: 4 }}>{c}</span>)}</td>
              <td>
                {g.todosOk
                  ? <span className="st ok">{g.total} enviado(s)</span>
                  : <><span className="st err">{g.envios.filter((e) => !sucesso(e.status)).length} falha(s)</span> <span className="st ok">{g.envios.filter((e) => sucesso(e.status)).length} ok</span></>}
              </td>
            </tr>
          )) : <tr><td colSpan={5} className="vazio">{lista.length ? 'Nenhuma empresa com esses filtros.' : 'Nenhum disparo registrado ainda. Envie pela aba Disparar.'}</td></tr>}
        </tbody>
      </table>

      <GavetaEmpresa g={gAberto} ciclo={cicloAtivo} onFechar={() => setAberto(null)} />
    </div>
  )
}

function GavetaEmpresa({ g, ciclo, onFechar }) {
  return (
    <>
      <div className={'veu' + (g ? ' on' : '')} onClick={onFechar} />
      <aside className={'gaveta' + (g ? ' on' : '')} aria-hidden={!g}>
        {g && (
          <>
            <div className="g-topo">
              <div className="marca">{iniciais(g.nome)}</div>
              <div style={{ minWidth: 0 }}><h3>{g.nome}</h3><div className="cn">{[...g.destinos].join(', ')}</div></div>
              <button className="fechar" aria-label="Fechar" onClick={onFechar}>✕</button>
            </div>
            <div className="g-corpo">
              <div className="g-linha"><span className="rot">Ciclo</span><span className="val">{ciclo ? cicloNome(ciclo) : 'todos'}</span></div>
              <div className="g-linha"><span className="rot">Disparos</span><span className="val">{g.total}</span></div>
              <div className="g-linha"><span className="rot">Modelos</span><span className="val">{[...g.modelos].map(rotuloModelo).join(', ') || '—'}</span></div>
              <div className="g-linha"><span className="rot">Canais</span><span className="val">{[...g.canais].join(', ') || '—'}</span></div>
              <div className="g-linha"><span className="rot">Situação</span><span className="val">{g.temFalha ? 'com falha' : 'todos ok'}</span></div>

              <div className="g-sec">Histórico de disparos</div>
              {g.envios.slice().reverse().map((h, i) => (
                <div className="passo" key={i}>
                  <span className="mono" style={{ minWidth: 92, color: 'var(--fraco)' }}>{soData(dataDe(h))}</span>
                  <span style={{ minWidth: 130 }}>{rotuloModelo(h.modelo)}</span>
                  <span className="tag" style={{ marginRight: 6 }}>{h.canal}</span>
                  <span className="mono" style={{ flex: 1, color: 'var(--fraco)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.destino}</span>
                  <span className={'st ' + (sucesso(h.status) ? 'ok' : 'err')}>{rotuloStatus(h.status)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  )
}
