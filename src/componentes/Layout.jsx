import { useState, useEffect } from 'react'
import { irPara } from '../hooks/useHashRoute'
import { snovSaldo } from '../api/n8n'

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

// Chip de saldo Snov no topo (aparece em todas as telas).
function SnovCreditos() {
  const [creditos, setCreditos] = useState(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    snovSaldo()
      .then((s) => { if (vivo) setCreditos(s.creditos) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [])
  const texto = erro || creditos == null
    ? '—'
    : creditos.toLocaleString('pt-BR')
  return (
    <span className="snov-chip" title="Créditos disponíveis na Snov.io">
      <SnovIcon />
      <span className="snov-chip-num">{texto}</span>
      <span className="snov-chip-label">créditos</span>
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
            <SnovCreditos />
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
