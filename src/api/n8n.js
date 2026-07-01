// Camada de acesso ao back-end. IMPORTANTE: todo o back-end fica no n8n.
// Este arquivo só concentra as chamadas HTTP aos webhooks — nenhuma regra de
// negócio mora aqui. Se um endpoint ainda não existe no n8n, deixamos a função
// pronta e marcada como PENDENTE, para plugar assim que o workflow existir.

const API = (import.meta.env.VITE_N8N_BASE || 'https://n8n.srv1759869.hstgr.cloud/webhook').replace(/\/$/, '')

async function req(caminho, opcoes) {
  const r = await fetch(`${API}${caminho}`, opcoes)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  // alguns webhooks respondem vazio; tratamos com cuidado
  const texto = await r.text()
  return texto ? JSON.parse(texto) : null
}

// ---------------------------------------------------------------------------
// JÁ EXISTE no n8n (workflow "IA - Cobrança - API")
// ---------------------------------------------------------------------------

// Lista todos os contatos da Data Table `cobranca`.
export async function listarContatos() {
  const data = await req('/crm-cobranca/list')
  return Array.isArray(data) ? data : (data?.data || [])
}

// Move um contato de etapa. Ao mover para "Cobrança" o n8n dispara o e-mail.
export async function moverContato(id, etapa) {
  return req('/crm-cobranca/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, etapa }),
  })
}

// ---------------------------------------------------------------------------
// Workflows novos (Fase 1) — ver n8n/workflows/
// Precisam estar IMPORTADOS e ATIVOS no n8n, com a chave da CyberTalk preenchida.
// ---------------------------------------------------------------------------

// RF-26/27/28: envia a carga já validada no front para o n8n persistir.
// Workflow: "IA - Cobrança - Importar por Etapa".
export async function importarCarga(etapa, registros) {
  return req('/crm-cobranca/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etapa, registros }),
  })
}

// RF-19: dispara os e-mails de uma etapa (cada tela dispara a sua),
// usando o modelo de e-mail escolhido. Workflow: "IA - Cobrança - Disparar por Etapa".
export async function dispararEtapa(etapa, modelo) {
  return req('/crm-cobranca/disparar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etapa, modelo }),
  })
}

// RF-36: enriquecer um contato via Snov (ação dentro da tela de Contatos).
export async function enriquecerContato(id) {
  // TODO(n8n): criar webhook POST /crm-cobranca/enriquecer
  throw new Error('PENDENTE: criar webhook de enriquecimento Snov no n8n (RF-36)')
}

// RF-39/40: eventos de e-mail (enviado/aberto/clicado) por contato/etapa/inbox.
export async function listarEventos() {
  // TODO(n8n): criar webhook GET /crm-cobranca/eventos
  throw new Error('PENDENTE: criar webhook de eventos no n8n (RF-40)')
}

export { API }
