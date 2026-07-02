// Modelo de domínio: um contato da régua (linha da Data Table `cobranca`).
export class Contato {
  constructor(dados = {}) {
    Object.assign(this, dados)
  }

  static fromJson(j) {
    return new Contato(j || {})
  }

  get valorNumero() {
    const n = Number(this.valor)
    return Number.isFinite(n) ? n : 0
  }
}
