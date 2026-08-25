// Modelo de uma execução de job de RPA (uma "rodada").
// Status possíveis, do enfileiramento ao desfecho:
//   fila → rodando → ok | erro | timeout | cancelado
export const STATUS_EXEC = {
  fila: { label: 'Na fila', pill: 'pill-neutro' },
  rodando: { label: 'Rodando', pill: 'pill-neutro' },
  ok: { label: 'Sucesso', pill: 'pill-ok' },
  erro: { label: 'Erro', pill: 'pill-erro' },
  timeout: { label: 'Timeout', pill: 'pill-erro' },
  cancelado: { label: 'Cancelado', pill: 'pill-neutro' },
}

export class ExecucaoRpa {
  constructor(bruto = {}) {
    this.id = bruto.id != null ? String(bruto.id) : ''
    this.job_id = bruto.job_id != null ? String(bruto.job_id) : ''
    this.job_nome = bruto.job_nome || ''
    this.status = STATUS_EXEC[bruto.status] ? bruto.status : 'fila'
    this.origem = bruto.origem || 'manual'
    this.agente = bruto.agente || ''
    this.inicio = bruto.inicio || ''
    this.fim = bruto.fim || ''
    this.duracao_ms = Number(bruto.duracao_ms) || 0
    this.codigo_saida = bruto.codigo_saida === '' || bruto.codigo_saida == null ? null : Number(bruto.codigo_saida)
    this.saida = bruto.saida || ''
    this.erro = bruto.erro || ''
    this.tentativa = Number(bruto.tentativa) || 1
  }

  get emAndamento() {
    return this.status === 'fila' || this.status === 'rodando'
  }

  get rotulo() {
    return (STATUS_EXEC[this.status] || STATUS_EXEC.fila).label
  }

  get pill() {
    return (STATUS_EXEC[this.status] || STATUS_EXEC.fila).pill
  }

  // Duração legível: usa o campo gravado ou calcula por início/fim.
  get duracao() {
    let ms = this.duracao_ms
    if (!ms && this.inicio && this.fim) ms = new Date(this.fim) - new Date(this.inicio)
    if (!ms || ms < 0) return '—'
    if (ms < 1000) return `${ms} ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
    const min = Math.floor(ms / 60000)
    const seg = Math.round((ms % 60000) / 1000)
    return `${min}m ${String(seg).padStart(2, '0')}s`
  }

  // stdout + stderr no mesmo painel, com o erro marcado.
  get log() {
    const partes = []
    if (this.saida) partes.push(this.saida.replace(/\s+$/, ''))
    if (this.erro) partes.push(`--- erro ---\n${this.erro.replace(/\s+$/, '')}`)
    return partes.join('\n') || '(sem saída)'
  }
}
