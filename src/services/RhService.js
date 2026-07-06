// Serviço de Enriquecimento de RH via Snov.io — as 3 rotas da especificação.
// Documentação (custo grátis x pago, fluxo do domínio): repo kard-backend.
//
// Regra de custo (resumo):
//   rh-preview  → GRÁTIS (núcleo do domínio + prospectProfiles, sem e-mail)
//   rh-revelar  → PAGO   (1 crédito por e-mail; só no clique do usuário)
//   rh-validar  → PAGO   (emailVerifier, só nos escolhidos)
// O banco sempre reusa o que já foi salvo, então re-chamar não recobra crédito.
import { api } from './ApiClient'
import { ProspectRH } from '../models/ProspectRH'

// Extrai a lista de prospects de respostas em formatos variados
// (array puro, { data: [...] } ou { prospects: [...] }).
function extrairLista(data) {
  if (Array.isArray(data)) return data
  return data?.data || data?.prospects || []
}

export class RhService {
  constructor(cliente = api) {
    this.api = cliente
  }

  // POST /crm-cobranca/rh-preview — GRÁTIS.
  // Lista o RH sem e-mail. Se o CNPJ já foi enriquecido, o n8n devolve do
  // banco (0 crédito). `dominio` (opcional) força o domínio escolhido pelo
  // usuário; vazio deixa o núcleo achar. `cargos_alvo` filtra os cargos;
  // vazio usa o default de RH no fluxo.
  async preview(empresa, cnpj, dominio, cargosAlvo) {
    const data = await this.api.post('/crm-cobranca/rh-preview', {
      empresa,
      cnpj,
      dominio: dominio || undefined,
      cargos_alvo: cargosAlvo && cargosAlvo.length ? cargosAlvo : undefined,
    })
    return extrairLista(data).map(ProspectRH.fromJson)
  }

  // POST /crm-cobranca/rh-revelar — PAGO (1 créd/e-mail encontrado).
  // modo "selecionados": revela os hashes marcados.
  // modo "primeiros_n": revela os primeiros N do domínio (n obrigatório).
  async revelar(cnpj, hashes, modo = 'selecionados', n) {
    const data = await this.api.post('/crm-cobranca/rh-revelar', {
      cnpj,
      hashes: hashes || [],
      modo,
      n: modo === 'primeiros_n' ? n : undefined,
    })
    return extrairLista(data).map(ProspectRH.fromJson)
  }

  // POST /crm-cobranca/rh-validar — PAGO (emailVerifier nos escolhidos).
  async validar(hashes) {
    const data = await this.api.post('/crm-cobranca/rh-validar', {
      hashes: hashes || [],
    })
    return extrairLista(data).map(ProspectRH.fromJson)
  }
}

export const rhService = new RhService()
