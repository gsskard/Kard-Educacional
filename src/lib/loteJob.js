// "Job" de enriquecimento em lote que vive FORA do componente React.
// Assim o progresso não se perde ao trocar de aba/tela: o processo continua
// rodando em segundo plano e a UI só assina (subscribe) o estado atual.
// Obs: um reload de página (F5) encerra o job — o que já foi enriquecido fica
// salvo no banco; só a fila restante para.

let estado = {
  rodando: false,
  n: 0,          // empresa atual (1-based)
  total: 0,
  nome: '',      // nome da empresa em processamento
  ok: 0,
  falhou: 0,
  concluido: false,
  msg: '',
}

const inscritos = new Set()

function avisar() {
  const snap = { ...estado }
  inscritos.forEach((fn) => { try { fn(snap) } catch { /* ignora */ } })
}

export function estadoLote() {
  return { ...estado }
}

// Assina mudanças; chama já com o estado atual. Retorna função pra cancelar.
export function assinarLote(fn) {
  inscritos.add(fn)
  fn({ ...estado })
  return () => inscritos.delete(fn)
}

// Inicia o lote. `enriquecer(empresa, cnpj, forcar, dominio)` é a chamada do serviço.
// `aoItem()` (opcional) roda a cada empresa concluída (ex.: recarregar a lista).
export async function iniciarLoteJob(entrada, enriquecer, aoItem) {
  if (estado.rodando || !entrada || !entrada.length) return
  estado = { rodando: true, n: 0, total: entrada.length, nome: '', ok: 0, falhou: 0, concluido: false, msg: '' }
  avisar()

  for (let i = 0; i < entrada.length; i++) {
    const r = entrada[i]
    estado = { ...estado, n: i + 1, nome: r.empresa }
    avisar()
    try {
      await enriquecer(r.empresa, r.cnpj, false, r.dominio)
      estado = { ...estado, ok: estado.ok + 1 }
    } catch {
      estado = { ...estado, falhou: estado.falhou + 1 }
    }
    avisar()
    if (aoItem) { try { aoItem() } catch { /* ignora */ } }
    // sem domínio = descoberta pela Receita (~3/min): espaça as chamadas
    if (!r.dominio && i < entrada.length - 1) {
      await new Promise((res) => setTimeout(res, 21000))
    }
  }

  estado = {
    ...estado,
    rodando: false,
    concluido: true,
    nome: '',
    msg: `Concluído: ${estado.ok} empresa(s) enriquecida(s)${estado.falhou ? `, ${estado.falhou} com falha` : ''}.`,
  }
  avisar()
}

// Limpa a flag de "concluído" (depois que a UI já reagiu).
export function limparConcluidoLote() {
  if (!estado.rodando) estado = { ...estado, concluido: false, msg: '' }
}
