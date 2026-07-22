// Modelo de domínio: um contato de RH (linha da tabela `rh_enriquecimento`).
// No preview vem SEM e-mail (só nome, cargo, LinkedIn + hash_revelar da Snov);
// o e-mail é preenchido só ao "liberar" (rh-revelar) e a validade ao "validar".
export class ProspectRH {
  constructor(dados = {}) {
    Object.assign(this, dados)
    // normaliza campos que podem vir com nomes diferentes do webhook/banco
    this.nome = dados.nome || dados.prospect_nome || dados.name || ''
    this.cargo = dados.cargo || dados.prospect_cargo || dados.position || ''
    this.linkedin = dados.linkedin || dados.prospect_linkedin || dados.source_page || ''
    this.hash_revelar = dados.hash_revelar || dados.hash || dados.id || ''
    this.email = dados.email || null
    this.status_validacao = dados.status_validacao || dados.valido || ''
  }

  static fromJson(j) {
    return new ProspectRH(j || {})
  }

  get liberado() {
    return !!this.email
  }
}
