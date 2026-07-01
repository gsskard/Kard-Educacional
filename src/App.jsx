import { useHashRoute } from './hooks/useHashRoute'
import Layout from './componentes/Layout'
import Dashboard from './telas/Dashboard'
import TelaEtapa from './telas/TelaEtapa'
import Contatos from './telas/Contatos'
import Configuracoes from './telas/Configuracoes'
import { ETAPAS } from './config/etapas'

// Roteamento simples por hash (#/rota). Cada rota renderiza uma tela.
// As 3 telas de etapa reusam o MESMO componente TelaEtapa (telas "espelho").

export default function App() {
  const rota = useHashRoute()

  function renderizarTela() {
    if (rota === 'dashboard') return <Dashboard />
    if (rota === 'contatos') return <Contatos />
    if (rota === 'configuracoes') return <Configuracoes />
    // rotas das 3 etapas → mesmo componente, config diferente
    if (ETAPAS[rota]) return <TelaEtapa etapa={ETAPAS[rota]} />
    // rota desconhecida
    return <Dashboard />
  }

  return <Layout rota={rota}>{renderizarTela()}</Layout>
}
