# Workflows de Etapa — Importar e Disparar

Dois workflows **reutilizáveis** que atendem as 3 telas espelho (Educacional 1,
Educacional 2, Cobrança). Cada tela chama passando a **sua etapa** — não há um
workflow por etapa, é a mesma lógica parametrizada.

Modelo de fluxo: **"cada tela dispara sozinha"** (upload por etapa → disparo por etapa),
sem régua automática entre etapas.

---

## 1. `IA - Cobrança - Importar por Etapa`

Arquivo: `workflows/ia-cobranca-importar-etapa.json`
Recebe a carga que o painel já leu e validou no navegador, e grava na Data Table.

- **Importar (POST)** — webhook `POST /crm-cobranca/importar`, CORS liberado.
  Corpo esperado: `{ "etapa": "Educacional 1", "registros": [ {..}, {..} ] }`.
- **Normalizar por etapa** (Code) — para cada registro: valida e-mail, converte
  `valor` (aceita `1.234,56`) e `vencimento` (aceita `dd/mm/aaaa`), e define
  `etapa` = a etapa recebida. Aceita tanto o formato educacional
  (`nome/email/empresa/valor/vencimento`) quanto o de Cobrança
  (`nome_cliente/empregador/valor_total_saldo/dt_vencimento`).
- **Upsert por etapa** (Data Table) — grava casando por `email` (atualiza se já
  existe, cria se não — mesmo dedupe do ETL).

> Responde na hora (`onReceived`); a gravação segue logo depois.

## 2. `IA - Cobrança - Disparar por Etapa`

Arquivo: `workflows/ia-cobranca-disparar-etapa.json`
Dispara o e-mail de **uma** etapa para todos os contatos dela.

- **Disparar (POST)** — webhook `POST /crm-cobranca/disparar`, CORS liberado.
  Corpo esperado: `{ "etapa": "Cobrança" }`.
- **Ler contatos da etapa** (Data Table) — busca todos com `etapa` igual à recebida.
- **Montar email da etapa** (Code) — monta assunto + HTML. Se a etapa começa com
  "Educacional", usa o texto amigável; senão, o texto firme de cobrança.
- **Disparar CyberTalk** (HTTP) — envia pela API da CyberTalk (mesmo padrão dos
  outros disparos; `Ignore SSL Issues` ligado).
- **Marcar envio** (Data Table) — grava `status_envio`, `cbtk_id` e `ultimo_envio`.

---

## 🔴 Antes de ativar: preencher a chave da CyberTalk

Como nos outros workflows, a chave foi **redigida** para `__CBTK_KEY__` no JSON
(nunca commitamos segredo). Ao importar no n8n, abra o nó **Disparar CyberTalk**
e coloque a chave real no header `x-cbtk-key`.

## Como usar (restaurar no n8n)

1. **Workflows → Import from File** → selecione cada um dos dois `.json`.
2. Confira o **Data Table** `cobranca` (ID `vwWbTJOAkbxCbhzw`); reaponte se for outra instância.
3. Preencha a chave da CyberTalk no nó de disparo.
4. **Ative** os dois workflows.

O painel (React) já chama esses endpoints: `importarCarga` (botão *Confirmar
importação*) e `dispararEtapa` (botão *Disparar* em cada tela de etapa).
