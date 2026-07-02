# Kard CRM / Backoffice — Arquitetura e Memória do Projeto

> **Para quem lê (humano ou outro chat/IA):** este documento é a fonte da verdade do
> estado atual do sistema. Foi escrito para que qualquer sessão futura entenda o que
> existe, onde está e por quê, sem precisar redescobrir tudo. Atualize-o quando mexer
> no sistema. Última atualização relevante: 01/07/2026.

---

## 1. Visão geral

Sistema de **régua de comunicação e enriquecimento de contatos** para cobrança/aftercare.
Dois blocos:

- **Front-end** — painel React + Vite (pasta deste repositório), no visual do
  **"Portal Super Crédito" da Kard** (sidebar branca, verde Kard, cards arredondados).
  Deploy na **Vercel** a partir do GitHub (`main`).
- **Back-end** — **tudo no n8n** (workflows + Data Tables + credenciais). O front só
  consome os webhooks. **Nenhuma regra de negócio ou segredo vive no front.**

```
[React/Vercel]  --HTTP-->  [Webhooks n8n]  -->  [Data Tables + Hunter + Redis + CyberTalk]
```

### URLs e repositório
- **Produção (front):** https://kard-educacional.vercel.app
  (⚠️ URLs com hash no meio, tipo `...-2d4wpgv5p-...`, são deploys **congelados** antigos — não use.)
- **GitHub:** `github.com/gsskard/Kard-Educacional` (branch `main` → deploy automático).
- **n8n:** https://n8n.srv1759869.hstgr.cloud — projeto `9lO2n1wkfEvQlTP4`.
- Git e Node estão instalados em local **não-padrão** na máquina da Gabriella
  (git em `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`); Node não está no PATH do terminal.

---

## 2. Etapas / régua

Etapas oficiais (valor gravado no campo `etapa`): **`Educacional`** e **`Cobrança`**.
(Histórico: já foram `Educativo/Cobrança 1/Cobrança 2`, depois `Educacional 1/2/Cobrança`.)

- O **Educacional** é **uma tela só** com **seletor de modelo** de e-mail
  (`lembrete` = amigável, `reforco` = segundo lembrete).
- **Cobrança** é tela própria (modelo `padrao`).
- Modelo de fluxo: **"cada tela dispara sozinha"** (upload por etapa → disparo por
  etapa). Não há régua automática entre etapas.

---

## 3. Front-end (React + Vite)

Sem `react-router` (navegação por **hash**, em React puro) e **sem dependências novas**
sem pedir. Roda com `npm install` + `npm run dev`.

### Mapa de arquivos (`src/`)
| Arquivo | Papel |
|---|---|
| `App.jsx` | Roteia por hash (`#/dashboard`, `#/educacional`, `#/cobranca`, `#/contatos`, `#/empresas`, `#/configuracoes`) |
| `hooks/useHashRoute.js` | Mini-roteador por hash |
| `config/etapas.js` | Config das etapas (Educacional/Cobrança), modelos de e-mail, colunas esperadas dos arquivos |
| `api/n8n.js` | **Todas** as chamadas aos webhooks do n8n (única camada de rede) |
| `componentes/Layout.jsx` | Sidebar (logo Kard + "Backoffice") + topo com usuário e breadcrumb |
| `componentes/CompanyLogo.jsx` | Logo da empresa por domínio (fontes em cascata, ver §7) |
| `componentes/PillStatus.jsx` | Selo colorido de status de envio |
| `telas/Dashboard.jsx` | Funil por etapa |
| `telas/TelaEtapa.jsx` | Tela "espelho" reusada por Educacional e Cobrança (upload→conferência→disparo→acompanhamento) |
| `telas/Contatos.jsx` | Contatos (tabela `cobranca`) **cruzados** com Empresas (logo + status de enriquecimento) |
| `telas/Empresas.jsx` | Empresas enriquecidas (cartões + tabela Excel), seletor de domínio, enriquecer/reenriquecer/enriquecer-tudo |
| `telas/Configuracoes.jsx` | Inboxes por etapa + integrações (esqueleto) |
| `styles.css` | Tema do portal + responsividade + animações |

### Funções em `api/n8n.js` (→ webhook)
| Função | Método/rota | Observação |
|---|---|---|
| `listarContatos()` | GET `/crm-cobranca/list` | tabela cobranca |
| `moverContato(id, etapa)` | POST `/crm-cobranca/update` | move etapa |
| `importarCarga(etapa, registros)` | POST `/crm-cobranca/importar` | grava contatos |
| `dispararEtapa(etapa, modelo)` | POST `/crm-cobranca/disparar` | dispara e-mail via CyberTalk |
| `listarEmpresas()` | GET `/crm-cobranca/empresas` | parseia `emails_rh` (JSON) em lista |
| `enriquecerEmpresa(empresa, cnpj, forcar, dominio)` | POST `/crm-cobranca/enriquecer` | ver §6 |
| `sugerirDominios(nome)` | GET `/crm-cobranca/dominios` | lista de domínios candidatos (ver §6.3) |
| `validarDominio(empresa, cnpj)` | POST `/crm-cobranca/validar` | validação em lote com palpite da IA (ver §6.5) |

> A tela **Empresas** tem 2 abas: **"Empresas enriquecidas"** (cartões/tabela) e
> **"Validação de domínio em lote"** (sobe CSV com empresa/cnpj → candidatos + logo +
> contagem + palpite da IA; ver §6.5). Ambas no `telas/Empresas.jsx`.

---

## 4. Back-end — n8n

### 4.1 Data Tables (projeto `9lO2n1wkfEvQlTP4`)
- **`cobranca`** — id `vwWbTJOAkbxCbhzw`
  Colunas: `nome, email, empresa, valor, vencimento, etapa, status_envio, cbtk_id, ultimo_envio`.
  Dedup por `email` (upsert).
- **`empresas`** — id `ZIpkzf630vW4Rle5`
  Colunas: `empresa, cnpj, dominio, site, emails_rh, enriquecido_em, localizacao, funcionarios, categoria`.
  `emails_rh` é **texto JSON**: `[{"email","valido","cargo","departamento"}]`. Dedup por `empresa` (upsert).

### 4.2 Credenciais (n8n)
- **Redis** "kard" — id `c8GPPrteicNNQgy2` (cache do enriquecimento).
- **CyberTalk** "CyberTalk" — `httpHeaderAuth`, id `qcyHpU9YSHKBiE6U` (ainda **não plugada** no Disparar; hoje o header usa placeholder `__CBTK_KEY__`).
- **Hunter** — a chave da API está **hardcoded nos nós HTTP** do n8n (lado servidor, fora do repo/front). O n8n avisa `HARDCODED_CREDENTIALS`; migrar para uma Credential `httpQueryAuth` é uma melhoria pendente.
- **OpenAI** "kard" — `openAiApi`, id `R5os8lzzzHQJwTU6` (existe no projeto; **não usada** no fim — trocamos por Groq por ser gratuito).
- **Groq** (IA da validação em lote) — usa a API compatível com OpenAI (`https://api.groq.com/openai/v1/chat/completions`, modelo `llama-3.3-70b-versatile`). A chave (prefixo `gsk_`) está **hardcoded no header `Authorization` do nó "Analisar IA"** (lado servidor). Foi colada no chat → **rotacionar** e migrar para Credential `httpHeaderAuth`/`httpBearerAuth`.

### 4.3 Workflows (todos no projeto acima)
| Workflow | ID | Endpoints / função |
|---|---|---|
| **IA - Cobrança - API** | (pré-existente) | GET `/crm-cobranca/list`, POST `/crm-cobranca/update` |
| **IA - Cobrança - Importar por Etapa** | `ez9lEpuoR9JVAzDK` | POST `/crm-cobranca/importar` → normaliza e upsert na cobranca |
| **IA - Cobrança - Disparar por Etapa** | `jRCmvffiFz7ZyM7W` | POST `/crm-cobranca/disparar` {etapa, modelo} → CyberTalk (⚠️ preencher chave) |
| **IA - Cobrança - Empresas (API + Enriquecimento Hunter)** | `L9Ww11UKb9jPEkOg` | GET `/crm-cobranca/empresas`, POST `/crm-cobranca/enriquecer`, GET `/crm-cobranca/dominios`, POST `/crm-cobranca/validar` |
| **IA - Cobrança - ETL CSV** / **Régua** | (antigos) | modelo antigo; Régua ficou **inerte** após o rename das etapas |

> Os JSONs versionados em `n8n/workflows/` são de referência (com a chave da CyberTalk
> **redigida** para `__CBTK_KEY__`). Os workflows **ativos** de Importar/Disparar/Empresas
> foram criados/editados **via MCP** direto no n8n (podem divergir do JSON do repo).

---

## 5. Endpoints (webhooks n8n) — referência rápida
Base produção: `https://n8n.srv1759869.hstgr.cloud/webhook`

| Método | Caminho | Corpo/Query | Retorno |
|---|---|---|---|
| GET | `/crm-cobranca/list` | — | contatos |
| POST | `/crm-cobranca/update` | `{id, etapa}` | move etapa |
| POST | `/crm-cobranca/importar` | `{etapa, registros[]}` | (onReceived) |
| POST | `/crm-cobranca/disparar` | `{etapa, modelo}` | (onReceived) |
| GET | `/crm-cobranca/empresas` | — | empresas enriquecidas |
| POST | `/crm-cobranca/enriquecer` | `{empresa, cnpj, forcar, dominio}` | (onReceived) |
| GET | `/crm-cobranca/dominios?empresa=X` | — | `[{domain, total}]` |
| POST | `/crm-cobranca/validar` | `{empresa, cnpj}` | `{empresa, cnpj, candidatos[], ia{melhor_dominio, probabilidade, justificativa, ranking[]}}` (síncrono) |

Todos com CORS `*`. Os POST de importar/disparar/enriquecer usam `responseMode: onReceived`
(respondem 200 na hora e processam depois → evita resposta pendurada).

---

## 6. Enriquecimento de empresas (Hunter) — o fluxo mais importante

Objetivo: a partir do **nome** (ou domínio) de uma empresa, achar **domínio, site,
localização, nº de funcionários, categoria, logo e e-mails de RH** e salvar em `empresas`.

### 6.1 Pipeline do `POST /crm-cobranca/enriquecer`
```
POST enriquecer {empresa, cnpj, forcar, dominio}
  → Cache Redis (get)        chave "hunter:<empresa minúscula>"
  → Decidir cache            pular = (tem cache) E (forcar != true)
  → IF "Pular?"  --sim-->     [fim: não gasta Hunter]
                 --não-->
  → Buscar Hunter            GET /v2/domain-search  (por DOMÍNIO se informado, senão por company; department=hr)
  → Buscar empresa Hunter    GET /v2/companies/find (por domínio) → location, employees, category
  → Ler empresa atual        lê a linha existente na tabela empresas (alwaysOutputData)
  → Montar empresa (Hunter)  MERGE: só sobrescreve o que o Hunter trouxe; preserva o resto
  → Cache Redis (set)        grava a chave (evita re-buscar)
  → Salvar empresa           upsert na tabela empresas (casa por `empresa`)
```

**Regras importantes (não regredir):**
- **Merge / não apagar dados:** `Montar` usa `hunter || existente` por campo. Se o Hunter
  não retorna e-mails, mantém os que já havia. **CNPJ nunca é apagado** (Hunter não fornece CNPJ).
- **Domínio manda:** se `dominio` vem no corpo (ou já existe salvo e o front reenvia),
  o Hunter busca **por domínio** (não pelo nome) — evita o palpite errado
  (ex.: "kard" → kard.lv). O front **sempre reenvia `e.dominio`** no reenriquecer/enriquecer-tudo.
- **`forcar: true`** ignora o cache (botão *reenriquecer* e *trocar domínio*). Enriquecimento
  normal (tela Contatos) usa cache.

### 6.2 Cache (Redis)
- Credencial Redis "kard". Chave `hunter:<empresa>`. **Não expira** hoje (sem TTL);
  o *reenriquecer* força atualização. Comprovado: 1ª busca ~1–2s (chama Hunter),
  repetição ~10–15ms (pula o Hunter, **não gasta crédito**).

### 6.3 Sugestão de domínios (`GET /crm-cobranca/dominios`) — igual ao autocomplete do Hunter
```
GET /dominios?empresa=kard
  → Gerar candidatos   slug do nome + ~22 TLDs (com, com.br, net, io, lv, pl, eu, gr, com.mx, com.ar, cl, ...)
  → Contar emails      GET /v2/email-count por candidato (batch 5) — email-count é GRÁTIS (não gasta crédito de busca)
  → Agregar            mantém os com total > 0, ordena por total desc
  → responde [{domain, total}]
```
Ex.: `kard` → `kard.lv(6), kard.eu(4), kard.pl(3), kard.com(2), kard.com.br(1), kard.gr(1)`.
No front (`DomainPicker`), o usuário clica no domínio certo (ou digita um manual) e o
sistema reenriquece por ele.

### 6.4 APIs do Hunter usadas
| Uso | Endpoint | Custo |
|---|---|---|
| Nome/domínio → domínio + e-mails de RH (cargo, confiança) | `/v2/domain-search` (`domain` ou `company`, `department=hr`) | 1 busca |
| Domínio → localização, nº funcionários, categoria | `/v2/companies/find?domain=` | 1 busca |
| Contagem de e-mails por domínio (para sugestão) | `/v2/email-count?domain=` | **grátis** |
| Logo | `https://logos.hunter.io/{dominio}` (URL pública, **sem chave**) | grátis |

Validade do e-mail = confiança do Hunter: ≥80 `valido`, ≥50 `desconhecido`, abaixo `invalido`.
Plano da conta é **Free** (~50 buscas/mês) → por isso o cache importa.

### 6.5 Validação de domínio em lote (`POST /crm-cobranca/validar`) — decidir sem gastar cota
Fluxo pensado para o analista subir uma lista (CSV) de empresas/CNPJs e, para cada uma,
ver os domínios candidatos + logo + o **palpite da IA** de qual é o corporativo correto —
**sem consumir busca do Hunter** (só o `email-count`, que é grátis, e o Groq).
```
POST validar {empresa, cnpj}
  → Candidatos (lote)   slug do nome + ~22 TLDs
  → Contar emails (lote) email-count por candidato (batch 5, grátis)
  → Agregar (lote)      mantém total>0, ordena desc → {empresa, cnpj, candidatos[]}
  → Analisar IA         HTTP POST Groq (llama-3.3-70b, JSON mode) rankeia candidatos
  → Montar validacao    parseia o JSON da IA e junta com os candidatos
  → Responder validar   responde SÍNCRONO (o front espera o resultado)
```
- **Grátis:** logo (URL pública), contagem de e-mails (`email-count`) e a IA (Groq free).
- **Só gasta Hunter** quando o analista clica num domínio candidato → chama
  `enriquecerEmpresa(empresa, cnpj, forçar=true, dominio)` (o fluxo do §6.1), que aí busca
  funcionários/localização/e-mails de RH e salva na tabela `empresas`.
- No front: aba **"Validação de domínio em lote"** em `telas/Empresas.jsx` (parser de CSV
  próprio, sem dep nova; loop por empresa com barra de progresso; export do resultado em CSV).
- A IA recebe **contexto do negócio** (empresa brasileira empregadora; objetivo é falar com o
  RH sobre crédito consignado) → prefere `.com.br`/`.com` institucional e descarta TLD de
  outro país. Retorna `probabilidade` (0-100) e `justificativa` curta.

---

## 7. Logos das empresas (`CompanyLogo`)
Clearbit Logo foi **descontinuada**. Cascata de fontes (a 1ª que carregar vence; senão iniciais):
1. `https://logos.hunter.io/{dominio}` (melhor, cobre até Ambev)
2. `https://unavatar.io/{dominio}`
3. `https://www.google.com/s2/favicons?domain={dominio}&sz=128`
4. `https://icons.duckduckgo.com/ip3/{dominio}.ico`
5. fallback: iniciais da empresa num círculo.

Aceita também uma URL `logo` manual (prop `logo`) com prioridade.

---

## 8. Segurança / segredos
- **Nada de segredo no repo/front.** Chaves ficam no n8n (nó ou Credential).
- Hunter: chave nos nós HTTP do n8n (server-side). Foi colada no chat uma vez → **rotacionar** quando possível. Migrar para Credential `httpQueryAuth` é melhoria pendente.
- CyberTalk: no repo os JSONs usam `__CBTK_KEY__` (redigido). Existe Credential `httpHeaderAuth` "CyberTalk" no n8n para plugar no Disparar.
- Logos e sugestão de domínio: a URL de logo é pública; o `email-count` roda no back (precisa da chave).

---

## 9. Decisões e "pegadinhas" (para não repetir erros)
- Deploy só atualiza após **commit + push** na `main`; e o navegador costuma **cachear** →
  usar **Ctrl+Shift+R** ou janela anônima; conferir que é a URL de produção (sem hash).
- Webhooks POST usam `onReceived` (200 imediato) — o front não recebe o resultado síncrono,
  só relê os dados depois.
- `emails_rh` é **texto JSON** na tabela; o front (`listarEmpresas`) faz o parse.
- Nomes de empresa curtos/ambíguos → o Hunter erra o domínio; por isso o **seletor de domínio**.
- Ao editar o nó Code via MCP (`setNodeParameter /jsCode`), o `jsCode` deve ser **uma linha
  só** (com `;`), pois `\n` literal quebraria o JS. (No `create_workflow_from_code` via SDK,
  `\n` dentro de string é ok porque o SDK converte.)
- Mensagem de commit no PowerShell: **evitar aspas duplas** (quebram o argumento).

---

## 10. Pendências / próximos passos
- **CNPJ automático a partir do arquivo:** adicionar coluna `cnpj_empregador` na tabela
  `cobranca`, o Importar gravar, e fluir para `empresas` no enriquecimento. (Hunter não traz CNPJ.)
- **Disparar por Etapa:** plugar a Credential CyberTalk (ou preencher a chave) para o envio funcionar.
- **Migrar a chave do Hunter** para uma Credential `httpQueryAuth` (tirar do nó).
- **Rotacionar a chave do Groq** (foi compartilhada no chat) e migrar do header do nó "Analisar IA" para uma Credential `httpHeaderAuth`/`httpBearerAuth`.
- **TTL no cache Redis** (renovar sozinho a cada X dias), se desejado.
- **Limpar dados de teste** (empresas/contatos fake: Nubank, Stone, Gerdau, O Boticário, ACME, etc.).
- Formato do arquivo **Educacional** (Anexo B) ainda não definido.

---

## 11. Documentos relacionados
- `ESTRUTURA-FASE1.md` — detalhe do esqueleto do front (Fase 1 / MVP).
- `CLAUDE.md` — visão do CRM (n8n + front), modelo de dados.
- `Claude2.md` — documento de requisitos original (RF-xx).
- `n8n/docs/` — docs por workflow (importar/disparar, empresas-enriquecimento).
