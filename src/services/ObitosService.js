import { api } from './ApiClient'

// Consulta cadastral por CPF via workflow NVCheck (Nova Vida TI) no n8n.
// CONTRATO do endpoint (a criar no n8n como webhook do workflow szxtmwckWnHPkZTg):
//   POST /nvcheck-cpf  body { cpf: "00960253360" }
//   → responde UM objeto JSON com os campos da base enriquecida, ex.:
//     { cpf, status_validacao, nome, nascimento, idade, sexo, situacao_cadastral,
//       obito: "S"|"N", pep, score, faixa_risco, propensao_pagamento, renda,
//       classe_economica, fonte_renda, possivel_profissao, qtd_telefones,
//       telefone_1, whatsapp_1, telefone_2, whatsapp_2, telefone_3,
//       email_1, email_2, logradouro, bairro, cidade, uf, cep, qtd_sociedades }
export class ObitosService {
  constructor(apiClient) {
    this.api = apiClient
  }

  async consultarCpf(cpf) {
    const r = await this.api.post('/nvcheck-cpf', { cpf: String(cpf).replace(/\D/g, '') })
    const dados = typeof r === 'string' ? JSON.parse(r) : (r || {})
    return dados
  }
}

export const obitosService = new ObitosService(api)
