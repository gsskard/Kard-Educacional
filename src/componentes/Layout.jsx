import { useState, useEffect } from 'react'
import { irPara } from '../hooks/useHashRoute'
import { saldosPlataformas, snovSaldo } from '../api/n8n'

// Layout no estilo do "Portal Super Crédito" da Kard:
// sidebar branca com logo + menu (chevron), topo com breadcrumb e usuário.
// A sidebar recolhe/expande (☰) pra dar mais espaço às tabelas largas.

const MENU = [
  { rota: 'educacional', label: 'Educacional' },
  { rota: 'cobranca', label: 'Cobrança' },
  { rota: 'contatos', label: 'Contatos' },
  { rota: 'empresas', label: 'Empresas' },
]

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark" />
      <span className="logo-word">kard</span>
    </div>
  )
}

const USUARIO = 'Gabriella'

// Ícone da Snov (marca simplificada em SVG, sem depender de arquivo externo).
function SnovIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#22c55e" />
      <path d="M15.5 8.3c-.9-.7-2-1.1-3.2-1.1-2.1 0-3.6 1-3.6 2.6 0 3.4 5.8 1.9 5.8 3.9 0 .6-.7 1-1.8 1-1.2 0-2.3-.5-3.1-1.2l-1 1.7c1 .9 2.5 1.4 4 1.4 2.3 0 3.9-1.1 3.9-2.8 0-3.5-5.8-2.1-5.8-3.9 0-.5.6-.9 1.6-.9 1 0 2 .4 2.7.9l.9-1.6z" fill="#fff" />
    </svg>
  )
}

// Ícones das demais plataformas (marcas simplificadas em SVG, sem arquivo externo).
function HunterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#fa5320" />
      <path d="M8 6.5v11M16 6.5v11M8 12h8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
function SerperIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#2563eb" />
      <circle cx="11" cy="11" r="4.2" stroke="#fff" strokeWidth="2" />
      <path d="M14.2 14.2L17.5 17.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function ApolloIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#1f2937" />
      <path d="M12 5.5l5.5 13h-3l-2.5-6.3-2.5 6.3H6L11.5 5.5h.5z" fill="#ffd200" />
    </svg>
  )
}

// Chips de saldo das plataformas no topo (aparecem em todas as telas).
// Snov e Hunter têm API de saldo; Serper e Apollo não expõem (mostram "—").
function SaldosPlataformas() {
  const [saldos, setSaldos] = useState(null)
  useEffect(() => {
    let vivo = true
    saldosPlataformas()
      .then((s) => { if (vivo) setSaldos(s) })
      .catch(() => {
        // fallback: pelo menos o saldo Snov, pelo endpoint antigo
        snovSaldo()
          .then((s) => { if (vivo) setSaldos({ snov: s.creditos, hunter: null, serper: null, apollo: null }) })
          .catch(() => { if (vivo) setSaldos({}) })
      })
    return () => { vivo = false }
  }, [])
  const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'))
  const chips = [
    { chave: 'snov', Icone: SnovIcon, titulo: 'Créditos disponíveis na Snov.io' },
    { chave: 'hunter', Icone: HunterIcon, titulo: 'Requisições restantes no mês na Hunter.io (buscas + verificações)' },
    { chave: 'serper', Icone: SerperIcon, titulo: 'Serper.dev não expõe saldo por API — veja em serper.dev/dashboard' },
    { chave: 'apollo', Icone: ApolloIcon, titulo: 'Apollo.io não expõe saldo por API — veja em app.apollo.io' },
  ]
  return (
    <span className="saldos-chips">
      {chips.map(({ chave, Icone, titulo }) => (
        <span className="snov-chip" key={chave} title={titulo}>
          <Icone />
          <span className="snov-chip-num">{saldos ? fmt(saldos[chave]) : '…'}</span>
        </span>
      ))}
    </span>
  )
}

export default function Layout({ rota, children }) {
  const atual = MENU.find((m) => m.rota === rota)
  const tituloAtual = atual ? atual.label : 'Kard'

  // gaveta recolhida? guarda a preferência; em tela estreita começa fechada (auto)
  const [recolhido, setRecolhido] = useState(() => {
    const s = localStorage.getItem('kard_menu_recolhido')
    if (s === '1') return true
    if (s === '0') return false
    return window.innerWidth <= 820
  })
  function alternarMenu() {
    setRecolhido((v) => {
      const novo = !v
      localStorage.setItem('kard_menu_recolhido', novo ? '1' : '0')
      return novo
    })
  }
  // navegar: em tela estreita a gaveta fecha sozinha pra não tapar o conteúdo
  function navegar(rota) {
    irPara(rota)
    if (window.innerWidth <= 820) setRecolhido(true)
  }

  return (
    <div className={'shell' + (recolhido ? ' recolhido' : '')}>
      {!recolhido && <div className="sidebar-backdrop" onClick={alternarMenu} />}
      <aside className="sidebar">
        <div className="brand">
          <Logo />
        </div>
        <nav>
          {MENU.map((item) => (
            <button
              key={item.rota}
              className={'menu-item' + (rota === item.rota ? ' ativo' : '')}
              onClick={() => navegar(item.rota)}
            >
              <span>{item.label}</span>
              <span className="chevron">›</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-rodape">Fase 1 — MVP</div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="btn-menu-toggle" onClick={alternarMenu} title={recolhido ? 'Expandir menu' : 'Recolher menu'} aria-label="Recolher/expandir menu">☰</button>
            <span className="crumb-atual">{tituloAtual}</span>
          </div>
          <div className="topo-direita">
            <SaldosPlataformas />
            <div className="usuario">
              <span className="usuario-icone">👤</span>
              {USUARIO}
            </div>
          </div>
        </header>
        <main className="conteudo">{children}</main>
      </div>
    </div>
  )
}
