# n8n — Back-end do Kard CRM (Cobrança)

Esta pasta guarda o **back-end** do projeto: os 3 workflows do n8n, em duas camadas.

```
n8n/
├── README.md            ← você está aqui (índice + como restaurar)
├── workflows/           ← o "código" dos workflows (JSON para reimportar no n8n)
│   ├── ia-cobranca-etl-csv.json
│   ├── ia-cobranca-regua.json
│   └── ia-cobranca-api.json
└── docs/                ← explicação humana, nó por nó (comece por aqui pra entender)
    ├── etl-csv.md
    ├── regua.md
    └── api.md
```

> **Quer ENTENDER como funciona?** → leia os arquivos em `docs/`.
> **Quer RESTAURAR um workflow no n8n?** → use os arquivos em `workflows/`.

---

## Os 3 workflows (visão rápida)

| Workflow | Arquivo | O que faz | Doc |
|---|---|---|---|
| **API** | `workflows/ia-cobranca-api.json` | Webhooks que o painel React usa (listar contatos e mover etapa) | [docs/api.md](docs/api.md) |
| **Importar por Etapa** | `workflows/ia-cobranca-importar-etapa.json` | Recebe `{etapa, registros}` do painel e grava na tabela `cobranca` | [docs/importar-disparar-etapa.md](docs/importar-disparar-etapa.md) |
| **Disparar por Etapa** | `workflows/ia-cobranca-disparar-etapa.json` | Recebe `{etapa}` e dispara o e-mail daquela etapa via CyberTalk | [docs/importar-disparar-etapa.md](docs/importar-disparar-etapa.md) |
| **ETL CSV** | `workflows/ia-cobranca-etl-csv.json` | (antigo) Importa contatos de um CSV via formulário | [docs/etl-csv.md](docs/etl-csv.md) |
| **Régua** | `workflows/ia-cobranca-regua.json` | (antigo/inerte) Régua automática — substituída pelo disparo por etapa | [docs/regua.md](docs/regua.md) |

> **Fluxo atual (01/07/2026):** etapas `Educacional 1 / Educacional 2 / Cobrança`;
> cada tela **importa e dispara a sua** (workflows *Importar/Disparar por Etapa*).
> O **ETL CSV** e a **Régua** são do modelo antigo — a Régua ficou inerte após o
> rename (não acha mais `Educativo`).

Como esses três se conectam (e com o front-end), está no [CLAUDE.md](../CLAUDE.md) na raiz do projeto.

---

## 🔴 IMPORTANTE — segredos não ficam aqui

Nos arquivos JSON deste repositório, a **chave da CyberTalk foi removida** e substituída pelo placeholder `__CBTK_KEY__`. Isso é de propósito: **nunca** se deve commitar chaves/senhas no Git.

Ao reimportar um workflow no n8n, você precisa **colocar a chave real de volta** no nó de disparo (`Disparar Cobranca 1` na Régua, `Disparar Cobranca 2` na API), no header `x-cbtk-key`.

> 💡 O ideal, a médio prazo, é parar de digitar a chave no nó e usar uma **Credential** do n8n (Header Auth). Assim a chave fica guardada com segurança e fora do JSON.

---

## Como RESTAURAR um workflow no n8n

1. No n8n: **Workflows → (botão ⋯ / Add) → Import from File...**
2. Selecione o `.json` desejado dentro de `workflows/`.
3. Abra o nó de disparo e coloque a **chave real** da CyberTalk no header `x-cbtk-key` (lembra: ela foi removida).
4. Confira o **Data Table** (`cobranca`): o ID usado é `vwWbTJOAkbxCbhzw`. Se você importou numa instância diferente do n8n, esse ID pode mudar — reaponte o nó para a sua tabela.
5. Salve e **ative** o workflow.

---

## Como ATUALIZAR estes arquivos quando você mexer no n8n

Sempre que editar um workflow no n8n, reexporte para manter o repositório em dia:

**Opção manual (n8n web):** abra o workflow → menu **⋯ → Download** → substitua o `.json` correspondente nesta pasta → commit.

**Opção assistida:** é só me pedir ("atualiza os JSONs do n8n no repo") que eu puxo a versão mais nova direto do seu n8n, redijo a chave e atualizo os arquivos.

Depois, versione:

```bash
git add n8n/
git commit -m "Atualiza workflows do n8n"
git push
```
