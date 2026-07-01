// Configuração das 3 telas "espelho" da Fase 1 (Claude2.md, seções 5.4 e 8).
//
// As 3 telas têm a MESMA estrutura (upload → conferência → disparo → acompanhamento),
// mudando só: nome, cor, remetente/inbox e formato de arquivo esperado (RF-22).
//   - Educacional: uma tela só, com seletor de modelo de e-mail.
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
  'educacional': {
    rota: 'educacional',
    titulo: 'Educacional',
    valorEtapa: 'Educacional', // valor gravado na Data Table (n8n)
    ordem: 1,
    cor: '#22C55E',
    chaveConfigInbox: 'inbox_educacional',
    formato: 'educacional',
    colunasEsperadas: COLUNAS_EDUCACIONAL,
    // Modelos de e-mail que a pessoa escolhe na hora de disparar (RF-20).
    // O texto de cada modelo mora no workflow "Disparar por Etapa" (n8n).
    modelos: [
      { id: 'lembrete', nome: 'Lembrete amigável', descricao: 'Tom leve, no/antes do vencimento.' },
      { id: 'reforco', nome: 'Segundo lembrete', descricao: 'Reforço um pouco mais direto.' },
    ],
  },
  'cobranca': {
    rota: 'cobranca',
    titulo: 'Cobrança',
    valorEtapa: 'Cobrança', // valor gravado na Data Table (n8n)
    ordem: 2,
    cor: '#F59E0B',
    // remetente próprio da Cobrança, responsável Emerson Correia (RF-22)
    chaveConfigInbox: 'inbox_cobranca',
    formato: 'cobranca',
    colunasEsperadas: COLUNAS_COBRANCA,
    modelos: [
      { id: 'padrao', nome: 'Cobrança padrão', descricao: 'Aviso de pendência financeira.' },
    ],
  },
}

// Ordem em que aparecem no menu e no funil do dashboard.
export const ETAPAS_ORDEM = ['educacional', 'cobranca']
