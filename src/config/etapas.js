// Configuração das 3 telas "espelho" da Fase 1 (Claude2.md, seções 5.4 e 8).
//
// As 3 telas têm a MESMA estrutura (upload → conferência → disparo → acompanhamento),
// mudando só: nome, cor, remetente/inbox e formato de arquivo esperado (RF-22).
//   - Educacional 1 e 2: compartilham remetente e formato educacionais.
//   - Cobrança: remetente próprio e formato do Anexo A.
//
// Os IDs de inbox/remetente da CyberTalk NÃO ficam aqui hardcoded — eles vêm
// da tela de Configurações (RF-22 / módulo Admin). Aqui deixamos só o "slot"
// (chaveConfig) que aponta para onde essa config será lida depois.

// Formato do arquivo de Cobrança (Anexo A do Claude2.md).
export const COLUNAS_COBRANCA = [
  'contrato', 'cpf', 'matricula_cliente', 'qtd_parcelas_aberto', 'valor_total_saldo',
  'dt_vencimento', 'maior_atraso', 'cd_convenio', 'empregador', 'nome_cliente',
  'celular', 'endereco_cliente', 'Bairro', 'cidade', 'estado', 'cep', 'email',
  'CEL_2', 'faixa_atraso',
]

// Formato do arquivo Educacional (Anexo B — ainda não fornecido, [A VALIDAR]).
// Placeholder mínimo até recebermos o arquivo-exemplo do Educacional.
export const COLUNAS_EDUCACIONAL = [
  'nome', 'email', 'empresa', 'valor', 'vencimento',
]

export const ETAPAS = {
  'educacional-1': {
    rota: 'educacional-1',
    titulo: 'Educacional 1',
    valorEtapa: 'Educacional 1', // valor gravado na Data Table (n8n)
    ordem: 1,
    cor: '#639922',
    // remetente/formato educacionais (compartilhados com Educacional 2 — RF-22)
    chaveConfigInbox: 'inbox_educacional',
    formato: 'educacional',
    colunasEsperadas: COLUNAS_EDUCACIONAL,
    // avanço para a próxima etapa
    proxima: 'educacional-2',
    avancoAutomatico: true, // Educacional 1 → 2 por data (a régua do n8n decide)
  },
  'educacional-2': {
    rota: 'educacional-2',
    titulo: 'Educacional 2',
    valorEtapa: 'Educacional 2', // valor gravado na Data Table (n8n)
    ordem: 2,
    cor: '#3B6D11',
    chaveConfigInbox: 'inbox_educacional',
    formato: 'educacional',
    colunasEsperadas: COLUNAS_EDUCACIONAL,
    proxima: 'cobranca',
    avancoAutomatico: true, // Educacional 2 → Cobrança por data
  },
  'cobranca': {
    rota: 'cobranca',
    titulo: 'Cobrança',
    valorEtapa: 'Cobrança', // valor gravado na Data Table (n8n)
    ordem: 3,
    cor: '#BA7517',
    // remetente próprio da Cobrança, responsável Emerson Correia (RF-22)
    chaveConfigInbox: 'inbox_cobranca',
    formato: 'cobranca',
    colunasEsperadas: COLUNAS_COBRANCA,
    proxima: null, // etapa final
    avancoAutomatico: false,
  },
}

// Ordem em que aparecem no menu e no funil do dashboard.
export const ETAPAS_ORDEM = ['educacional-1', 'educacional-2', 'cobranca']
