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
