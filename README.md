# Kard CRM — Régua de cobrança (front-end)

Painel web (React + Vite) estilo HubSpot, em tons de verde da Kard, para acompanhar a régua
educativa e de cobrança. Os dados vêm da **Data Table `cobranca` do n8n**, via webhooks.

- Etapas: **Educativo → Cobrança 1 → Cobrança 2**
- `Educativo → Cobrança 1` acontece **automaticamente** pela régua agendada no n8n (por data de vencimento)
- `Cobrança 1 → Cobrança 2` é **manual** — feito aqui no painel (botão âmbar)

## Pré-requisitos

- Node.js 18+ instalado
- Os workflows do n8n criados e **ativos**:
  - `IA - Cobrança - API` (webhooks de leitura/escrita) — **precisa estar ativo**
  - `IA - Cobrança - ETL CSV` (importação)
  - `IA - Cobrança - Régua` (disparo agendado)

## Configuração

1. Copie o arquivo de ambiente e ajuste a URL base dos webhooks:

   ```bash
   cp .env.example .env
   ```

   No `.env`:

   ```
   VITE_N8N_BASE=https://SEU-N8N/webhook
   ```

   - Em produção use `/webhook/` (workflow ativo).
   - Para testar com o workflow aberto no editor do n8n, use `/webhook-test/` e clique em "Listen for test event".

2. Instale e rode em desenvolvimento:

   ```bash
   npm install
   npm run dev
   ```

   Abra o endereço que o Vite mostrar (ex.: http://localhost:5173).

## Build de produção

```bash
npm run build      # gera a pasta dist/
npm run preview    # serve o build localmente para conferir
```

## Subir no Git

```bash
git init
git add .
git commit -m "Kard CRM cobrança - front-end inicial"
git branch -M main
git remote add origin git@github.com:SUA-ORG/kard-crm-cobranca.git
git push -u origin main
```

## Deploy

### Vercel
1. Importe o repositório no Vercel.
2. Framework: **Vite**. Build command: `npm run build`. Output: `dist`.
3. Em *Settings → Environment Variables*, adicione `VITE_N8N_BASE` com a URL `/webhook` do seu n8n.
4. Deploy.

### Netlify
1. *Add new site → Import from Git*.
2. Build command: `npm run build`. Publish directory: `dist`.
3. Em *Site settings → Environment variables*, adicione `VITE_N8N_BASE`.
4. Deploy.

## Como o front conversa com o n8n

- `GET  {VITE_N8N_BASE}/crm-cobranca/list` → retorna todas as linhas da Data Table.
- `POST {VITE_N8N_BASE}/crm-cobranca/update` com `{ "id": <id>, "etapa": "Cobranca 2" }` → move o contato.

O CORS já está liberado (`*`) no workflow da API. Para restringir, troque o `Access-Control-Allow-Origin`
no nó "Responder" e o `allowedOrigins` dos webhooks pela URL do seu site.

## Próximos passos sugeridos

- Disparar a Cobrança 2 automaticamente quando o card é movido para a etapa 3 (hoje o move só muda a etapa).
- Validar/enriquecer email com Snov.io antes do disparo.
- Adicionar autenticação no painel e nos webhooks (header auth) antes de expor publicamente.
