import { api } from './ApiClient'
import { JobRpa } from '../models/JobRpa'
import { ExecucaoRpa } from '../models/ExecucaoRpa'

// Serviço da tela RPA — encapsula os webhooks do workflow "RPA — API do painel" (n8n).
//
// CONTRATO — todas as rotas são POST, com corpo JSON, sob a base VITE_N8N_BASE.
// O n8n expõe um único webhook `rpa/:rota`; o nome da rota é o último pedaço:
//   /rpa/jobs               {}                 → [job]
//   /rpa/jobs-salvar        {job}              → job salvo (sem id = cria)
//   /rpa/jobs-apagar        {id}               → {} (apaga o job e as execuções dele)
//   /rpa/jobs-ativar        {id, ativo}        → job atualizado
//   /rpa/jobs-executar      {id}               → execução criada (status "fila")
//   /rpa/execucoes          {job, limite}      → [execucao] (mais novas primeiro; job é obrigatório)
//   /rpa/execucao           {id}               → execucao (com log completo)
//   /rpa/execucoes-cancelar {id}               → execução cancelada — só se ainda estiver na fila
//   /rpa/agentes            {}                 → [{ nome, so, versao, ultimo_ping }]
//
// O agente local (agente/kard_agente.py) usa outro workflow — "RPA — API dos agentes",
// em /rpa-agente/* — que o front nunca chama. Ver docs/RPA.md.
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
    const data = await this.api.post('/rpa/jobs', {})
    return RpaService.lista(data).map((j) => new JobRpa(j))
  }

  // Cria (sem id) ou atualiza (com id). Devolve o job já normalizado.
  async salvarJob(job) {
    const corpo = job instanceof JobRpa ? job.paraApi() : job
    const r = await this.api.post('/rpa/jobs-salvar', corpo)
    return new JobRpa({ ...corpo, ...(r || {}) })
  }

  apagarJob(id) {
    return this.api.post('/rpa/jobs-apagar', { id })
  }

  ativarJob(id, ativo) {
    return this.api.post('/rpa/jobs-ativar', { id, ativo: !!ativo })
  }

  // Enfileira uma execução manual. Job de nuvem roda na hora; job de agente
  // fica na fila até o agente daquela máquina puxar.
  async executarJob(id) {
    const r = await this.api.post('/rpa/jobs-executar', { id })
    return r || {}
  }

  // `jobId` é obrigatório: o n8n filtra as execuções por job.
  async listarExecucoes(jobId, limite = 50) {
    const data = await this.api.post('/rpa/execucoes', { job: String(jobId), limite })
    return RpaService.lista(data).map((e) => new ExecucaoRpa(e))
  }

  async lerExecucao(id) {
    const data = await this.api.post('/rpa/execucao', { id })
    const bruto = Array.isArray(data) ? data[0] : data
    return bruto ? new ExecucaoRpa(bruto) : null
  }

  // Só tira da fila: se o agente já pegou a execução, o processo dele não é morto.
  cancelarExecucao(id) {
    return this.api.post('/rpa/execucoes-cancelar', { id })
  }

  // Agentes que deram ping recentemente. `online` é calculado aqui: o n8n só
  // guarda o último ping, e o agente pinga a cada 30s.
  async listarAgentes() {
    const data = await this.api.post('/rpa/agentes', {})
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
