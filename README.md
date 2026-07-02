# Kard Backoffice — Front-end (React + Vite)

Painel do Backoffice da Kard (régua educativa/de cobrança + enriquecimento de empresas), no
visual do **Portal Super Crédito**. **Todo o back-end fica no n8n** — o front só chama webhooks;
nenhum segredo ou regra de negócio mora aqui.

> 🔗 **Backend** (n8n, notebooks de teste, docs do sistema): repositório **`Kard-Educacional-Backend`**.
> A **fonte da verdade** do sistema é o `ARQUITETURA.md` **de lá** — leia primeiro ao retomar.

## Rodar

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Copie `.env.example` → `.env` e ajuste `VITE_N8N_BASE` (a URL `/webhook` do n8n).
Deploy: **Vercel** (cada push na `main` gera deploy).

## Arquitetura do front (OOP em camadas)

```
Telas (src/telas)  →  Fachada (src/api/n8n.js)  →  Serviços (src/services)  →  ApiClient  →  webhooks n8n
                                                          usam ↓
                                                     Modelos (src/models)
```

- **`services/ApiClient.js`** — única classe que faz `fetch` (base URL, JSON, tratamento de erro).
- **`services/CobrancaService.js`** — contatos: `listarContatos / moverContato / importarCarga / dispararEtapa`.
- **`services/EmpresasService.js`** — empresas: `listarEmpresas / enriquecerEmpresa / sugerirDominios / validarDominio`.
- **`models/Contato.js`, `models/Empresa.js`** — modelos de domínio (ex.: parse de `emails_rh`).
- **`api/n8n.js`** — **fachada fina**; as telas importam daqui (permite refatorar os serviços sem mexer nas telas).

## Mapa do `src/`

```
src/
├─ main.jsx                 ponto de entrada
├─ App.jsx                  roteia por hash na URL (#/dashboard, #/empresas, ...)
├─ styles.css               tema do Portal + responsividade + animações
├─ hooks/useHashRoute.js    mini-navegação (React puro, SEM react-router)
├─ config/etapas.js         etapas (Educacional/Cobrança), modelos de e-mail, colunas dos arquivos
├─ api/n8n.js               FACHADA das chamadas ao n8n
├─ services/                ApiClient · CobrancaService · EmpresasService
├─ models/                  Contato · Empresa
├─ componentes/             Layout (sidebar) · CompanyLogo · PillStatus
└─ telas/                   Dashboard · TelaEtapa · Contatos · Empresas · Configuracoes
```

## Telas

- **Dashboard** — funil por etapa.
- **Educacional / Cobrança** — a **mesma** `TelaEtapa.jsx` (upload CSV → conferência → disparo);
  o que muda é a config vinda de `config/etapas.js`. Educacional tem seletor de modelo de e-mail.
- **Contatos** — base de contatos cruzada com as empresas (logo + status de enriquecimento).
- **Empresas** — empresas enriquecidas (Hunter) + aba **Validação de domínio em lote** (CNPJ + IA).
- **Configurações** — inboxes por etapa e integrações (esqueleto).

## Convenções

- Front **leve**: navegação por hash, **sem dependências novas** sem necessidade.
- **Nada de segredo** no front. Rotas, serviços externos (Hunter, BrasilAPI, ReceitaWS, Groq) e
  o que é grátis/pago estão documentados no repo **backend** (`notebooks/` + `ARQUITETURA.md`).
