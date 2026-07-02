// Serviço de Empresas — enriquecimento (Hunter), sugestão e validação de domínio.
// Documentação e testes: repo kard-backend → notebooks/empresas.ipynb
import { api } from './ApiClient'
import { Empresa } from '../models/Empresa'

export class EmpresasService {
  constructor(cliente = api) {
    this.api = cliente
  }

  // GET /crm-cobranca/empresas — empresas enriquecidas (emails_rh já parseado no modelo).
  async listarEmpresas() {
    const data = await this.api.get('/crm-cobranca/empresas')
    const lista = Array.isArray(data) ? data : (data?.data || [])
    return lista.map(Empresa.fromJson)
  }

  // POST /crm-cobranca/enriquecer — PAGA (cota Hunter). forcar=true ignora o cache Redis;
  // dominio manda a busca por domínio (evita chute errado).
  enriquecerEmpresa(empresa, cnpj, forcar, dominio) {
    return this.api.post('/crm-cobranca/enriquecer', {
      empresa,
      cnpj,
      forcar: forcar === true,
      dominio: dominio || undefined,
    })
  }

  // GET /crm-cobranca/dominios — GRÁTIS. Domínios candidatos + contagem (Hunter email-count).
  async sugerirDominios(nome) {
    try {
      const data = await this.api.get('/crm-cobranca/dominios', { empresa: nome })
      return Array.isArray(data) ? data : (data?.dominios || [])
    } catch {
      return []
    }
  }

  // POST /crm-cobranca/validar — GRÁTIS. Validação em lote: CNPJ + candidatos + palpite da IA.
  validarDominio(empresa, cnpj) {
    return this.api.post('/crm-cobranca/validar', { empresa, cnpj: cnpj || '' })
  }
}

export const empresasService = new EmpresasService()
