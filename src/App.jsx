import { useHashRoute } from './hooks/useHashRoute'
import Layout from './componentes/Layout'
import Dashboard from './telas/Dashboard'
import Disparos from './telas/Disparos'
import Contatos from './telas/Contatos'
import Empresas from './telas/Empresas'
import Obitos from './telas/Obitos'
import Configuracoes from './telas/Configuracoes'
import { ETAPAS } from './config/etapas'

// Roteamento simples por hash (#/rota). Cada rota renderiza uma tela.
// Educacional e Cobrança foram unificadas na tela "Disparos" (abas internas).

export default function App() {
  const rota = useHashRoute()

  function renderizarTela() {
    if (rota === 'dashboard') return <Dashboard />
    if (rota === 'contatos') return <Contatos />
    if (rota === 'empresas') return <Empresas />
    if (rota === 'obitos') return <Obitos />
    if (rota === 'configuracoes') return <Configuracoes />
    // Disparos (inclui compat com os hashes antigos #/educacional e #/cobranca)
    if (rota === 'disparos' || ETAPAS[rota]) return <Disparos />
    // rota desconhecida
    return <Dashboard />
  }

  return <Layout rota={rota}>{renderizarTela()}</Layout>
}
