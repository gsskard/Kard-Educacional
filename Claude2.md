# Documento de Requisitos — Sistema de ETL, Enriquecimento de Contatos e Disparo de Comunicações

**Versão:** 0.1 (rascunho para validação)
**Data:** 01/07/2026
**Autor:** (preencher)
**Stakeholders identificados:** Kleber Alexandre (chefe da equipe), Kleber Alvarez (extração/ETL), áreas de disparo, Emerson Correia (etapa de Cobrança)

> Este documento consolida os requisitos levantados junto aos usuários. Itens marcados com **[A VALIDAR]** dependem de confirmação de negócio ou de acesso técnico ainda pendente.

---

## 1. Objetivo e visão geral

Construir um sistema que **automatize o ciclo de comunicação com clientes** de um fluxo de aftercare/cobrança, hoje operado de forma manual e apoiado em planilhas Excel. O sistema deve:

1. **Extrair (ETL)** quais clientes entram no fluxo, a partir de mais de uma fonte de dados.
2. **Enriquecer** esses registros com dados de contato (e-mail corporativo, domínio correto, dados de LinkedIn).
3. **Persistir** contatos e histórico em banco de dados que **retroalimenta** o próprio sistema.
4. **Disparar** comunicações em etapas (Educacional 1, Educacional 2, Cobrança) e registrar o resultado em um CRM.

O objetivo de negócio é reduzir trabalho manual, padronizar a régua de comunicação e ter rastreabilidade de ponta a ponta (quem entrou no fluxo → qual contato foi usado → o que foi disparado → qual foi o retorno).

---

## 2. Situação atual (as-is)

| Etapa | Como é feito hoje | Dor / limitação |
|---|---|---|
| Seleção de clientes | Colaborador (Kleber) roda algoritmo que consome a API do Kardbank (`backoffice-proxy`) | Depende de uma pessoa; execução manual |
| Complemento de dados | Sistema **KONECT SCD** → *operacional / integração / remessa de arquivo de parcela em aberto* | **Sem rota de API**; arquivo salvo em rede interna, **sem acesso atual [A VALIDAR]** |
| Consolidação | Geração de um Excel final | Planilha manual, sujeita a erro e sem versionamento |
| Distribuição | Excel enviado às demais áreas | Processo manual, sem trilha de auditoria |
| Prospecção de contatos | Snov.io (melhor resultado vs. Apollo.io e Vibe Prospecting) | Domínios incorretos (ex.: Carrefour vindo como `.fr`) |
| Disparo | Cybertalk | Definição de múltiplas inboxes ainda em aberto |

---

## 3. Escopo

### 3.1 Dentro do escopo
- ETL de seleção de clientes a partir da API Kardbank e do arquivo do Konect.
- Enriquecimento de contatos via API da Snov, com validação de domínio.
- Banco de dados de contatos e histórico (retroalimentação).
- Integração com Cybertalk para disparo em 3 etapas.
- Telas de acompanhamento (CRM / painel operacional).

### 3.2 Fora do escopo (por ora) **[A VALIDAR]**
- Criação de conteúdo/copy dos e-mails (assume-se que os templates são fornecidos pelas áreas).
- Ferramenta de discagem/telefonia.
- Integração com WhatsApp/SMS (pode virar fase 2).

### 3.3 Faseamento

Decisão de negócio: começar pelo caminho que entrega valor sem depender de acessos ainda pendentes.

- **Fase 1 (MVP):** **upload manual** dos arquivos (sem ETL automatizado) + as **3 telas de etapa** (Educacional 1, Educacional 2, Cobrança) + disparo via Cybertalk + persistência/retroalimentação. Justificativa: hoje os arquivos passam por ~20 áreas e a origem dos dados é difícil de rastrear — automatizar a extração agora atrasaria a entrega.
- **Fase 2:** ETL automatizado (API Kardbank + arquivo Konect) substituindo/complementando o upload manual, quando os acessos forem liberados. Os requisitos RF-01 a RF-08 permanecem válidos, porém **reclassificados para Fase 2**.

---

## 4. Atores e perfis de usuário

- **Operador de extração** — dispara/monitora o ETL (papel atual do Kleber).
- **Analista de disparo** — acompanha campanhas e resultados por etapa.
- **Gestor/Cobrança** — visão consolidada, indicadores e exceções (gestão da equipe: Kleber Alexandre).
- **Administrador** — gerencia credenciais de integração, inboxes e regras.

---

## 5. Requisitos funcionais

Nomenclatura: **RF-xx**. Prioridade: (M) Must / (S) Should / (C) Could.

### 5.1 Módulo ETL — seleção de clientes **(Fase 2)**

> Na Fase 1 (MVP) a entrada de dados é feita por **upload manual** (ver módulo 5.6). Os requisitos abaixo permanecem válidos e serão implementados na Fase 2, quando os acessos forem liberados.

- **RF-01 (M)** — O sistema deve autenticar e consumir a API do Kardbank:
  - `BASE_URL = https://prd.api.kardbank.com.br/backoffice-proxy`
  - `LOGIN_URL = {BASE_URL}/auth/login`
  - `LIST_URL = {BASE_URL}/backoffice/aftercare/contracts/list`
- **RF-02 (M)** — Deve armazenar as credenciais/token de forma segura (cofre de segredos, nunca em planilha ou código). **[A VALIDAR: método de auth — usuário/senha, client credentials?]**
- **RF-03 (M)** — Deve tratar paginação, rate limit e reexecução idempotente (rodar de novo não duplica clientes).
- **RF-04 (M)** — Deve ingerir os dados do **Konect SCD** (remessa de parcela em aberto). Como **não há API**, prever conector de arquivo:
  - Opção A: leitura automatizada do arquivo depositado na rede interna (requer acesso ao compartilhamento). **[A VALIDAR: liberar acesso]**
  - Opção B (fallback): upload manual do arquivo pela tela, com validação de layout — layout de referência documentado no **Anexo A** (arquivo sintético usado hoje pela Cobrança).
- **RF-05 (M)** — Deve **cruzar/consolidar** as duas fontes em uma base única de "clientes no fluxo", aplicando regras de negócio de elegibilidade. **[A VALIDAR: quais regras definem quem entra no fluxo?]**
- **RF-06 (S)** — Deve permitir agendar a execução do ETL (ex.: diária) além da execução manual.
- **RF-07 (S)** — Deve manter log de cada execução (quantos registros entraram, erros, origem).
- **RF-08 (C)** — Deve permitir exportar o resultado em Excel, mantendo compatibilidade com o processo atual durante a transição.

### 5.2 Módulo de enriquecimento de contatos (Snov)

> Acionamento: na Fase 1, o enriquecimento é disparado **pela tela de Contatos** (botão individual ou em lote — RF-36), e não por um processo automático. Não depende dos acessos pendentes (Kardbank/Konect), por isso já entra na Fase 1.

- **RF-09 (M)** — Deve integrar a **API da Snov** para buscar dados de contato automaticamente a partir do nome/empresa do cliente.
- **RF-10 (M)** — Deve **verificar o domínio** da empresa antes de usar. Regra de negócio: quando o domínio retornado for internacional/incorreto (ex.: Carrefour → `.fr`), o sistema deve:
  - buscar domínios alternativos (filiais/país correto, ex.: `.com.br`);
  - registrar todos os domínios encontrados;
  - aplicar critério de preferência (ex.: priorizar domínio nacional / do CNPJ do cliente). **[A VALIDAR: regra de priorização de domínio]**
- **RF-11 (S)** — Deve marcar o **nível de confiança** do e-mail encontrado (verificado / provável / não encontrado).
- **RF-12 (S)** — Deve evitar reconsultar contatos já enriquecidos recentemente (usar cache do banco → economia de créditos Snov).
- **RF-13 (C)** — Deve permitir revisão manual de contatos de baixa confiança antes do disparo.

### 5.3 Módulo de persistência (banco de dados)

- **RF-14 (M)** — Todo contato gerado deve ser **salvo em banco de dados** (proposta: RDS existente). **[A VALIDAR: instância/engine — Postgres, MySQL?]**
- **RF-15 (M)** — O banco deve **retroalimentar o sistema**: contatos já conhecidos são reaproveitados em execuções futuras, sem reprocessar do zero.
- **RF-16 (M)** — Deve manter histórico por cliente/contato: origem do dado, data, campanhas em que participou, status de cada etapa.
- **RF-17 (S)** — Deve tratar deduplicação (mesmo cliente/empresa vindo de fontes diferentes).
- **RF-18 (S)** — Deve respeitar LGPD: base legal do tratamento, retenção e trilha de acesso a dados pessoais. **[A VALIDAR com jurídico]**

### 5.4 Módulo de disparo (Cybertalk) e CRM

- **RF-19 (M)** — Deve integrar com o **Cybertalk** para disparo de e-mail.
- **RF-20 (M)** — Deve organizar a operação em **3 telas independentes ("espelho"), uma por etapa**: Educacional 1, Educacional 2 e Cobrança. As telas têm a mesma estrutura (upload → conferência → disparo → acompanhamento), mas operam de forma isolada.
- **RF-21 (M)** — A régua é **sequencial**: **Educacional 1 → Educacional 2 → Cobrança**. Um cliente só deve chegar à etapa de Cobrança após as etapas educacionais. **[A VALIDAR: intervalos e gatilhos de avanço entre etapas]**
- **RF-22 (M)** — Cada bloco de etapa usa **remetente (inbox) e formato de arquivo próprios**:
  - **Educacional 1 e 2:** compartilham um mesmo e-mail remetente e um mesmo formato de arquivo (distintos dos da Cobrança). **[A VALIDAR: Ed1 e Ed2 usam o mesmo arquivo ou apenas o mesmo formato?]**
  - **Cobrança:** e-mail remetente próprio e formato próprio (layout do **Anexo A**), sob responsabilidade de Emerson Correia.
- **RF-23 (M)** — O sistema deve **registrar e exibir no CRM por qual inbox/remetente cada mensagem saiu**, permitindo ao usuário verificar a origem do envio por etapa.
- **RF-24 (S)** — Deve registrar eventos de retorno (enviado, entregue, aberto, respondido, bounce) por contato e por etapa.
- **RF-25 (S)** — Deve controlar supressão/opt-out (não disparar para quem pediu descadastro ou já quitou). **[A VALIDAR]**

### 5.5 Módulo de upload manual **(Fase 1 — MVP)**

- **RF-26 (M)** — Cada tela de etapa deve permitir **upload do arquivo** correspondente (Educacional ou Cobrança), com validação de layout conforme o formato daquela etapa (Cobrança = Anexo A).
- **RF-27 (M)** — Deve exibir **pré-visualização e resumo da carga** (nº de registros, campos obrigatórios ausentes, erros de formato) antes de confirmar.
- **RF-28 (M)** — Deve aplicar as regras de importação/qualidade (ver Anexo A.2: telefones/CEP como texto, validação de CPF, deduplicação).
- **RF-29 (S)** — Deve registrar quem subiu o arquivo, quando e qual etapa, para auditoria.

### 5.6 Painel / CRM (visão do usuário)

- **RF-30 (M)** — Tela consolidada mostrando cliente → contato → etapa atual → status do disparo → inbox de origem.
- **RF-31 (S)** — Filtros por etapa, período, inbox, status e origem do dado.
- **RF-32 (S)** — Indicadores (volume por etapa, taxa de contato encontrado, taxa de abertura/resposta por etapa).

### 5.7 Módulo de Contatos — acompanhamento e enriquecimento **(Fase 1)**

Tela central onde ficam os contatos salvos, o acompanhamento dos e-mails e a ação de enriquecimento. Concentra a "casa" dos dados que retroalimentam o sistema.

- **RF-33 (M)** — Deve haver uma **tela de Contatos** listando todos os contatos salvos no banco (retroalimentação — RF-15), com busca e filtros.
- **RF-34 (M)** — Para cada contato, exibir o **acompanhamento dos e-mails**: etapa (Educacional 1/2, Cobrança), status (enviado, entregue, aberto, respondido, bounce) e **por qual inbox/remetente** cada mensagem saiu.
- **RF-35 (M)** — Deve permitir **visualizar por inbox**: ver quais inboxes/remetentes existem e o que saiu por cada uma (agrupamento por remetente).
- **RF-36 (M)** — O **enriquecimento via Snov** deve ser uma **ação dentro da tela de Contatos** (não uma tela separada), disponível:
  - **por contato** (botão "enriquecer") e
  - **em lote** (enriquecer os contatos selecionados),
  gravando o resultado **no próprio contato** (enrich-in-place), para reaproveitamento futuro.
- **RF-37 (M)** — O enriquecimento deve aplicar a **verificação de domínio** (RF-10) — provavelmente voltada ao contato da **empresa/empregador**, dado que o e-mail do cliente já vem no arquivo (ver Anexo A.3). **[A VALIDAR: alvo do enriquecimento = empresa ou cliente?]**
- **RF-38 (S)** — Exibir o **status de enriquecimento** por contato (enriquecido em [data], nível de confiança, domínios encontrados) e **evitar reconsulta** quando já enriquecido recentemente (cache — RF-12), para economizar créditos da Snov.

### 5.8 Módulo de Analytics e rastreamento de e-mail

Rastreamento de abertura/clique e uma tela de indicadores para acompanhar o desempenho por etapa e por inbox.

> **Faseamento:** a **tela de Analytics (RF-41) fica para a Fase 2.** A **captura e persistência dos eventos (RF-39/RF-40) permanece na Fase 1**, porque a tela de Contatos (RF-34) já depende do status dos disparos e porque não capturar desde o início faz perder o histórico dos envios anteriores.

- **RF-39 (M — Fase 1)** — O rastreamento é habilitado **na plataforma de envio (Cybertalk)**, por campanha/inbox: **open tracking** (pixel) e **click tracking** (reescrita de links). O sistema não gera os eventos; ele os consome.
- **RF-40 (M — Fase 1)** — Deve **consumir os eventos do Cybertalk** (via webhook ou API de relatórios) — entregue, aberto, clicado, respondido, bounce, descadastro — e **persistir por contato / etapa / inbox**, alimentando a tela de Contatos (RF-34) e, depois, a de Analytics. **[A VALIDAR: o Cybertalk expõe webhook/API de eventos por destinatário?]**
- **RF-41 (S — Fase 2)** — Deve haver uma **tela de Analytics** com indicadores filtráveis por etapa (Educacional 1/2, Cobrança), inbox e período: enviados, entregues, taxa de abertura, taxa de clique, respostas, bounces e descadastros. Para a Cobrança, incluir conversão/pagamento quando o dado estiver disponível. **[A VALIDAR: origem do dado de pagamento]**
- **RF-42 (S — Fase 2)** — Deve tratar as **limitações do open tracking**: bloqueio de imagens (Gmail/Outlook) e pré-carregamento do Apple Mail Privacy Protection inflam/ocultam aberturas. A abertura deve ser exibida como métrica **aproximada**; priorizar **clique e resposta** como sinais confiáveis.
- **RF-43 (S — Fase 1)** — Deve haver **pré-requisitos de entregabilidade** configurados nos remetentes: **SPF, DKIM e DMARC** e um **domínio de rastreamento próprio** alinhado ao remetente (também protege a reputação das inboxes — ver seção 9).
- **RF-44 (M)** — O rastreamento comportamental de pessoas identificáveis deve estar coberto pela **base legal LGPD** e pelo aviso de privacidade (ver RNF-02 / RF-18).

---

## 6. Requisitos não funcionais

- **RNF-01 — Segurança:** segredos (Kardbank, Snov, Cybertalk, RDS) em cofre; acesso por perfil; criptografia em trânsito e em repouso.
- **RNF-02 — Privacidade/LGPD:** minimização de dados, trilha de auditoria, política de retenção.
- **RNF-03 — Confiabilidade:** ETL idempotente, com retry e alertas de falha.
- **RNF-04 — Rastreabilidade:** log ponta a ponta (origem do dado → disparo → retorno).
- **RNF-05 — Custo:** minimizar chamadas pagas à Snov via cache/reuso no banco.
- **RNF-06 — Escalabilidade:** processar lotes crescentes sem retrabalho manual.
- **RNF-07 — Observabilidade:** dashboards de execução e status de integrações.

---

## 7. Arquitetura sugerida (proposta)

```
[API Kardbank] ─┐
                ├─► [Serviço ETL] ─► [Base consolidada: clientes no fluxo]
[Arquivo Konect]┘                          │
                                           ▼
                                  [Enriquecimento Snov]
                                  (validação de domínio)
                                           │
                                           ▼
                                  [Banco de dados / RDS]  ◄── retroalimentação
                                           │
                                           ▼
                              [Orquestrador de régua]
                        (Educacional 1 / 2 / Cobrança)
                                           │
                                           ▼
                                     [Cybertalk] ─► inboxes
                                           │
                                           ▼
                                [CRM / Painel de acompanhamento]
```

**Notas de arquitetura:**
- Camada de **conectores** isolada por fonte (Kardbank, Konect, Snov, Cybertalk) — facilita trocar/adicionar fornecedor sem reescrever o núcleo.
- Konect como **conector de arquivo** (não API) — o restante do sistema não deve "saber" que é arquivo, só consome a base consolidada.
- Fila/agendador para o ETL e para a régua de disparo.

---

## 8. Telas e configurações sugeridas

O núcleo da Fase 1 são **3 telas "espelho", uma por etapa**, com estrutura idêntica e operação isolada. Cada tela conta com as mesmas seções:

- **Upload do arquivo** da etapa (formato próprio; Cobrança = Anexo A) + validação e pré-visualização.
- **Conferência da carga** (registros válidos, pendências, duplicados).
- **Configuração do remetente/inbox** daquela etapa (Educacional usa um remetente; Cobrança usa outro).
- **Disparo** via Cybertalk.
- **Acompanhamento** dos envios e retornos da etapa, com a inbox de origem visível.

As 3 telas:

1. **Tela — Educacional 1** (remetente e formato educacionais).
2. **Tela — Educacional 2** (mesmo remetente/formato do Educacional 1).
3. **Tela — Cobrança** (remetente próprio; formato do Anexo A; responsável Emerson Correia).

Telas de apoio:

4. **Dashboard / Home** — funil por etapa, contadores, status dos disparos.
5. **Contatos** — lista de contatos salvos (retroalimentação); por contato, acompanhamento dos e-mails (etapa, status, inbox de origem); **botão de enriquecimento Snov** individual e em lote (enrich-in-place); visão por inbox/remetente.
6. **Detalhe do cliente** — timeline: carga → contato → disparos por etapa → retornos → inbox de origem.
7. **Configurações / Admin** — credenciais das integrações (Cybertalk, Snov), cadastro de inboxes por etapa, regras de importação/validação, usuários e perfis.

> **Fase 2** acrescenta: tela de **Analytics** (indicadores por etapa/inbox/período — os eventos já são capturados na Fase 1), tela de **Execuções de ETL** (Kardbank/Konect), **Base consolidada de clientes no fluxo** e revisão de domínios do enriquecimento.

---

## 9. Sugestões e melhorias (recomendações)

Além do que foi pedido, alguns pontos que valem discussão:

- **Substituir o Excel por API/banco o quanto antes.** Manter exportação em Excel só como ponte na transição (RF-08) reduz erro e dependência de pessoa.
- **Konect sem API:** dado que não há rota, priorizar o pedido de acesso ao compartilhamento de rede para automatizar a leitura. Enquanto isso, o upload manual (RF-04 opção B) destrava o projeto sem depender desse acesso.
- **Cache de enriquecimento:** guardar no RDS o resultado da Snov por empresa/domínio evita pagar de novo pelo mesmo dado e acelera execuções.
- **Regra de domínio como configuração, não código:** a lógica "preferir domínio nacional / do CNPJ" deve ser parametrizável, porque casos como o Carrefour vão se repetir com padrões diferentes.
- **Governança de inbox:** se forem múltiplas, definir critério de rotação/limite diário por inbox para proteger reputação de envio (deliverability) — importante para não cair em spam nas etapas de cobrança.
- **Consentimento/opt-out centralizado:** uma única lista de supressão evita disparar para quem quitou ou pediu para sair — reduz risco jurídico e reclamação.
- **Métricas por etapa desde o dia 1:** medir taxa de contato encontrado e de resposta em Educacional 1/2 vs. Cobrança ajuda a justificar o projeto e ajustar a régua.

---

## 10. Pendências e perguntas em aberto **[A VALIDAR]**

1. Quais são exatamente as **regras de elegibilidade** que definem quem entra no fluxo?
2. Qual o **método de autenticação** da API Kardbank e limites de uso?
3. É possível **liberar acesso à rede** onde o Konect salva o arquivo? Qual o layout do arquivo?
4. Qual **engine/instância de RDS** usar e qual o modelo de dados esperado?
5. **Haverá múltiplas inboxes** no Cybertalk? Quantas e com qual critério?
6. Quais os **intervalos e gatilhos** entre Educacional 1, Educacional 2 e Cobrança?
7. Quem fornece os **templates de e-mail** de cada etapa?
8. Há requisitos de **LGPD/retenção** específicos definidos pelo jurídico?
9. O **Cybertalk expõe webhook ou API de eventos** por destinatário (aberto, clicado, respondido, bounce)? É o que viabiliza as telas de Contatos e Analytics.
10. Os remetentes já têm **SPF/DKIM/DMARC** e domínio de rastreamento configurados?
11. Para o Analytics de Cobrança, de onde vem o **dado de pagamento/quitação** (para medir conversão)?

---

## 11. Glossário

- **ETL:** Extração, Transformação e Carga de dados.
- **Aftercare:** acompanhamento pós-contratação / pós-venda (aqui, ligado a cobrança).
- **Enriquecimento:** complementar o registro do cliente com dados de contato externos.
- **Régua de comunicação:** sequência ordenada de disparos ao longo do tempo.
- **Inbox:** caixa/remetente de envio de e-mail.
- **Retroalimentação:** o resultado do processo volta ao banco e melhora as próximas execuções.

---

## Anexo A — Layout do arquivo de entrada da Cobrança

Layout de referência com base no arquivo `SINTETICO_COBRCOBCT220626.xlsx`, usado atualmente pela área de Cobrança para **subir dados no sistema**. É, portanto, um **arquivo de entrada** do fluxo.

> Este é o formato da **etapa de Cobrança**. As etapas **Educacional 1 e 2** usam um **formato de arquivo diferente**, ainda não fornecido — quando disponível, será documentado em um **Anexo B** análogo. **[A VALIDAR: obter arquivo-exemplo do Educacional]**

**Características gerais do exemplo:**
- Aba única, **993 registros × 19 colunas**.
- Lote segmentado por **convênio** (`cd_convenio` = 40000, valor único no arquivo) e por **empregador** (um único empregador no arquivo). Indica que cada arquivo tende a representar um convênio/empregador.
- Alto volume de **dados pessoais** (CPF, nome, telefone, endereço, e-mail) → tratamento sob LGPD (ver RNF-02 / RF-18).

### A.1 Dicionário de dados

| # | Campo | Tipo (esperado) | Preenchimento no exemplo | Descrição | Obs. |
|---|---|---|---|---|---|
| 1 | `contrato` | Texto | 100% | Identificador do contrato | Chave candidata |
| 2 | `cpf` | Texto | 100% | CPF do cliente | **Dado pessoal**; manter como texto |
| 3 | `matricula_cliente` | Texto | 100% | Matrícula do cliente no convênio/empregador | |
| 4 | `qtd_parcelas_aberto` | Inteiro | 100% | Nº de parcelas em aberto | Faixa observada: 1 a 6 |
| 5 | `valor_total_saldo` | Decimal | 100% | Saldo devedor total (R$) | Ex.: min ~3,9 / máx ~6.758 |
| 6 | `dt_vencimento` | Data | 100% | Data de vencimento | Padronizar formato de data |
| 7 | `maior_atraso` | Inteiro | 100% | Maior atraso, em dias | Faixa observada: 30 a 181 |
| 8 | `cd_convenio` | Inteiro | 100% | Código do convênio | Único no exemplo (40000) |
| 9 | `empregador` | Texto | 100% | Nome do empregador/órgão | Único no exemplo |
| 10 | `nome_cliente` | Texto | 100% | Nome do cliente | **Dado pessoal** |
| 11 | `celular` | Texto | ~99,8% | Celular principal | ⚠ vem como número — ver A.2 |
| 12 | `endereco_cliente` | Texto | 100% | Logradouro/endereço | **Dado pessoal** |
| 13 | `Bairro` | Texto | 100% | Bairro | |
| 14 | `cidade` | Texto | 100% | Cidade | |
| 15 | `estado` | Texto | 100% | UF | Concentração em SP, RJ, MG, PR, RS |
| 16 | `cep` | Texto | 100% | CEP | ⚠ vem como número — ver A.2 |
| 17 | `email` | Texto | 100% | E-mail do cliente | **Dado pessoal** |
| 18 | `CEL_2` | Texto | 0% | Segundo celular | ⚠ vazio em 100% — ver A.2 |
| 19 | `faixa_atraso` | Texto | 100% | Faixa de atraso (bucket) | Ex.: "A - 1 a 30", "D - 91 a 120" |

### A.2 Regras de importação e qualidade de dados

- **RF-A1 (M)** — Campos de telefone (`celular`, `CEL_2`) e `cep` devem ser importados/armazenados como **texto**. No arquivo atual vêm como número, o que causa risco de perda de zero à esquerda, sufixo ".0" e notação científica.
- **RF-A2 (M)** — Validar `cpf` (formato/dígitos) e normalizar (só dígitos), tratando-o sempre como texto.
- **RF-A3 (S)** — Padronizar `dt_vencimento` para um formato único de data na carga.
- **RF-A4 (S)** — Mapear a **lista completa de faixas válidas** em `faixa_atraso`. No exemplo aparecem A, B, D, E e G (C e F ausentes na amostra) — confirmar o conjunto oficial. **[A VALIDAR]**
- **RF-A5 (S)** — Definir o tratamento de `CEL_2` (vazio em 100% do exemplo): manter, remover ou identificar a origem que deveria preenchê-lo. **[A VALIDAR]**
- **RF-A6 (S)** — Definir a **chave de deduplicação** (candidatas: `contrato`, ou `cpf` + `cd_convenio`) para o cruzamento com a base e a retroalimentação (RF-15/RF-17).

### A.3 Ponto de atenção sobre o enriquecimento (Snov)

No arquivo, o campo `email` do **cliente** vem 100% preenchido. Isso sugere que o enriquecimento via Snov (RF-09/RF-10) provavelmente se destina a encontrar contatos da **empresa/empregador** (ex.: caso Carrefour com domínio `.fr`), e **não** o e-mail do próprio devedor. Vale confirmar explicitamente o papel do Snov versus o e-mail já existente no arquivo, para não duplicar esforço nem gastar créditos à toa. **[A VALIDAR]**