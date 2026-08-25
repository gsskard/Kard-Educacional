import { LINGUAGENS, MODELOS_CODIGO, validarCron } from '../config/rpa'

// Modelo de domínio de um job de RPA.
// O n8n guarda tudo em colunas simples (Data Table), então `variaveis` viaja
// como JSON em texto — a normalização de ida e volta mora aqui.
export class JobRpa {
  constructor(bruto = {}) {
    this.id = bruto.id != null ? String(bruto.id) : ''
    this.nome = bruto.nome || ''
    this.descricao = bruto.descricao || ''
    this.linguagem = LINGUAGENS[bruto.linguagem] ? bruto.linguagem : 'python'
    this.codigo = bruto.codigo != null ? String(bruto.codigo) : MODELOS_CODIGO[this.linguagem]
    this.cron = (bruto.cron || '').trim()
    this.ativo = bruto.ativo === true || bruto.ativo === 'true' || bruto.ativo === 1
    // onde roda: 'nuvem' (servidor n8n) ou 'agente' (máquina com o agente instalado)
    this.destino = bruto.destino === 'agente' ? 'agente' : 'nuvem'
    this.agente = bruto.agente || ''
    this.timeout_seg = Number(bruto.timeout_seg) > 0 ? Number(bruto.timeout_seg) : 300
    this.max_retentativas = Number(bruto.max_retentativas) >= 0 ? Number(bruto.max_retentativas) : 0
    this.variaveis = JobRpa.lerVariaveis(bruto.variaveis)
    this.criado_em = bruto.criado_em || ''
    this.atualizado_em = bruto.atualizado_em || ''
    this.ultimo_status = bruto.ultimo_status || ''
    this.ultima_execucao_em = bruto.ultima_execucao_em || ''
  }

  // Aceita objeto (já parseado) ou o JSON em texto que vem da Data Table.
  static lerVariaveis(valor) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) return { ...valor }
    if (typeof valor === 'string' && valor.trim()) {
      try {
        const obj = JSON.parse(valor)
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
      } catch { return {} }
    }
    return {}
  }

  static novo() {
    return new JobRpa({ nome: '', linguagem: 'python', destino: 'nuvem', ativo: false })
  }

  // Motivos que impedem salvar (lista vazia = pode salvar).
  problemas() {
    const erros = []
    if (!this.nome.trim()) erros.push('Dê um nome ao job.')
    if (!String(this.codigo).trim()) erros.push('O job está sem código.')
    if (this.destino === 'agente' && !this.agente) erros.push('Escolha em qual agente o job vai rodar.')
    const erroCron = validarCron(this.cron)
    if (erroCron) erros.push(erroCron)
    if (this.ativo && !this.cron) erros.push('Job agendado precisa de um cron — ou deixe desligado e rode manualmente.')
    return erros
  }

  // Formato enviado ao n8n (variáveis serializadas).
  paraApi() {
    return {
      id: this.id || undefined,
      nome: this.nome.trim(),
      descricao: this.descricao.trim(),
      linguagem: this.linguagem,
      codigo: this.codigo,
      cron: this.cron.trim(),
      ativo: this.ativo,
      destino: this.destino,
      agente: this.destino === 'agente' ? this.agente : '',
      timeout_seg: this.timeout_seg,
      max_retentativas: this.max_retentativas,
      variaveis: JSON.stringify(this.variaveis || {}),
    }
  }

  get onde() {
    return this.destino === 'agente' ? (this.agente || 'agente') : 'nuvem (n8n)'
  }
}
