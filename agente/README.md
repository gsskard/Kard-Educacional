# Agente RPA da Kard

Programinha que roda numa máquina (o seu PC, um servidor da empresa) e executa os
jobs que a tela **RPA** do backoffice marcou como **“Máquina local”**.

Só precisa de **Python 3.8+**. Não usa nenhuma biblioteca externa.

## Como funciona

```
Tela RPA ──salva o job──► n8n (fila de execuções)
                              ▲   │
              resultado ──────┘   └──► este agente pergunta a cada 5s
                                       "tem coisa pra mim?" e roda o script
```

O agente **só faz chamadas de saída** (HTTPS para o n8n). Não abre porta, não
precisa de IP fixo nem de liberação no firewall de entrada — por isso funciona
atrás da rede da empresa e em notebook com internet de casa.

## Rodar

```bash
python kard_agente.py --base https://SEU-N8N/webhook --token SEGREDO --nome PC-GABRIELLA
```

| Parâmetro | Variável de ambiente | Para que serve |
|---|---|---|
| `--base` | `KARD_N8N_BASE` | URL dos webhooks do n8n (a mesma do `.env` do front) |
| `--token` | `KARD_RPA_TOKEN` | segredo combinado com o n8n (vai no header `X-Kard-Token`) |
| `--nome` | `KARD_AGENTE` | nome da máquina no painel (padrão: hostname) |
| `--intervalo` | `KARD_INTERVALO` | segundos entre consultas à fila (padrão: 5) |
| `--pasta` | `KARD_PASTA` | onde criar a pasta temporária de cada job |
| `--uma-vez` | — | pega no máximo um job e sai — bom para testar |

Teste rápido antes de instalar como serviço:

```bash
python kard_agente.py --base https://SEU-N8N/webhook --token SEGREDO --uma-vez
```

O nome que você der em `--nome` é o que aparece na lista de agentes da tela RPA —
é ele que o job usa no campo **Agente**.

## Deixar rodando sempre

### Windows (Agendador de Tarefas)

1. `Win+R` → `taskschd.msc` → **Criar Tarefa** (não “tarefa básica”).
2. Aba **Geral**: marque *Executar estando o usuário conectado ou não* e
   *Executar com privilégios mais altos* apenas se o job precisar.
3. Aba **Disparadores**: novo disparador *Ao iniciar o computador*, e marque
   *Repetir a cada 5 minutos* por *tempo indefinido* (assim ele volta sozinho se cair).
4. Aba **Ações**: iniciar programa
   - Programa: `C:\Users\SEU-USUARIO\AppData\Local\Programs\Python\Python312\pythonw.exe`
   - Argumentos: `C:\kard\agente\kard_agente.py --base https://SEU-N8N/webhook --token SEGREDO`
5. Aba **Configurações**: desmarque *Interromper a tarefa se ela for executada por mais de…*.

> `pythonw.exe` roda sem abrir janela preta. Para ver o log enquanto testa, use
> `python.exe` mesmo.

**Importante:** se o job precisa interagir com a tela (abrir Excel, clicar em
sistema legado), a tarefa tem que rodar **com o usuário conectado** — sessão
bloqueada não desenha tela.

### Linux (systemd)

`/etc/systemd/system/kard-agente.service`:

```ini
[Unit]
Description=Agente RPA da Kard
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/kard/agente/kard_agente.py
Environment=KARD_N8N_BASE=https://SEU-N8N/webhook
Environment=KARD_RPA_TOKEN=SEGREDO
Restart=always
RestartSec=10
User=kard

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now kard-agente
journalctl -u kard-agente -f
```

## O que o script recebe

- As **Variáveis** do job chegam como variáveis de ambiente.
- Além delas: `KARD_N8N_BASE`, `KARD_JOB_ID`, `KARD_JOB_NOME`, `KARD_EXECUCAO_ID`.
- O script roda numa **pasta temporária própria**, apagada no fim. Se precisa
  guardar arquivo, escreva num caminho absoluto (ou mande para o OneDrive/S3).
- Tudo que sai em `stdout`/`stderr` vira o log da execução na tela (cortado em
  100 mil caracteres, preservando começo e fim).
- Estourou o `timeout` do job? O agente mata o processo **e os filhos dele**, e a
  execução fica com status `timeout`.

## Segurança — leia antes de instalar

Este agente **executa código que qualquer pessoa com acesso à tela RPA escrever**,
com as permissões do usuário que roda o serviço. Na prática:

- rode com um usuário **sem privilégio de administrador**, salvo necessidade real;
- guarde o `--token` fora do repositório (variável de ambiente ou o próprio serviço);
- as **Variáveis** do job ficam salvas em texto no n8n — senha e token de verdade
  devem ficar em credencial do n8n ou no ambiente da máquina, não no job.
