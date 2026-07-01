import { irPara } from '../hooks/useHashRoute'

// Menu lateral + cabeçalho. Envolve todas as telas (RF-30: painel/CRM).
// O item "ativo" é destacado conforme a rota atual.

const MENU = [
  { rota: 'dashboard', label: 'Dashboard', icone: '▦' },
  { tipo: 'grupo', label: 'Régua (etapas)' },
  { rota: 'educacional-1', label: 'Educacional 1', icone: '①' },
  { rota: 'educacional-2', label: 'Educacional 2', icone: '②' },
  { rota: 'cobranca', label: 'Cobrança', icone: '③' },
  { tipo: 'grupo', label: 'Dados' },
  { rota: 'contatos', label: 'Contatos', icone: '☺' },
  { rota: 'configuracoes', label: 'Configurações', icone: '⚙' },
]

export default function Layout({ rota, children }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-nome">Kard CRM</div>
          <div className="brand-sub">Régua educativa e cobrança</div>
        </div>
        <nav>
          {MENU.map((item, i) =>
            item.tipo === 'grupo' ? (
              <div key={i} className="menu-grupo">{item.label}</div>
            ) : (
              <button
                key={item.rota}
                className={'menu-item' + (rota === item.rota ? ' ativo' : '')}
                onClick={() => irPara(item.rota)}
              >
                <span className="menu-icone">{item.icone}</span>
                {item.label}
              </button>
            )
          )}
        </nav>
        <div className="sidebar-rodape">Fase 1 — MVP</div>
      </aside>
      <main className="conteudo">{children}</main>
    </div>
  )
}
