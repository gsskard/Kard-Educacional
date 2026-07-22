// Padronização de exibição (só no front — não altera o banco).
// Nomes de empresas/pessoas em Title Case; CNPJ com máscara.

const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'la', 'las', 'los'])

// "ALLREDE SERVICOS" / "silvia alexa" -> "Allrede Servicos" / "Silvia Alexa"
// Mantém conectores (de, da, dos...) em minúsculo, exceto se forem a 1ª palavra.
export function nomeProprio(valor) {
  const s = String(valor || '').trim()
  if (!s) return ''
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => {
      if (i > 0 && CONECTORES.has(p)) return p
      // preserva hífens: "maria-clara" -> "Maria-Clara"
      return p.replace(/(^|-)([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase())
    })
    .join(' ')
}

// "40082376000107" -> "40.082.376/0001-07". Se não tiver 14 dígitos (ex.: empresa
// sem CNPJ, cuja chave interna é o domínio), devolve vazio — quem chama decide o
// texto ("sem CNPJ" / "—"). Assim não vaza o domínio no lugar do número.
export function formatarCnpj(valor) {
  const d = String(valor || '').replace(/\D/g, '')
  if (d.length !== 14) return ''
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3.$4-$5')
}

// Confiança do domínio (score 0-100 do RDAP, guardado no back). Sem score = vazio →
// vermelho ("não verificado"). Usado pela tela Empresas p/ mostrar % + bolinha.
//  >=85 verde (CNPJ confere / mesma raiz) · >=50 âmbar (nome coerente) · resto vermelho.
export function confiancaDominio(score) {
  const s = Number(score)
  if (score == null || Number.isNaN(s)) return { pct: null, cor: 'vermelho', txt: 'não verificado' }
  if (s >= 85) return { pct: s, cor: 'verde', txt: 'domínio confere' }
  if (s >= 50) return { pct: s, cor: 'ambar', txt: 'nome coerente' }
  return { pct: s, cor: 'vermelho', txt: 'titular diverge' }
}

// Quantos e-mails de RH ainda dá pra auto-liberar numa empresa: teto de 3 no total,
// só se a confiança do domínio ≥60% (pula vermelhos/divergentes e não verificados),
// só o que ainda está pendente e limitado ao nº de RH (o back revela RH primeiro).
export function faltaLiberarRh(e) {
  if (Number(e?.dominio_score ?? -1) < 60) return 0
  const revelados = Number(e?.revelados ?? 0)
  const pendentes = Number(e?.total_prospects ?? 0) - revelados
  const rh = Number(e?.total_rh ?? 0)
  return Math.max(0, Math.min(3 - revelados, pendentes, rh))
}
