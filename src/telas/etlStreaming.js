// Processamento de CSV grande 100% no navegador, em STREAMING.
// Lê o arquivo em blocos (nunca carrega tudo na memória), aplica um filtro/limpeza
// linha a linha e grava o resultado num arquivo NOVO via File System Access API.
// Aguenta arquivos de centenas de MB / GB porque entrada e saída são "streams":
// a memória usada fica praticamente constante (só o dedup cresce com chaves distintas).

// Detecta o separador olhando a primeira linha (; , \t |).
export function detectarSeparador(linha) {
  const cands = [';', ',', '\t', '|']
  let melhor = ',', max = -1
  for (const c of cands) {
    const n = linha.split(c).length
    if (n > max) { max = n; melhor = c }
  }
  return melhor
}

// Parser de uma linha CSV com aspas ("campo; com separador", ""aspas escapadas"").
// Assume que um registro = uma linha (não trata campo com quebra de linha embutida).
export function parseLinha(linha, sep) {
  const out = []
  let campo = '', aspas = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (aspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') { campo += '"'; i++ } else aspas = false
      } else campo += ch
    } else {
      if (ch === '"') aspas = true
      else if (ch === sep) { out.push(campo); campo = '' }
      else campo += ch
    }
  }
  out.push(campo)
  return out
}

// Serializa campos de volta pra linha CSV (coloca aspas só quando precisa).
export function montarLinha(campos, sep) {
  return campos.map((c) => {
    c = c == null ? '' : String(c)
    if (c.includes(sep) || c.includes('"') || c.includes('\n') || c.includes('\r')) {
      return '"' + c.replace(/"/g, '""') + '"'
    }
    return c
  }).join(sep)
}

// Lê só o cabeçalho (primeira linha) de um File, sem carregar o arquivo todo.
export async function lerCabecalho(file, encoding = 'utf-8') {
  const buf = await file.slice(0, 256 * 1024).arrayBuffer()
  const texto = new TextDecoder(encoding).decode(buf)
  const fim = texto.indexOf('\n')
  const primeira = (fim >= 0 ? texto.slice(0, fim) : texto).replace(/\r$/, '')
  const sep = detectarSeparador(primeira)
  const colunas = parseLinha(primeira, sep)
  return { colunas, sep }
}

// Processa o arquivo inteiro em streaming e grava o CSV tratado num arquivo novo.
// receita = {
//   sep, encoding,
//   manter: [idx...] | null,       // colunas a manter (null = todas)
//   removerVazias: [idx...],       // descarta a linha se QUALQUER uma dessas estiver vazia
//   dedupIdx: number | null,       // deduplica pela coluna (mantém a 1ª ocorrência)
// }
// onProgresso = ({ pct, lidas, mantidas }) => void
// sinal = { abortado: boolean }   // pra cancelar no meio
export async function processarArquivo(fileHandle, receita, onProgresso, sinal) {
  // IMPORTANTE: escolher o arquivo de saída ANTES de qualquer await pesado,
  // pra não perder a "ativação por clique" do usuário (exigência do navegador).
  const outHandle = await window.showSaveFilePicker({
    suggestedName: 'tratado_' + fileHandle.name,
    types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
  })
  const writable = await outHandle.createWritable()

  const file = await fileHandle.getFile()
  const total = file.size || 1
  const encoder = new TextEncoder()
  const sep = receita.sep
  const manter = receita.manter && receita.manter.length ? receita.manter : null
  const removerVazias = receita.removerVazias || []
  const seen = receita.dedupIdx != null ? new Set() : null

  const reader = file.stream().getReader()
  const decoder = new TextDecoder(receita.encoding || 'utf-8')
  let buffer = ''         // texto ainda não quebrado em linhas
  let outBuf = ''         // saída acumulada (flush em blocos, evita 1 write por linha)
  let bytes = 0
  let ehCabecalho = true
  let lidas = 0, mantidas = 0
  let ultimoPct = -1

  const projetar = (campos) => (manter ? manter.map((i) => campos[i] ?? '') : campos)

  async function flush(forcar) {
    if (outBuf && (forcar || outBuf.length > 256 * 1024)) {
      await writable.write(encoder.encode(outBuf))
      outBuf = ''
    }
  }

  async function processarLinha(linha) {
    if (linha === '') return
    const campos = parseLinha(linha, sep)
    if (ehCabecalho) {
      ehCabecalho = false
      outBuf += montarLinha(projetar(campos), sep) + '\n'
      return
    }
    lidas++
    for (const idx of removerVazias) {
      if (!campos[idx] || !String(campos[idx]).trim()) return
    }
    if (seen) {
      const chave = campos[receita.dedupIdx] ?? ''
      if (seen.has(chave)) return
      seen.add(chave)
    }
    mantidas++
    outBuf += montarLinha(projetar(campos), sep) + '\n'
    await flush(false)
  }

  try {
    while (true) {
      if (sinal?.abortado) throw new Error('cancelado')
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      buffer += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        let linha = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (linha.endsWith('\r')) linha = linha.slice(0, -1)
        await processarLinha(linha)
      }
      const pct = Math.min(99, Math.round((bytes / total) * 100))
      if (pct !== ultimoPct) { ultimoPct = pct; onProgresso({ pct, lidas, mantidas }) }
    }
    buffer += decoder.decode()
    if (buffer) {
      let linha = buffer
      if (linha.endsWith('\r')) linha = linha.slice(0, -1)
      await processarLinha(linha)
    }
    await flush(true)
    await writable.close()
    onProgresso({ pct: 100, lidas, mantidas })
    return { lidas, mantidas, removidas: lidas - mantidas, arquivo: outHandle.name }
  } catch (e) {
    try { await writable.abort() } catch { /* ignora */ }
    throw e
  }
}
