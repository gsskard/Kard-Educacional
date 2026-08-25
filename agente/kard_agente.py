#!/usr/bin/env python3
"""Agente RPA da Kard — roda os jobs marcados como "Máquina local".

Fica em loop perguntando ao n8n se existe execução na fila para esta máquina,
roda o script, e devolve stdout/stderr/código de saída. Só depende da
biblioteca padrão do Python (3.8+) — nada de pip install.

    python kard_agente.py --base https://SEU-N8N/webhook --token SEGREDO

Ou por variáveis de ambiente: KARD_N8N_BASE, KARD_RPA_TOKEN, KARD_AGENTE.
Ver agente/README.md para instalar como serviço.
"""

import argparse
import json
import os
import platform
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

VERSAO = "1.0.0"

# Cortamos logs gigantes antes de mandar para o n8n (guardamos começo e fim,
# que é onde costuma estar a informação útil).
LIMITE_LOG = 100_000

EXTENSAO = {"python": ".py", "node": ".js", "bash": ".sh"}

_parar = False


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def agora_iso():
    return datetime.now(timezone.utc).isoformat()


def cortar(texto):
    texto = texto or ""
    if len(texto) <= LIMITE_LOG:
        return texto
    metade = LIMITE_LOG // 2
    cortadas = len(texto) - LIMITE_LOG
    return f"{texto[:metade]}\n\n… [{cortadas} caracteres omitidos] …\n\n{texto[-metade:]}"


class Painel:
    """Conversa com os webhooks /rpa-agente/* do n8n."""

    def __init__(self, base, token, nome, timeout=30):
        self.base = base.rstrip("/")
        self.token = token
        self.nome = nome
        self.timeout = timeout

    def post(self, caminho, corpo):
        dados = json.dumps({**corpo, "agente": self.nome}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}{caminho}",
            data=dados,
            headers={"Content-Type": "application/json", "X-Kard-Token": self.token},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            texto = r.read().decode("utf-8").strip()
        return json.loads(texto) if texto else None

    def ping(self):
        return self.post("/rpa-agente/ping", {
            "so": f"{platform.system()} {platform.release()}",
            "versao": VERSAO,
            "python": platform.python_version(),
            "em": agora_iso(),
        })

    def puxar(self):
        """Próxima execução na fila desta máquina, ou None."""
        r = self.post("/rpa-agente/puxar", {})
        if isinstance(r, list):
            r = r[0] if r else None
        if not r or not r.get("execucao_id"):
            return None
        return r

    def resultado(self, execucao_id, status, saida, erro, codigo_saida, duracao_ms):
        return self.post("/rpa-agente/resultado", {
            "execucao_id": execucao_id,
            "status": status,
            "saida": cortar(saida),
            "erro": cortar(erro),
            "codigo_saida": codigo_saida,
            "duracao_ms": duracao_ms,
            "fim": agora_iso(),
        })


def montar_comando(linguagem, arquivo):
    if linguagem == "python":
        # mesmo interpretador que roda o agente: evita achar o Python errado no PATH
        return [sys.executable, arquivo]
    if linguagem == "node":
        return ["node", arquivo]
    if linguagem == "bash":
        return ["bash", arquivo]
    raise ValueError(f"linguagem não suportada pelo agente: {linguagem}")


def montar_ambiente(tarefa, base):
    ambiente = dict(os.environ)
    variaveis = tarefa.get("variaveis") or {}
    if isinstance(variaveis, str):
        try:
            variaveis = json.loads(variaveis)
        except json.JSONDecodeError:
            variaveis = {}
    for chave, valor in variaveis.items():
        ambiente[str(chave)] = "" if valor is None else str(valor)
    # contexto do job, útil para o script se identificar nos logs
    ambiente["KARD_N8N_BASE"] = base
    ambiente["KARD_JOB_ID"] = str(tarefa.get("job_id", ""))
    ambiente["KARD_JOB_NOME"] = str(tarefa.get("nome", ""))
    ambiente["KARD_EXECUCAO_ID"] = str(tarefa.get("execucao_id", ""))
    ambiente["PYTHONUNBUFFERED"] = "1"
    return ambiente


def encerrar(processo):
    """Mata o processo e os filhos que ele tenha aberto."""
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(processo.pid)],
                           capture_output=True, timeout=15)
        else:
            os.killpg(os.getpgid(processo.pid), signal.SIGKILL)
    except Exception:
        processo.kill()


def executar(tarefa, base, pasta_trabalho):
    """Roda o script da execução e devolve (status, saida, erro, codigo, ms)."""
    linguagem = tarefa.get("linguagem", "python")
    timeout = int(tarefa.get("timeout_seg") or 300)
    sufixo = EXTENSAO.get(linguagem, ".txt")

    with tempfile.TemporaryDirectory(prefix="kard-rpa-", dir=pasta_trabalho or None) as pasta:
        arquivo = os.path.join(pasta, f"job{sufixo}")
        with open(arquivo, "w", encoding="utf-8", newline="\n") as f:
            f.write(tarefa.get("codigo") or "")

        comando = montar_comando(linguagem, arquivo)
        extras = {}
        if os.name == "nt":
            extras["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            extras["start_new_session"] = True  # dá um process group próprio para o kill

        comeco = time.monotonic()
        try:
            processo = subprocess.Popen(
                comando, cwd=pasta, env=montar_ambiente(tarefa, base),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8", errors="replace", **extras,
            )
        except FileNotFoundError as err:
            ms = int((time.monotonic() - comeco) * 1000)
            return "erro", "", f"não consegui rodar {comando[0]}: {err}", None, ms

        try:
            saida, erro = processo.communicate(timeout=timeout)
            ms = int((time.monotonic() - comeco) * 1000)
            status = "ok" if processo.returncode == 0 else "erro"
            return status, saida, erro, processo.returncode, ms
        except subprocess.TimeoutExpired:
            encerrar(processo)
            saida, erro = processo.communicate()
            ms = int((time.monotonic() - comeco) * 1000)
            return "timeout", saida, (erro or "") + f"\n[agente] passou de {timeout}s e foi encerrado.", None, ms


def sinal(_num, _quadro):
    global _parar
    _parar = True
    log("encerrando após a execução atual… (Ctrl+C de novo para forçar)")


def main():
    p = argparse.ArgumentParser(description="Agente RPA da Kard")
    p.add_argument("--base", default=os.environ.get("KARD_N8N_BASE", ""),
                   help="URL base dos webhooks do n8n (ex.: https://n8n.exemplo/webhook)")
    p.add_argument("--token", default=os.environ.get("KARD_RPA_TOKEN", ""),
                   help="segredo compartilhado com o n8n (header X-Kard-Token)")
    p.add_argument("--nome", default=os.environ.get("KARD_AGENTE", socket.gethostname()),
                   help="nome desta máquina no painel (padrão: hostname)")
    p.add_argument("--intervalo", type=float, default=float(os.environ.get("KARD_INTERVALO", 5)),
                   help="segundos entre consultas à fila (padrão: 5)")
    p.add_argument("--pasta", default=os.environ.get("KARD_PASTA", ""),
                   help="onde criar a pasta temporária de cada execução (padrão: temp do sistema)")
    p.add_argument("--uma-vez", action="store_true", help="pega no máximo uma execução e sai (para testar)")
    args = p.parse_args()

    if not args.base:
        p.error("informe --base (ou KARD_N8N_BASE)")
    if not args.token:
        p.error("informe --token (ou KARD_RPA_TOKEN)")

    painel = Painel(args.base, args.token, args.nome)
    signal.signal(signal.SIGINT, sinal)
    signal.signal(signal.SIGTERM, sinal)

    log(f"agente '{args.nome}' v{VERSAO} — {platform.system()} {platform.release()}")
    log(f"painel: {painel.base}")

    ultimo_ping = 0.0
    espera_erro = args.intervalo

    while not _parar:
        try:
            # o ping mantém a máquina como "online" na tela de RPA
            if time.monotonic() - ultimo_ping > 60:
                painel.ping()
                ultimo_ping = time.monotonic()

            tarefa = painel.puxar()
            espera_erro = args.intervalo

            if not tarefa:
                if args.uma_vez:
                    log("fila vazia.")
                    return 0
                time.sleep(args.intervalo)
                continue

            nome = tarefa.get("nome") or tarefa.get("job_id")
            log(f"▶ execução {tarefa['execucao_id']} — {nome} ({tarefa.get('linguagem')})")
            status, saida, erro, codigo, ms = executar(tarefa, painel.base, args.pasta)
            log(f"  {status} em {ms} ms (código {codigo})")
            painel.resultado(tarefa["execucao_id"], status, saida, erro, codigo, ms)

            if args.uma_vez:
                return 0 if status == "ok" else 1

        except urllib.error.HTTPError as err:
            if err.code in (401, 403):
                log(f"token recusado pelo n8n (HTTP {err.code}). Confira --token.")
                return 2
            log(f"erro HTTP {err.code} falando com o n8n; tento de novo em {espera_erro:.0f}s")
            time.sleep(espera_erro)
            espera_erro = min(espera_erro * 2, 60)
        except (urllib.error.URLError, socket.timeout, TimeoutError) as err:
            log(f"sem conexão com o n8n ({err}); tento de novo em {espera_erro:.0f}s")
            time.sleep(espera_erro)
            espera_erro = min(espera_erro * 2, 60)
        except Exception as err:  # nunca deixamos o loop morrer por causa de um job
            log(f"erro inesperado: {type(err).__name__}: {err}")
            time.sleep(espera_erro)
            espera_erro = min(espera_erro * 2, 60)

    log("agente encerrado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
