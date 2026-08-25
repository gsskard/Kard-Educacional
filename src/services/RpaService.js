import { api } from './ApiClient'
import { JobRpa } from '../models/JobRpa'
import { ExecucaoRpa } from '../models/ExecucaoRpa'

// Serviço da tela RPA — encapsula os webhooks do workflow "RPA — API" (n8n).
//
// CONTRATO (todas as rotas sob a base VITE_N8N_BASE):
//   GET  /rpa/jobs                        → [job]
//   POST /rpa/jobs/salvar   {job}         → { id }            (sem id = cria)
//   POST /rpa/jobs/apagar   {id}          → { ok: true }
//   POST /rpa/jobs/ativar   {id, ativo}   → { ok: true }
//   POST /rpa/jobs/executar {id}          → { execucao_id }   (enfileira agora)
//   GET  /rpa/execucoes?job=ID&limite=N   → [execucao]        (job opcional)
//   GET  /rpa/execucao?id=ID              → execucao (com log completo)
//   POST /rpa/execucoes/cancelar {id}     → { ok: true }
//   GET  /rpa/agentes                     → [{ nome, so, versao, ultimo_ping }]
//
// O agente local (agente/kard_agente.py) usa outras três rotas do mesmo
// workflow — /rpa/agente/ping, /rpa/agente/puxar e /rpa/agente/resultado —
// que o front nunca chama. Ver docs/RPA.md.
export class RpaService {
  constructor(cliente = api) {
    this.api = cliente
  }

  // Os webhooks do n8n às vezes devolvem um item solto ou um {success:true}
  // quando a tabela está vazia; normalizamos para lista sempre.
  static lista(data) {
    const bruta = Array.isArray(data) ? data : (data ? [data] : [])
    return bruta.filter((x) => x && x.id != null)
  }

  async listarJobs() {
    const data = await this.api.get('/rpa/jobs')
    return RpaService.lista(data).map((j) => new JobRpa(j))
  }

  // Cria (sem id) ou atualiza (com id). Devolve o job já normalizado.
  async salvarJob(job) {
    const corpo = job instanceof JobRpa ? job.paraApi() : job
    const r = await this.api.post('/rpa/jobs/salvar', corpo)
    return new JobRpa({ ...corpo, ...(r || {}) })
  }

  apagarJob(id) {
    return this.api.post('/rpa/jobs/apagar', { id })
  }

  ativarJob(id, ativo) {
    return this.api.post('/rpa/jobs/ativar', { id, ativo: !!ativo })
  }

  // Enfileira uma execução manual. Job de nuvem roda na hora; job de agente
  // fica na fila até o agente daquela máquina puxar.
  async executarJob(id) {
    const r = await this.api.post('/rpa/jobs/executar', { id })
    return r || {}
  }

  async listarExecucoes(jobId, limite = 50) {
    const params = { limite }
    if (jobId) params.job = jobId
    const data = await this.api.get('/rpa/execucoes', params)
    return RpaService.lista(data).map((e) => new ExecucaoRpa(e))
  }

  async lerExecucao(id) {
    const data = await this.api.get('/rpa/execucao', { id })
    const bruto = Array.isArray(data) ? data[0] : data
    return bruto ? new ExecucaoRpa(bruto) : null
  }

  cancelarExecucao(id) {
    return this.api.post('/rpa/execucoes/cancelar', { id })
  }

  // Agentes que deram ping recentemente. `online` é calculado aqui: o n8n só
  // guarda o último ping, e o agente pinga a cada 30s.
  async listarAgentes() {
    const data = await this.api.get('/rpa/agentes')
    const bruta = Array.isArray(data) ? data : (data ? [data] : [])
    const agora = Date.now()
    return bruta
      .filter((a) => a && a.nome)
      .map((a) => {
        const ping = a.ultimo_ping ? new Date(a.ultimo_ping).getTime() : 0
        return { ...a, online: ping > 0 && agora - ping < 2 * 60 * 1000 }
      })
  }
}

export const rpaService = new RpaService()
