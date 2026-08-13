import { api } from './ApiClient'

// Caixa de entrada do Outlook (cobranca@kard.com.br) via workflow
// "SVC - Inbox Outlook (Cobrança)" no n8n.
// CONTRATO dos endpoints:
//   GET /inbox-emails?limite=50
//     → { total, emails: [{ id, assunto, de_nome, de_email, para[],
//         recebido_em, lido, tem_anexo, preview }] }
//   GET /inbox-email?id=<idDaMensagem>
//     → mensagem completa do Graph: { id, subject, from, toRecipients,
//         ccRecipients, receivedDateTime, isRead, hasAttachments,
//         body: { contentType, content }, webLink }
export class InboxService {
  constructor(apiClient) {
    this.api = apiClient
  }

  async listar(limite = 50) {
    const r = await this.api.get('/inbox-emails', { limite })
    const dados = typeof r === 'string' ? JSON.parse(r) : (r || {})
    return { total: dados.total || 0, emails: dados.emails || [] }
  }

  async abrir(id) {
    const r = await this.api.get('/inbox-email', { id })
    return typeof r === 'string' ? JSON.parse(r) : (r || {})
  }
}

export const inboxService = new InboxService(api)
