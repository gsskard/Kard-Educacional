// DuckDB-WASM — consulta um CSV LOCAL grande via SQL, 100% no navegador.
// O arquivo é registrado como BROWSER_FILEREADER: o DuckDB faz leituras por
// faixa (range reads) direto do File, então NÃO carrega os 656 MB na memória.
// A base bruta nunca sai da máquina (importante p/ LGPD: CPF + saldo devedor).
//
// Os .wasm/worker são importados via Vite (?url) e empacotados no build — sem
// depender de CDN. selectBundle escolhe mvp (compat) ou eh (mais rápido).
import * as duckdb from '@duckdb/duckdb-wasm'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

let _db = null
async function getDb() {
  if (_db) return _db
  const bundles = {
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  }
  const bundle = await duckdb.selectBundle(bundles)
  const worker = new Worker(bundle.mainWorker)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  _db = db
  return db
}

const FILE = 'base.csv'
const semPontoVirgula = (sql) => sql.trim().replace(/;\s*$/, '')

// Adivinha a codificação lendo os primeiros 2 MB: se não for UTF-8 válido
// (acento de nome quebra o decode), assume Latin-1 (padrão de arquivo de banco).
export async function sniffEncoding(file) {
  const buf = await file.slice(0, 2 * 1024 * 1024).arrayBuffer()
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return 'utf-8' } catch { return 'latin-1' }
}

// Registra o arquivo local e cria a VIEW "base" (detecção automática de tipos).
// opts.encoding: 'utf-8' | 'latin-1' | undefined (auto). opts.delim: ';' | ',' | '\t' | undefined (auto).
// Retorna colunas detectadas + a codificação/separador efetivamente usados.
export async function abrirBase(fileHandle, opts = {}) {
  const db = await getDb()
  const file = await fileHandle.getFile()
  const encoding = opts.encoding || await sniffEncoding(file)
  try { await db.dropFile(FILE) } catch { /* ainda não registrado */ }
  await db.registerFileHandle(FILE, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)
  const conn = await db.connect()
  try {
    const delim = opts.delim ? `, delim='${opts.delim === '\\t' ? '\t' : opts.delim}'` : ''
    await conn.query(`CREATE OR REPLACE VIEW base AS SELECT * FROM read_csv_auto('${FILE}', header=true, encoding='${encoding}'${delim})`)
    const info = await conn.query('DESCRIBE base')
    const colunas = info.toArray().map((r) => ({ nome: r.column_name, tipo: r.column_type }))
    return { colunas, encoding, delim: opts.delim || 'auto' }
  } finally {
    await conn.close()
  }
}

// Roda o SQL e devolve contagem total + amostra (LIMIT), sem materializar tudo:
// count(*) e o preview limitado são calculados como subconsulta.
export async function rodarSql(sql, limitePreview = 200) {
  const db = await getDb()
  const conn = await db.connect()
  const clean = semPontoVirgula(sql)
  try {
    const t0 = performance.now()
    const cnt = await conn.query(`SELECT count(*) AS n FROM (${clean})`)
    const total = Number(cnt.toArray()[0].n)
    const res = await conn.query(`SELECT * FROM (${clean}) LIMIT ${limitePreview}`)
    const colunas = res.schema.fields.map((f) => f.name)
    const linhas = res.toArray().map((r) => {
      const o = r.toJSON()
      // normaliza tipos que não serializam bem (BigInt, Date)
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (typeof v === 'bigint') o[k] = v.toString()
        else if (v instanceof Date) o[k] = v.toLocaleDateString('pt-BR')
      }
      return o
    })
    const ms = Math.round(performance.now() - t0)
    return { colunas, linhas, total, ms }
  } finally {
    await conn.close()
  }
}

// Coleta TODAS as linhas do resultado (o rodarSql só traz o preview) para enviar
// a algum destino. Cap de segurança pra não estourar a memória em resultados enormes.
export async function coletarLinhas(sql, max = 200000) {
  const db = await getDb()
  const conn = await db.connect()
  const clean = semPontoVirgula(sql)
  try {
    const res = await conn.query(`SELECT * FROM (${clean}) LIMIT ${max}`)
    const linhas = res.toArray().map((r) => {
      const o = r.toJSON()
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (typeof v === 'bigint') o[k] = v.toString()
        else if (v instanceof Date) o[k] = v.toISOString().slice(0, 10)
      }
      return o
    })
    return linhas
  } finally {
    await conn.close()
  }
}

// Exporta o resultado do SQL como CSV. O DuckDB grava num arquivo virtual (COPY)
// e devolvemos o buffer, que é escrito no arquivo escolhido pelo usuário.
export async function exportarSql(sql, sugestaoNome = 'recorte.csv') {
  const db = await getDb()
  const outHandle = await window.showSaveFilePicker({
    suggestedName: sugestaoNome,
    types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
  })
  const conn = await db.connect()
  const clean = semPontoVirgula(sql)
  try {
    try { await db.dropFile('result.csv') } catch { /* ainda não existe */ }
    await conn.query(`COPY (${clean}) TO 'result.csv' (HEADER, DELIMITER ',')`)
    const buf = await db.copyFileToBuffer('result.csv')
    const writable = await outHandle.createWritable()
    await writable.write(buf)
    await writable.close()
    try { await db.dropFile('result.csv') } catch { /* ignora */ }
    return outHandle.name
  } finally {
    await conn.close()
  }
}

// SQL pré-pronto — "Recorte do mês (CLT)": as regras de negócio da remessa.
// Robusto a formatos: TRY_CAST cobre DATE nativo OU texto DD/MM/AAAA, e valor
// numérico OU "1.234,56" (vírgula decimal). Se o auto-detect acertar os tipos,
// os TRY_CAST extras simplesmente não atrapalham.
export const SQL_RECORTE_CLT = `-- Recorte do mês (CLT) — Crédito do Trabalhador
-- Regras: convênio 400000 (único CLT) · vence NESTE mês · saldo em aberto · 1 linha por CPF.
-- NÃO usa MORA (não é calculada nesta remessa) e NÃO filtra atraso (educação ≠ cobrança).
-- "Privada vs. pública" é proxy pelo código do convênio; o CNPJ real exige Dataprev.
WITH b AS (
  SELECT *,
    COALESCE(TRY_CAST(DT_VCTO AS DATE),
             TRY_CAST(TRY_STRPTIME(CAST(DT_VCTO AS VARCHAR), '%d/%m/%Y') AS DATE)) AS _vcto,
    COALESCE(TRY_CAST(SALDO_DEVEDOR AS DOUBLE),
             TRY_CAST(replace(replace(CAST(SALDO_DEVEDOR AS VARCHAR), '.', ''), ',', '.') AS DOUBLE)) AS _saldo
  FROM base
)
SELECT * EXCLUDE (_vcto, _saldo)
FROM b
WHERE CAST(COD_EMPREGADOR AS VARCHAR) = '400000'
  AND _vcto >= date_trunc('month', current_date)
  AND _vcto <  date_trunc('month', current_date) + INTERVAL 1 MONTH
  AND _saldo > 0
QUALIFY row_number() OVER (PARTITION BY CPF ORDER BY _saldo DESC) = 1`
