// Cliente HTTP base (camada de rede). Encapsula a URL base dos webhooks do n8n,
// o cabeçalho JSON e o tratamento de erro. É a única classe que fala fetch.
// Todo o back-end vive no n8n; aqui só concentramos as chamadas.

export class ApiClient {
  constructor(base) {
    const bruto = base || import.meta.env.VITE_N8N_BASE || 'https://n8n.srv1759869.hstgr.cloud/webhook'
    this.base = bruto.replace(/\/$/, '')
  }

  async request(caminho, opcoes) {
    const r = await fetch(`${this.base}${caminho}`, opcoes)
    if (!r.ok) throw new Error('HTTP ' + r.status)
    // alguns webhooks respondem vazio; tratamos com cuidado
    const texto = await r.text()
    return texto ? JSON.parse(texto) : null
  }

  get(caminho, params) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request(caminho + qs)
  }

  post(caminho, corpo) {
    return this.request(caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  }
}

// Instância única compartilhada pelos serviços.
export const api = new ApiClient()
