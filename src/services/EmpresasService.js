// Serviço de Empresas — enriquecimento (Hunter), sugestão e validação de domínio.
// Documentação e testes: repo kard-backend → notebooks/empresas.ipynb
import { api } from './ApiClient'
import { Empresa } from '../models/Empresa'

export class EmpresasService {
  constructor(cliente = api) {
    this.api = cliente
  }

  // GET /crm-cobranca/rh-empresas — empresas enriquecidas (agregado por CNPJ da
  // tabela rh_enriquecimento do módulo Snov). emails_rh traz só os já revelados.
  async listarEmpresas() {
    const data = await this.api.get('/crm-cobranca/rh-empresas')
    const lista = Array.isArray(data) ? data : (data?.data || [])
    return lista.map(Empresa.fromJson)
  }

  // POST /crm-cobranca/rh-preview — GRÁTIS (0 créditos Snov). Descobre o domínio
  // (BrasilAPI/Receita + contagem Snov) e salva os prospects sem e-mail.
  // forcar=true ignora o cache; dominio manda a busca por domínio (evita chute errado).
  enriquecerEmpresa(empresa, cnpj, forcar, dominio, cargosAlvo) {
    return this.api.post('/crm-cobranca/rh-preview', {
      empresa,
      cnpj,
      forcar: forcar === true,
      dominio: dominio || undefined,
      cargos_alvo: cargosAlvo && cargosAlvo.length ? cargosAlvo : undefined,
    })
  }

  // POST /crm-cobranca/rh-preview com so_descobrir=true — GRÁTIS (0 crédito Snov).
  // Fase 1: só descobre o domínio (Receita + contagem Snov) e devolve candidatos +
  // confiança (alta/baixa) + recomendação da IA — NÃO lista o RH (não gasta crédito).
  // Responde { cnpj, empresa, dominio_sugerido, confianca, dados, candidatos, ia }.
  async descobrirEmpresa(empresa, cnpj, dominio) {
    return this.api.post('/crm-cobranca/rh-preview', {
      empresa,
      cnpj,
      dominio: dominio || undefined,
      so_descobrir: true,
    })
  }

  // POST /crm-cobranca/empresa-salvar — cadastra (modo 'novo') ou edita (modo 'editar')
  // os dados da empresa em rh_enriquecimento. Cadastro cria 1 linha placeholder (manual)
  // que NÃO conta como contato; a edição atualiza os campos de todas as linhas do CNPJ.
  salvarEmpresa({ modo, cnpj, empresa, dominio, localizacao, porte }) {
    return this.api.post('/crm-cobranca/empresa-salvar', {
      modo: modo === 'editar' ? 'editar' : 'novo',
      cnpj: String(cnpj || '').replace(/\D/g, ''),
      empresa: empresa || '',
      dominio: dominio || '',
      localizacao: localizacao || '',
      porte: porte || '',
    })
  }

  // POST /crm-cobranca/empresa-ocultar — some/reexibe a empresa na lista (coluna `oculto`).
  // Não apaga nada: marca todas as linhas do CNPJ. oculto=false desfaz.
  ocultarEmpresa(cnpj, oculto = true) {
    return this.api.post('/crm-cobranca/empresa-ocultar', {
      cnpj: String(cnpj || '').replace(/\D/g, ''),
      oculto: oculto === true,
    })
  }

  // POST /crm-cobranca/rh-descobrir-rapido — descoberta RÁPIDA (pula ReceitaWS, então
  // dá pra rodar em paralelo). Robô acha o domínio (Snov máx 3 + RDAP + IA) e já lista
  // o RH (sem revelar e-mail = grátis). Responde a lista de prospects; o domínio
  // escolhido/score/selo-robô ficam salvos e aparecem no GET rh-empresas.
  async descobrirRapido(empresa, cnpj) {
    return this.api.post('/crm-cobranca/rh-descobrir-rapido', { empresa, cnpj: cnpj || undefined })
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

  // POST /crm-cobranca/validar — GRÁTIS. Validação de UMA empresa: CNPJ + candidatos + palpite da IA.
  validarDominio(empresa, cnpj) {
    return this.api.post('/crm-cobranca/validar', { empresa, cnpj: cnpj || '' })
  }

  // POST /crm-cobranca/validar-lote — inicia o lote no servidor (assíncrono).
  // Responde na hora com { lote_id, total, eta_segundos }; o n8n processa 1 empresa a cada
  // ~20s (respeita o limite de 3/min da ReceitaWS) e salva cada resultado na tabela `validacoes`.
  iniciarLote(loteId, registros) {
    return this.api.post('/crm-cobranca/validar-lote', { lote_id: loteId, registros })
  }

  // GET /crm-cobranca/validacoes?lote=X — lê os resultados já salvos de um lote.
  // `candidatos` vem como texto JSON → convertemos em lista.
  async lerLote(loteId) {
    const data = await this.api.get('/crm-cobranca/validacoes', { lote: loteId })
    const lista = Array.isArray(data) ? data : (data?.data || [])
    return lista.map((r) => ({ ...r, candidatos: Empresa.parseEmails(r.candidatos) }))
  }

  // POST /enriquecer-empresa — valida o domínio de UMA empresa via IA (workflow
  // post-enriquecer-dominio). O n8n salva o resultado na Data Table
  // `enriquecimento_dominio` e responde com o JSON da validação.
  // A tela controla a concorrência (até 10 chamadas em paralelo).
  async validarDominioIA(razaoSocial, cnpj, loteId) {
    const r = await this.api.post('/enriquecer-empresa', {
      razao_social: razaoSocial,
      cnpj: cnpj || '',
      lote_id: loteId || '',
    })
    // o webhook responde texto JSON; o ApiClient já parseia, mas garantimos objeto
    const dados = typeof r === 'string' ? JSON.parse(r) : (r || {})
    // emails vem como texto JSON (formato da tabela do n8n) — vira lista
    if (typeof dados.emails === 'string') {
      try { dados.emails = JSON.parse(dados.emails) } catch { dados.emails = [] }
    }
    return dados
  }

  // GET /lotes-dominio — histórico de todos os lotes já validados via IA
  // (agregado da Data Table `enriquecimento_dominio` no n8n).
  async listarLotesDominio() {
    const data = await this.api.get('/lotes-dominio', { format: 'json' })
    return Array.isArray(data) ? data : []
  }

  // URL de download do CSV completo de um lote (o n8n responde text/csv).
  urlCsvLote(loteId) {
    return `${this.api.base}/lote-dominio-csv?lote_id=${encodeURIComponent(loteId)}`
  }
}

export const empresasService = new EmpresasService()
