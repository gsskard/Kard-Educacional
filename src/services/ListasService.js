// Serviço de Listas (mail merge) — encapsula as rotas do workflow
// "IA - Listas (Mail Merge)" (n8n). A regra de negócio central:
// só recebe e-mail quem CASOU (CNPJ + e-mail juntos) com a base
// prospectada (rh_enriquecimento). O cruzamento acontece no n8n.
import { api } from './ApiClient'

export class ListasService {
  constructor(cliente = api) {
    this.api = cliente
  }

  // POST /crm-listas/criar — salva a lista com nome/etiquetas e cruza com a base.
  // Retorna { lista_id, total, casados, fora: [{cnpj,email,nome}] }.
  criarLista(nome, etiquetas, etapa, registros) {
    return this.api.post('/crm-listas/criar', { nome, etiquetas, etapa, registros })
  }

  // GET /crm-listas/list — listas salvas com contadores (total/casados/enviados).
  async listarListas() {
    const data = await this.api.get('/crm-listas/list')
    const lista = Array.isArray(data) ? data : (data ? [data] : [])
    // o n8n devolve um item {success:true} quando não há listas — filtramos
    return lista.filter((l) => l && l.id != null)
  }

  // GET /crm-listas/itens?lista=ID — itens da lista com a flag `casado`.
  async lerItens(listaId) {
    const data = await this.api.get('/crm-listas/itens', { lista: listaId })
    const lista = Array.isArray(data) ? data : (data ? [data] : [])
    return lista.filter((i) => i && i.id != null)
  }

  // POST /crm-listas/disparar — dispara SÓ os itens casados da lista (CyberTalk)
  // e grava cada envio em lista_envios. Retorna { disparados, enviados, falhas }.
  dispararLista(listaId, modelo) {
    return this.api.post('/crm-listas/disparar', { lista_id: listaId, modelo })
  }

  // POST /crm-listas/importar-fora — importa os itens "fora da base" para a
  // base prospectada (rh_enriquecimento) e os marca como casados.
  importarFora(listaId) {
    return this.api.post('/crm-listas/importar-fora', { lista_id: listaId })
  }

  // GET /crm-listas/envios — log de envios (analytics): cnpj/email/data/modelo/status.
  async lerEnvios() {
    const data = await this.api.get('/crm-listas/envios')
    const lista = Array.isArray(data) ? data : (data ? [data] : [])
    return lista.filter((e) => e && e.id != null)
  }
}

export const listasService = new ListasService()
