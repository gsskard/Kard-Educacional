import { api } from './ApiClient'

// Serviço do teste de e-mail para EMPREGADORES (educativo) via CyberTalk.
// Fala com o webhook do workflow "[TESTE CYBERTALK] E-mail Empregadores (2 modelos)":
//   POST /empregadores-email-teste  { modelo, destino, nome, assunto? }
//     modelo: 'repasse' (repasse dia 20) | 'escrituracao' (prazo de escrituração)
//   → { modelo, status, communication_id, http_status, resposta, aviso, ... }
//     status === 'aceito_pela_api' quando a CyberTalk aceitou o disparo
//     (aceito ≠ entregue — a entrega vem pelos eventos em /webhook/cbtk-eventos).
export class EmpregadoresService {
  constructor(cliente = api) {
    this.api = cliente
  }

  enviarTeste({ modelo, destino, nome, assunto }) {
    return this.api.post('/empregadores-email-teste', { modelo, destino, nome, assunto })
  }
}

export const empregadoresService = new EmpregadoresService()
