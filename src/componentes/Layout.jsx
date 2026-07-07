import { useState } from 'react'
import { irPara } from '../hooks/useHashRoute'

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
          <div className="brand-sub">Backoffice</div>
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
            <span className="crumb">Kard CRM</span>
            <span className="crumb-sep">›</span>
            <span className="crumb-atual">{tituloAtual}</span>
          </div>
          <div className="usuario">
            <span className="usuario-icone">👤</span>
            {USUARIO}
          </div>
        </header>
        <main className="conteudo">{children}</main>
      </div>
    </div>
  )
}
