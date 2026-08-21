import { api } from './ApiClient'

// Serviço do teste de e-mail para EMPREGADORES (educativo).
// Fala com o webhook do workflow "[TESTE CYBERTALK] E-mail Empregadores (2 modelos)":
//   POST /empregadores-email-teste  { modelo, destino, nome, assunto?, canal? }
//     modelo: 'repasse' (repasse dia 20) | 'escrituracao' (prazo de escrituração)
//     canal:  'outlook' (Microsoft Graph — entrega direto) | 'cybertalk' (default do back)
//   → Outlook:   { canal:'outlook', status:'enviado', http_status, ... }
//   → CyberTalk: { canal:'cybertalk'?, status:'aceito_pela_api', communication_id, ... }
//     (na CyberTalk, aceito ≠ entregue — a entrega vem pelos eventos em /webhook/cbtk-eventos).
export class EmpregadoresService {
  constructor(cliente = api) {
    this.api = cliente
  }

  enviarTeste({ modelo, destino, nome, assunto, canal }) {
    return this.api.post('/empregadores-email-teste', { modelo, destino, nome, assunto, canal })
  }
}

export const empregadoresService = new EmpregadoresService()
