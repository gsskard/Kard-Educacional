// Modelo de domínio: uma empresa enriquecida (linha da Data Table `empresas`).
// Cuida do detalhe de `emails_rh` chegar como texto JSON do banco.
export class Empresa {
  constructor(dados = {}) {
    Object.assign(this, dados)
    this.emails_rh = Empresa.parseEmails(dados.emails_rh)
    // candidatos de domínio (IA/Snov): pode vir array (já parseado) ou texto JSON.
    this.candidatos = Empresa.parseEmails(dados.candidatos)
  }

  // `emails_rh` pode vir como array (já parseado) ou string JSON (do banco).
  static parseEmails(valor) {
    if (Array.isArray(valor)) return valor
    if (typeof valor === 'string' && valor.trim()) {
      try { return JSON.parse(valor) } catch { return [] }
    }
    return []
  }

  static fromJson(j) {
    return new Empresa(j || {})
  }

  get temEmails() {
    return this.emails_rh.length > 0
  }
}
