// Configuração da tela RPA: linguagens suportadas, modelos de código iniciais
// e atalhos de agendamento. Mesma ideia do config/etapas.js — o que é "conteúdo"
// mora aqui, a tela só consome.

// Linguagens que o agente local e o executor da nuvem sabem rodar.
// `comando` é só documentação para a tela; quem monta a linha de comando de
// verdade é o agente (agente/kard_agente.py) ou o workflow da nuvem.
export const LINGUAGENS = {
  python: { label: 'Python', extensao: 'py', comando: 'python3 script.py' },
  node: { label: 'Node.js', extensao: 'js', comando: 'node script.js' },
  bash: { label: 'Shell (bash)', extensao: 'sh', comando: 'bash script.sh' },
}

// Código inicial de um job novo — serve de documentação viva do contrato:
// variáveis chegam por ambiente, o que sai no stdout vira o log da execução.
export const MODELOS_CODIGO = {
  python: `import os
import json
import urllib.request

# As "Variáveis" do job chegam como variáveis de ambiente.
BASE = os.environ.get("KARD_N8N_BASE", "")

def main():
    print("job iniciado")
    # exemplo: chamar um webhook do n8n e resumir o resultado
    # with urllib.request.urlopen(f"{BASE}/crm-listas/list") as r:
    #     listas = json.load(r)
    #     print(f"{len(listas)} lista(s)")
    print("job concluído")

main()
`,
  node: `// As "Variáveis" do job chegam em process.env.
const BASE = process.env.KARD_N8N_BASE || ''

async function main() {
  console.log('job iniciado')
  // const r = await fetch(BASE + '/crm-listas/list')
  // console.log((await r.json()).length + ' lista(s)')
  console.log('job concluído')
}

main()
`,
  bash: `#!/usr/bin/env bash
set -euo pipefail

# As "Variáveis" do job chegam como variáveis de ambiente.
echo "job iniciado"
echo "job concluído"
`,
}

// Atalhos de agendamento (cron de 5 campos, no fuso America/Sao_Paulo).
export const PRESETS_CRON = [
  { cron: '', label: 'Sem agendamento (só manual)' },
  { cron: '*/15 * * * *', label: 'A cada 15 minutos' },
  { cron: '0 * * * *', label: 'De hora em hora' },
  { cron: '0 */6 * * *', label: 'A cada 6 horas' },
  { cron: '0 8 * * *', label: 'Todo dia às 08:00' },
  { cron: '0 8 * * 1-5', label: 'Dias úteis às 08:00' },
  { cron: '0 20 * * 1-5', label: 'Dias úteis às 20:00' },
  { cron: '0 8 1 * *', label: 'Todo dia 1º às 08:00' },
]

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Valida os 5 campos do cron sem depender de biblioteca. Devolve '' se estiver ok
// ou o motivo do erro. Aceita * , - / e números dentro da faixa de cada campo.
export function validarCron(cron) {
  const texto = String(cron || '').trim()
  if (!texto) return ''
  const campos = texto.split(/\s+/)
  if (campos.length !== 5) return 'O cron precisa ter 5 campos: minuto hora dia mês dia-da-semana.'
  const faixas = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
  const nomes = ['minuto', 'hora', 'dia do mês', 'mês', 'dia da semana']
  for (let i = 0; i < 5; i++) {
    const [min, max] = faixas[i]
    for (const parte of campos[i].split(',')) {
      const [alvo, passo] = parte.split('/')
      if (passo !== undefined && !/^\d+$/.test(passo)) return `Passo inválido no campo ${nomes[i]}.`
      if (alvo === '*') continue
      const limites = alvo.split('-')
      if (limites.length > 2) return `Faixa inválida no campo ${nomes[i]}.`
      for (const n of limites) {
        if (!/^\d+$/.test(n) || Number(n) < min || Number(n) > max) {
          return `O campo ${nomes[i]} aceita ${min}–${max}.`
        }
      }
    }
  }
  return ''
}

// Descreve o cron em português nos formatos que a gente de fato usa.
// Se cair em algo mais exótico, devolve a própria expressão (sem mentir).
export function descreverCron(cron) {
  const texto = String(cron || '').trim()
  if (!texto) return 'Só manual'
  const preset = PRESETS_CRON.find((p) => p.cron === texto)
  if (preset) return preset.label
  const [min, hora, dia, mes, semana] = texto.split(/\s+/)
  if (texto.split(/\s+/).length !== 5) return texto

  const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const cadaMin = /^\*\/(\d+)$/.exec(min)
  if (cadaMin && hora === '*' && dia === '*' && mes === '*' && semana === '*') {
    return `A cada ${cadaMin[1]} minutos`
  }
  const cadaHora = /^\*\/(\d+)$/.exec(hora)
  if (/^\d+$/.test(min) && cadaHora && dia === '*' && mes === '*' && semana === '*') {
    return `A cada ${cadaHora[1]} horas (no minuto ${min})`
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hora) && mes === '*') {
    const quando = hhmm(hora, min)
    if (dia === '*' && semana === '*') return `Todo dia às ${quando}`
    if (dia === '*' && semana === '1-5') return `Dias úteis às ${quando}`
    if (dia === '*' && /^\d$/.test(semana)) return `Toda ${DIAS[Number(semana) % 7]} às ${quando}`
    if (/^\d+$/.test(dia) && semana === '*') return `Todo dia ${dia} às ${quando}`
  }
  return texto
}
