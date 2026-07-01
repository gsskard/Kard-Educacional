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
    ├── TelaEtapa.jsx          ← tela "espelho" reusada pelas etapas
    ├── Contatos.jsx           ← base de contatos + enriquecimento Snov (RF-33..38)
    └── Configuracoes.jsx      ← inboxes por etapa + integrações (RF-22 / Admin)
```

> As **telas de etapa** (Educacional, Cobrança) **não são arquivos separados**:
> são o mesmo `TelaEtapa.jsx` com uma config diferente (vinda de `config/etapas.js`).
> É o conceito de telas "espelho" do documento. O **Educacional** ficou numa tela
> só, com um **seletor de modelo** de e-mail (em vez de Educacional 1 e 2 separados).

## Navegação

Sem `react-router` (para manter o front leve). A tela atual fica no *hash* da
URL: `#/dashboard`, `#/educacional`, `#/cobranca`, `#/contatos`, etc.
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
- **Modelo de dados:** as etapas oficiais são **`Educacional` / `Cobrança`**
  (campo `valorEtapa` em `config/etapas.js`). O Educacional virou **uma tela só com
  seletor de modelo** de e-mail (em vez de Educacional 1 e 2).
- **Inbox por etapa (RF-22):** cadastro fica na tela Configurações, gravado pelo
  n8n. A captura de qual inbox enviou cada e-mail (RF-23) depende do webhook de eventos.

## Migração dos nomes de etapa (01/07/2026)

As etapas ficaram **`Educacional` / `Cobrança`** (antes: `Educativo` / `Cobrança 1`
/ `Cobrança 2`; passaram brevemente por `Educacional 1` / `Educacional 2`). Estado:

- **Front-end:** ✅ usa `Educacional` / `Cobrança` (`valorEtapa`), Educacional com modelos.
- **Data Table (ao vivo):** ✅ os 5 registros de teste convertidos (4 em `Educacional`, 1 em `Cobrança`).
- **ETL + Importar por Etapa (JSON):** ✅ gravam `Educacional` por padrão.
- **Disparar por Etapa (JSON):** ✅ escolhe o texto pelo `modelo` recebido.
- **Workflows Régua e API (antigos):** ⏳ Régua ficou inerte (não acha mais `Educativo`);
  a API ainda tem o disparo manual na "Cobrança 2" (não usado pelo fluxo novo).

**Próximo passo no n8n:** importar/ativar os 2 workflows novos com a chave da CyberTalk,
e depois os webhooks `enriquecer` / `eventos`.

## Como rodar

```bash
npm install
npm run dev
```

Ajuste `VITE_N8N_BASE` no `.env` (veja `.env.example`) para a URL `/webhook` do seu n8n.
