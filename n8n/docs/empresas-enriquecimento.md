# Empresas & Enriquecimento (Snov) — estado atual

Enriquecimento das empresas empregadoras: domínio/site, CNPJ, logo e e-mails de RH.
Hoje o enriquecimento é **MOCK** (gera dados fake), porque ainda não temos acesso à
Snov. Quando a Snov liberar, é só trocar o nó de mock pelas chamadas reais.

## Tabela `empresas` (Data Table do n8n)
- ID: `ZIpkzf630vW4Rle5` (projeto `9lO2n1wkfEvQlTP4`).
- Colunas: `empresa`, `cnpj`, `dominio`, `site`, `emails_rh` (texto JSON), `enriquecido_em`.
- `emails_rh` guarda uma lista em JSON, ex.:
  `[{"email":"rh@empresa.com.br","valido":"valido"}]`. O front converte em lista.
- Semeada com 5 empresas de exemplo (domínios reais → o logo do Clearbit aparece).

## Workflow `IA - Cobrança - Empresas (API + Enriquecimento mock)`
- ID: `L9Ww11UKb9jPEkOg` — **ativo**.
- **GET `/crm-cobranca/empresas`** → lista as empresas (o painel lê daqui).
- **POST `/crm-cobranca/enriquecer`** `{ empresa, cnpj }` → nó **Mock** gera
  domínio (slug + `.com.br`), site e e-mails de RH fake, e faz upsert na tabela
  (casando por `empresa`). Responde com a empresa gravada.

## Para plugar a Snov de verdade (quando tiver acesso)
Trocar o nó **"Mock enriquecimento"** por esta sequência (as rotas estão testadas
no `snov_io_api_testes.ipynb`):
1. Autenticar: `POST /v1/oauth/access_token` (Credential no n8n com USER_ID/SECRET).
2. Empresa → domínio: `POST /v2/company-domain-by-name` (validar domínio, evitar `.fr`).
3. Domínio → e-mails de RH: `/v2/domain-search/prospects` (filtro de cargo) ou `domain-emails`.
4. Validar cada e-mail (Snov Email Verifier).
5. Logo continua via Clearbit (`logo.clearbit.com/{dominio}`) — não precisa de chave.
6. Cache (RF-12): se a empresa já foi enriquecida há pouco e o e-mail é válido, pular.

> As rotas v2 da Snov são assíncronas (dispara → consulta `task_hash`). No n8n isso
> vira: HTTP start → Wait → HTTP result → IF `completed?` (senão volta pro Wait).
