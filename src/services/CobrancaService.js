// Serviço de Cobrança/Contatos — encapsula as rotas da Data Table `cobranca`.
// Documentação e testes: repo kard-backend → notebooks/cobranca.ipynb
import { api } from './ApiClient'
import { Contato } from '../models/Contato'

export class CobrancaService {
  constructor(cliente = api) {
    this.api = cliente
  }

  // GET /crm-cobranca/list — todos os contatos.
  async listarContatos() {
    const data = await this.api.get('/crm-cobranca/list')
    const lista = Array.isArray(data) ? data : (data?.data || [])
    return lista.map(Contato.fromJson)
  }

  // POST /crm-cobranca/update — move um contato de etapa.
  moverContato(id, etapa) {
    return this.api.post('/crm-cobranca/update', { id, etapa })
  }

  // POST /crm-cobranca/importar — importa uma carga (upsert por email).
  importarCarga(etapa, registros) {
    return this.api.post('/crm-cobranca/importar', { etapa, registros })
  }

  // POST /crm-cobranca/disparar — dispara os e-mails de uma etapa (via CyberTalk).
  dispararEtapa(etapa, modelo) {
    return this.api.post('/crm-cobranca/disparar', { etapa, modelo })
  }
}

export const cobrancaService = new CobrancaService()
