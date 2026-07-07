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

  // sidebar recolhida? guarda a preferência no navegador
  const [recolhido, setRecolhido] = useState(() => localStorage.getItem('kard_menu_recolhido') === '1')
  function alternarMenu() {
    setRecolhido((v) => {
      const novo = !v
      localStorage.setItem('kard_menu_recolhido', novo ? '1' : '0')
      return novo
    })
  }

  return (
    <div className={'shell' + (recolhido ? ' recolhido' : '')}>
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
              onClick={() => irPara(item.rota)}
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
