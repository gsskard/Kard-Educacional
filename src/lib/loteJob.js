// "Job" de enriquecimento em lote que vive FORA do componente React.
// Assim o progresso não se perde ao trocar de aba/tela: o processo continua
// rodando em segundo plano e a UI só assina (subscribe) o estado atual.
// Obs: um reload de página (F5) encerra o job — o que já foi enriquecido fica
// salvo no banco; só a fila restante para.
//
// Fluxo em DUAS FASES (grátis → confirmar → listar):
//   1) DESCOBRIR (grátis): acha o domínio + candidatos + confiança + sugestão da IA.
//      - confiança "alta"  → já LISTA o RH automaticamente (gasta crédito Snov).
//      - confiança "baixa" → NÃO lista; vai pra fila `pendentes` pro usuário escolher.
//   2) O usuário escolhe o domínio de cada pendente → `resolverPendente` LISTA o RH.

let estado = {
  rodando: false,
  n: 0,          // empresa atual (1-based)
  total: 0,
  nome: '',      // nome da empresa em processamento
  ok: 0,
  falhou: 0,
  pendentes: [], // [{empresa, cnpj, candidatos, dominio_sugerido, ia, dados}]
  concluido: false,
  msg: '',
}

const inscritos = new Set()

function avisar() {
  const snap = { ...estado, pendentes: estado.pendentes.slice() }
  inscritos.forEach((fn) => { try { fn(snap) } catch { /* ignora */ } })
}

export function estadoLote() {
  return { ...estado, pendentes: estado.pendentes.slice() }
}

// Assina mudanças; chama já com o estado atual. Retorna função pra cancelar.
export function assinarLote(fn) {
  inscritos.add(fn)
  fn(estadoLote())
  return () => inscritos.delete(fn)
}

// Inicia o lote.
//   entrada: [{empresa, cnpj, dominio}]
//   fns: { descobrir(empresa,cnpj) => {dominio_sugerido,confianca,candidatos,ia,dados},
//          listar(empresa,cnpj,dominio) => Promise }
//   aoItem(): roda a cada empresa LISTADA (ex.: recarregar a lista).
export async function iniciarLoteJob(entrada, fns, aoItem) {
  if (estado.rodando || !entrada || !entrada.length) return
  const { descobrir, listar } = fns || {}
  estado = { rodando: true, n: 0, total: entrada.length, nome: '', ok: 0, falhou: 0, pendentes: [], concluido: false, msg: '' }
  avisar()

  for (let i = 0; i < entrada.length; i++) {
    const r = entrada[i]
    estado = { ...estado, n: i + 1, nome: r.empresa }
    avisar()
    try {
      if (r.dominio) {
        // Usuário já deu o site → confiável: lista direto.
        await listar(r.empresa, r.cnpj, r.dominio)
        estado = { ...estado, ok: estado.ok + 1 }
        if (aoItem) { try { aoItem() } catch { /* ignora */ } }
      } else {
        // Fase 1: descobrir (grátis).
        const d = await descobrir(r.empresa, r.cnpj)
        if (d && d.confianca === 'alta' && d.dominio_sugerido) {
          await listar(r.empresa, r.cnpj, d.dominio_sugerido)
          estado = { ...estado, ok: estado.ok + 1 }
          if (aoItem) { try { aoItem() } catch { /* ignora */ } }
        } else {
          // Incerto → fila de escolha (não gasta crédito).
          estado = {
            ...estado,
            pendentes: estado.pendentes.concat([{
              empresa: r.empresa,
              cnpj: r.cnpj,
              candidatos: (d && d.candidatos) || [],
              dominio_sugerido: (d && d.dominio_sugerido) || '',
              ia: (d && d.ia) || null,
              dados: (d && d.dados) || null,
            }]),
          }
        }
      }
    } catch {
      estado = { ...estado, falhou: estado.falhou + 1 }
    }
    avisar()
    // sem domínio = descoberta pela Receita (~3/min): espaça as chamadas
    if (!r.dominio && i < entrada.length - 1) {
      await new Promise((res) => setTimeout(res, 21000))
    }
  }

  const nPend = estado.pendentes.length
  estado = {
    ...estado,
    rodando: false,
    concluido: true,
    nome: '',
    msg: `Concluído: ${estado.ok} listada(s)`
      + (nPend ? `, ${nPend} aguardando escolha de domínio` : '')
      + (estado.falhou ? `, ${estado.falhou} com falha` : '') + '.',
  }
  avisar()
}

// Resolve uma empresa pendente: lista o RH com o domínio escolhido (gasta crédito).
export async function resolverPendente(item, dominioEscolhido, fns, aoItem) {
  const { listar } = fns || {}
  if (!listar || !item || !dominioEscolhido) return
  try {
    await listar(item.empresa, item.cnpj, dominioEscolhido)
    estado = {
      ...estado,
      ok: estado.ok + 1,
      pendentes: estado.pendentes.filter((p) => p !== item),
    }
    if (aoItem) { try { aoItem() } catch { /* ignora */ } }
  } catch {
    estado = { ...estado, falhou: estado.falhou + 1 }
  }
  avisar()
}

// Descarta um pendente sem listar (usuário desistiu dessa empresa).
export function descartarPendente(item) {
  estado = { ...estado, pendentes: estado.pendentes.filter((p) => p !== item) }
  avisar()
}

// Limpa a flag de "concluído" (depois que a UI já reagiu).
export function limparConcluidoLote() {
  if (!estado.rodando) estado = { ...estado, concluido: false, msg: '' }
}
