# RPA — jobs de automação

A tela **RPA** deixa criar jobs em Python, Node ou shell, agendar por cron e
acompanhar cada execução com o log. É um "Airflow enxuto" montado em cima do que
a Kard já usa: front em React, back inteiro no n8n.

## Como está montado

```
Tela RPA (React)                     n8n                          Agente (Python)
─────────────────                    ───                          ───────────────
salva/edita job  ──POST /rpa/*──►  rpa_jobs
"Executar agora" ──────────────►   rpa_execucoes (status: fila)
                                          ▲                        pergunta a cada 5s
   cron do job ──►  Agendador ────────────┘        ◄──POST /rpa-agente/puxar──┘
                    (1x por minuto)                                 │
                                                                    ▼ roda o script
histórico + log  ◄─────────────    rpa_execucoes  ◄──/rpa-agente/resultado──┘
```

**O n8n orquestra; quem executa é sempre um agente.** O n8n guarda os jobs, mantém
a fila, resolve o cron e serve a API — mas não roda o código.

### Por que o n8n não executa o script

O node **Execute Command** está desabilitado nesta instância do n8n (confirmado:
`n8n-nodes-base.executeCommand` não é reconhecido ao criar um workflow). O node
**Code** roda numa sandbox **sem acesso à rede e sem sistema de arquivos**, o que
não serve para RPA de verdade.

Então "rodar na nuvem" quer dizer: **um agente instalado numa máquina que fica
sempre ligada** — o próprio VPS do n8n serve — registrado com o nome reservado
`nuvem`. Job com `destino = nuvem` vai para a fila desse agente; job com
`destino = agente` vai para a fila da máquina escolhida. O mecanismo é o mesmo
nos dois casos: fila, timeout, log e histórico idênticos.

> Se um dia quiserem execução dentro do n8n mesmo, o caminho é o node **SSH**
> (esse existe): o n8n conecta num servidor e roda o comando lá. Precisa de uma
> credencial SSH, e a captura de log/timeout fica mais pobre que a do agente.

## O que existe no n8n

| Workflow | ID | O que faz |
|---|---|---|
| **RPA — API do painel** | `ESV7aED6wGGtoycQ` | Webhook `POST /rpa/:rota` — CRUD de jobs, fila e agentes |
| **RPA — API dos agentes** | `NUvDc60IKUhv7df4` | Webhook `POST /rpa-agente/:rota` — ping, puxar, resultado |
| **RPA — Agendador** | `1wZFHA0HstWuEnaG` | A cada minuto: confere o cron dos jobs ligados e enfileira |

Data tables: `rpa_jobs`, `rpa_execucoes`, `rpa_agentes`, `rpa_config`.

O Agendador está com **"não guardar execuções de sucesso"** — senão ele encheria
o histórico do n8n com 1.440 no-ops por dia. Falha continua sendo gravada.

## Contrato da API do painel

Tudo é `POST` com corpo JSON, sob `VITE_N8N_BASE`. Implementado em
`src/services/RpaService.js`.

| Rota | Corpo | Resposta |
|---|---|---|
| `/rpa/jobs` | `{}` | `[job]` |
| `/rpa/jobs-salvar` | `{job}` | job salvo (**sem `id` = cria**) |
| `/rpa/jobs-apagar` | `{id}` | `{}` — apaga o job **e as execuções dele** |
| `/rpa/jobs-ativar` | `{id, ativo}` | job atualizado |
| `/rpa/jobs-executar` | `{id}` | execução criada com status `fila` |
| `/rpa/execucoes` | `{job, limite}` | `[execucao]`, mais novas primeiro (`job` é obrigatório) |
| `/rpa/execucao` | `{id}` | execução com log completo |
| `/rpa/execucoes-cancelar` | `{id}` | só tira da fila (ver abaixo) |
| `/rpa/agentes` | `{}` | `[{nome, so, versao, ultimo_ping}]` |

A rota também pode vir no corpo (`{"rota": "jobs"}`) em vez do caminho — é assim
que dá para testar o workflow por dentro do n8n, sem chamada HTTP.

## Contrato da API dos agentes

`POST /rpa-agente/{ping|puxar|resultado}`, com o header **`X-Kard-Token`**.

O token esperado está na data table **`rpa_config`**, chave `token_agente` — para
trocar, edite a linha no n8n e reinicie os agentes. Token errado leva 403 antes de
qualquer leitura ou escrita.

- **ping** → `{agente, so, versao}`; faz upsert em `rpa_agentes`. É isso que
  deixa a máquina "online" no chip da tela (online = ping < 2 min).
- **puxar** → `{agente}`; pega a execução `fila` mais antiga daquele agente,
  marca `rodando` e devolve `{execucao_id, job_id, nome, linguagem, codigo,
  timeout_seg, variaveis}`. Fila vazia devolve `{}`.
- **resultado** → `{execucao_id, status, saida, erro, codigo_saida, duracao_ms}`;
  fecha a execução e carimba `ultimo_status`/`ultima_execucao_em` no job.

## Modelo de dados

**`rpa_jobs`** — `nome, descricao, linguagem, codigo, cron, ativo, destino,
agente, timeout_seg, max_retentativas, variaveis (JSON em texto), criado_em,
atualizado_em, ultimo_status, ultima_execucao_em, ultimo_agendado_em`.

**`rpa_execucoes`** — `job_id, job_nome, status, origem, agente, inicio, fim,
duracao_ms, codigo_saida, saida, erro, tentativa`.

Status: `fila → rodando → ok | erro | timeout | cancelado`.

O `id` das linhas é gerado pelo n8n (numérico); o front trata como texto.

## Cron

Cron de 5 campos (`minuto hora dia mês dia-da-semana`), no fuso
**America/São_Paulo**. Aceita `*`, `,`, `-` e `/`. Quando *dia do mês* e *dia da
semana* estão os dois restritos, vale o **OU** — mesma regra do cron de verdade.

O Agendador grava em `ultimo_agendado_em` o minuto que já foi enfileirado, então
uma rodada repetida no mesmo minuto não duplica a execução.

## Instalar um agente

Passo a passo em [`agente/README.md`](../agente/README.md). Resumo:

```bash
python kard_agente.py --base https://SEU-N8N/webhook --token SEGREDO --nome PC-GABRIELLA
```

Para ter a opção **"Nuvem"** funcionando, instale um agente com `--nome nuvem`
numa máquina que fica ligada (o VPS do n8n, por exemplo) e deixe como serviço.
Sem esse agente, job de nuvem fica parado na fila — a tela mostra a execução em
`fila` e nenhum agente online.

## Limites conhecidos

- **Cancelar só tira da fila.** Se o agente já pegou a execução, o processo dele
  não é morto — o botão só aparece enquanto o status é `fila`.
- **`max_retentativas` ainda não é aplicado.** O campo é salvo no job, mas nada
  reenfileira automaticamente depois de uma falha. Fazer isso é acrescentar um
  ramo no Agendador que procura execuções com `erro` e `tentativa < max`.
- **Duas cópias do agente com o mesmo `--nome`** podem pegar a mesma execução.
  Um nome por máquina.
- **Log cortado em 100 mil caracteres** (guardando começo e fim).
- **Sem login.** O painel não tem autenticação, como o resto do backoffice — veja
  abaixo.

## Segurança

Esta tela executa código arbitrário: **quem abre a tela RPA consegue rodar
qualquer coisa** nas máquinas com agente, com as permissões do usuário que roda o
serviço. Isso é o que a ferramenta faz, não um defeito — mas muda o que está em
jogo em relação às outras telas do backoffice.

Antes de usar valendo:

1. **Restrinja o acesso ao painel.** Hoje os webhooks do n8n são abertos, igual
   aos outros do projeto. Aqui isso pesa mais: quem souber a URL cria job. O
   caminho mais direto é ligar **Header Auth** no node `Painel RPA` (credencial
   do tipo *Header Auth* no n8n) e mandar o mesmo header pelo `ApiClient`.
2. **Rode o agente com usuário sem privilégio de administrador.**
3. **Não coloque senha nas "Variáveis" do job** — elas ficam em texto na
   `rpa_jobs`. Segredo de verdade vai em credencial do n8n ou no ambiente da
   máquina do agente.
4. **Troque o `token_agente`** se ele vazar: uma linha na `rpa_config` e reiniciar
   os agentes.
