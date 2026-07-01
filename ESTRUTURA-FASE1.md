# Estrutura da Fase 1 (MVP) — front-end

Este documento explica o **esqueleto do front-end** montado para a Fase 1 do
`Claude2.md`. O back-end continua **inteiramente no n8n**; o React só chama os
webhooks. Nenhuma regra de negócio ou segredo mora no front.

## Mapa de arquivos

```
src/
├── main.jsx                  ← ponto de entrada (inalterado)
├── App.jsx                   ← roteia entre as telas (por hash na URL)
├── styles.css                ← estilos (verde Kard) + menu, seções, tabelas
├── hooks/
│   └── useHashRoute.js        ← mini-navegação em React puro (SEM router externo)
├── config/
│   └── etapas.js              ← config das 3 telas "espelho" + colunas de cada formato
├── api/
│   └── n8n.js                 ← todas as chamadas aos webhooks do n8n
├── componentes/
│   └── Layout.jsx             ← menu lateral + moldura das telas
└── telas/
    ├── Dashboard.jsx          ← funil por etapa (RF-30/32)
    ├── TelaEtapa.jsx          ← tela "espelho" reusada pelas 3 etapas
    ├── Contatos.jsx           ← base de contatos + enriquecimento Snov (RF-33..38)
    └── Configuracoes.jsx      ← inboxes por etapa + integrações (RF-22 / Admin)
```

> As **3 telas de etapa** (Educacional 1, Educacional 2, Cobrança) **não são
> arquivos separados**: são o mesmo `TelaEtapa.jsx` com uma config diferente
> (vinda de `config/etapas.js`). É o conceito de telas "espelho" do documento.

## Navegação

Sem `react-router` (para manter o front leve). A tela atual fica no *hash* da
URL: `#/dashboard`, `#/educacional-1`, `#/cobranca`, `#/contatos`, etc.
O `useHashRoute` só ouve mudanças nesse hash.

## O que já funciona (sem depender de nada novo no n8n)

- Navegação entre todas as telas.
- **Upload + conferência de CSV** na tela de etapa: lê o arquivo no navegador,
  detecta separador (`;` ou `,`), mostra prévia e valida as colunas esperadas
  (RF-27). Cobrança usa o formato do Anexo A; Educacional usa um formato
  provisório (Anexo B ainda não fornecido).
- **Dashboard, acompanhamento e Contatos** leem os contatos reais via o
  webhook que já existe (`GET /crm-cobranca/list`).

## O que está PENDENTE no n8n (marcado no código)

Cada função em `api/n8n.js` que ainda não tem workflow lança um erro começando
com `PENDENTE:` e a tela mostra um aviso âmbar (⏳). Falta criar no n8n:

| Função (front) | Webhook | RF | Status |
|---|---|---|---|
| `importarCarga` | `POST /crm-cobranca/importar` | RF-26 | ✅ workflow criado (Importar por Etapa) |
| `dispararEtapa` | `POST /crm-cobranca/disparar` | RF-19 | ✅ workflow criado (Disparar por Etapa) |
| `enriquecerContato` | `POST /crm-cobranca/enriquecer` | RF-36 | ⏳ pendente |
| `listarEventos` | `GET /crm-cobranca/eventos` | RF-40 | ⏳ pendente |

> Os workflows *Importar/Disparar por Etapa* precisam ser **importados e ativados**
> no n8n, com a chave da CyberTalk preenchida. Ver `n8n/docs/importar-disparar-etapa.md`.

## Pendências de dados/negócio (do documento)

- **Formato do Educacional (Anexo B):** ainda não temos o arquivo-exemplo; as
  colunas em `COLUNAS_EDUCACIONAL` são um placeholder.
- **Modelo de dados:** as etapas oficiais são **`Educacional 1` / `Educacional 2` / `Cobrança`**
  (campo `valorEtapa` em `config/etapas.js`). O front já usa esses valores. O n8n
  (Data Table + workflows) ainda grava os nomes antigos e **precisa ser migrado**
  para esses três (ver seção de migração abaixo).
- **Inbox por etapa (RF-22):** cadastro fica na tela Configurações, gravado pelo
  n8n. A captura de qual inbox enviou cada e-mail (RF-23) depende do webhook de eventos.

## Migração dos nomes de etapa (01/07/2026)

As etapas passaram a se chamar **`Educacional 1` / `Educacional 2` / `Cobrança`**
(antes: `Educativo` / `Cobrança 1` / `Cobrança 2`). Estado:

- **Front-end:** ✅ usa os nomes novos (`valorEtapa` em `config/etapas.js`).
- **Data Table (ao vivo):** ✅ os 5 registros de teste foram convertidos
  (Educativo→Educacional 1, Cobrança 1→Educacional 2, Cobrança 2→Cobrança).
- **ETL (JSON no repo):** ✅ passa a gravar `Educacional 1` em novas importações.
- **Workflows Régua e API:** ⏳ ainda têm a lógica antiga (régua automática +
  disparo manual na "Cobrança 2"). Com o novo fluxo **"cada tela dispara sozinha"**,
  eles serão **refeitos**: cada etapa terá seu próprio upload + disparo. Enquanto
  isso, com os dados já renomeados, a régua antiga não encontra mais `Educativo`
  e fica inerte (não dispara nada por engano).

**Próximo passo no n8n:** construir os 3 fluxos de disparo por etapa (substituindo
régua + disparo manual) e os webhooks `importar` / `enriquecer` / `eventos`.

## Como rodar

```bash
npm install
npm run dev
```

Ajuste `VITE_N8N_BASE` no `.env` (veja `.env.example`) para a URL `/webhook` do seu n8n.
