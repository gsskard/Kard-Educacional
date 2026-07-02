import { Fragment, useEffect, useMemo, useState } from 'react'
import { listarEmpresas, enriquecerEmpresa, sugerirDominios, validarDominio } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'

// Seletor de domínio: mostra sugestões (Clearbit) + campo manual, pra o usuário
// escolher o domínio certo quando o nome é ambíguo (ex.: Kard, O Boticário).
function DomainPicker({ nome, onEscolher, onFechar }) {
  const [sug, setSug] = useState([])
  const [manual, setManual] = useState('')
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    let ativo = true
    sugerirDominios(nome).then((s) => { if (ativo) { setSug(s); setCarregando(false) } })
    return () => { ativo = false }
  }, [nome])
  return (
    <div className="dominio-picker">
      <div className="ajuda">Qual o domínio correto de <b>{nome}</b>?</div>
      {carregando ? (
        <div className="ajuda">buscando sugestões…</div>
      ) : sug.length > 0 ? (
        sug.map((s) => (
          <button key={s.domain} className="dom-opcao" onClick={() => onEscolher(s.domain)}>
            <CompanyLogo dominio={s.domain} nome={s.domain} size={20} />
            <span className="dom-nome">{s.domain}</span>
            <small>{s.total} e-mail(s)</small>
          </button>
        ))
      ) : (
        <div className="ajuda">Sem sugestões — digite o domínio abaixo.</div>
      )}
      <div className="dom-manual">
        <input placeholder="ex.: kard.com.br" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn-mini" disabled={!manual.trim()} onClick={() => onEscolher(manual.trim())}>usar</button>
        <button className="btn-mini" onClick={onFechar}>fechar</button>
      </div>
    </div>
  )
}

// Selo de validade do e-mail
function PillEmail({ valido }) {
  const v = String(valido || '').toLowerCase()
  if (v === 'valido' || v === 'valid') return <span className="pill pill-ok">VÁLIDO</span>
  if (v === 'invalido' || v === 'invalid') return <span className="pill pill-erro">INVÁLIDO</span>
  return <span className="pill pill-neutro">?</span>
}

// -------------------------------------------------------------------------
// Validação de domínio em lote
// Sobe um CSV com CNPJ / nome de empresa; para cada linha o n8n devolve os
// domínios candidatos (com a contagem de e-mails do Hunter — grátis), a logo
// e o palpite da IA (qual domínio é o corporativo mais provável + %).
// O analista escolhe o certo e clica "enriquecer" só nesse (aí sim gasta cota).
// -------------------------------------------------------------------------

// Lê um CSV simples (delimitador , ou ;). Aceita cabeçalho com colunas
// empresa/nome/razão social e cnpj; sem cabeçalho, adivinha pelas colunas.
function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!linhas.length) return []
  const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ','
  const split = (l) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
  const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const head = split(linhas[0]).map(norm)
  const colsEmp = ['empresa', 'nome', 'razaosocial', 'cliente', 'empregador']
  const temHeader = head.some((h) => colsEmp.includes(h) || h === 'cnpj')
  let idxEmp = -1, idxCnpj = -1
  if (temHeader) {
    idxEmp = head.findIndex((h) => colsEmp.includes(h))
    idxCnpj = head.findIndex((h) => h === 'cnpj')
  }
  const corpo = temHeader ? linhas.slice(1) : linhas
  const out = []
  for (const l of corpo) {
    const cols = split(l)
    let empresa = '', cnpj = ''
    if (temHeader) {
      empresa = idxEmp >= 0 ? (cols[idxEmp] || '') : ''
      cnpj = idxCnpj >= 0 ? (cols[idxCnpj] || '') : ''
    } else {
      const cnpjCol = cols.find((c) => c.replace(/\D/g, '').length >= 11)
      cnpj = cnpjCol || ''
      empresa = cols.find((c) => c && c !== cnpjCol) || cols[0] || ''
    }
    if (empresa) out.push({ empresa, cnpj })
  }
  return out
}

// Barra de probabilidade colorida (verde alto, âmbar médio, vermelho baixo)
function ProbBar({ valor }) {
  const p = Math.max(0, Math.min(100, Number(valor) || 0))
  const cor = p >= 70 ? 'var(--verde)' : p >= 40 ? 'var(--ambar)' : 'var(--vermelho)'
  return (
    <div className="prob">
      <div className="prob-bar"><span style={{ width: p + '%', background: cor }} /></div>
      <b style={{ color: cor }}>{p}%</b>
    </div>
  )
}

function ValidacaoLote({ onEnriquecido }) {
  const [entrada, setEntrada] = useState([])       // [{empresa, cnpj}]
  const [arquivo, setArquivo] = useState('')
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([]) // [{empresa,cnpj,candidatos,ia}]
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [msg, setMsg] = useState('')

  function carregarArquivo(ev) {
    const f = ev.target.files && ev.target.files[0]
    if (!f) return
    setArquivo(f.name)
    const leitor = new FileReader()
    leitor.onload = () => { setEntrada(parseCSV(String(leitor.result || ''))); setResultados([]) }
    leitor.readAsText(f)
  }

  function carregarTexto() {
    setEntrada(parseCSV(texto)); setResultados([]); setArquivo('')
  }

  async function validar() {
    if (!entrada.length) return
    setRodando(true); setMsg(''); setResultados([])
    const acc = []
    try {
      let n = 0
      for (const e of entrada) {
        setProgresso(`Analisando ${++n}/${entrada.length}: ${e.empresa}…`)
        try {
          const r = await validarDominio(e.empresa, e.cnpj)
          acc.push(r || { empresa: e.empresa, cnpj: e.cnpj, candidatos: [], ia: {} })
        } catch (err) {
          acc.push({ empresa: e.empresa, cnpj: e.cnpj, candidatos: [], ia: {}, erro: err.message })
        }
        setResultados([...acc])
        await new Promise((r) => setTimeout(r, 400))
      }
      setProgresso('')
      setMsg(`Concluído: ${acc.length} empresa(s) analisada(s).`)
    } finally {
      setRodando(false)
    }
  }

  // Enriquece de fato o domínio escolhido (gasta cota do Hunter) e joga na aba Empresas.
  async function usarDominio(r, dominio) {
    setMsg(`Enriquecendo "${r.empresa}" pelo domínio ${dominio}… aparecerá na aba Empresas em instantes.`)
    try {
      await enriquecerEmpresa(r.empresa, r.cnpj, true, dominio)
      setMsg(`"${r.empresa}" enviada para enriquecimento com ${dominio}. Veja na aba "Empresas enriquecidas".`)
      if (onEnriquecido) onEnriquecido()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  function baixarCSV() {
    const linhas = [['empresa', 'cnpj', 'melhor_dominio_ia', 'probabilidade', 'justificativa', 'candidatos']]
    for (const r of resultados) {
      const cands = (r.candidatos || []).map((c) => `${c.domain}(${c.total})`).join(' | ')
      linhas.push([
        r.empresa || '', r.cnpj || '', r.ia?.melhor_dominio || '',
        String(r.ia?.probabilidade ?? ''), (r.ia?.justificativa || '').replace(/"/g, "'"), cands,
      ])
    }
    const csv = linhas.map((l) => l.map((c) => `"${String(c)}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'validacao-dominios.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <p className="ajuda">
        Suba um CSV com <b>CNPJ</b> e <b>nome da empresa</b> (colunas <code>empresa</code> e <code>cnpj</code>).
        Para cada uma, trazemos os domínios candidatos com a contagem de e-mails, a logo e o
        palpite da IA (qual é o domínio corporativo mais provável). Isso <b>não gasta</b> cota do Hunter —
        só quando você clicar em <b>enriquecer</b> o domínio escolhido.
      </p>

      {msg && <div className="banner">{msg}</div>}

      <div className="lote-entrada">
        <label className="btn-secundario arquivo-label">
          Escolher CSV
          <input type="file" accept=".csv,text/csv" onChange={carregarArquivo} hidden />
        </label>
        {arquivo && <span className="arquivo-nome">{arquivo}</span>}
        <span className="ajuda">ou cole abaixo (uma empresa por linha):</span>
      </div>
      <textarea
        className="lote-textarea"
        placeholder={'empresa;cnpj\nMagazine Luiza;47.960.950/0001-21\nO Boticário;'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
      />
      <div className="toolbar">
        <button className="btn-refresh" onClick={carregarTexto} disabled={!texto.trim()}>Ler texto colado</button>
        <button className="btn-primario" onClick={validar} disabled={rodando || !entrada.length}>
          {rodando ? 'Analisando…' : `Validar ${entrada.length || ''} empresa(s)`}
        </button>
        {resultados.length > 0 && !rodando && (
          <button className="btn-refresh" onClick={baixarCSV}>Baixar resultado (CSV)</button>
        )}
      </div>

      {progresso && <div className="loading">{progresso}</div>}

      {resultados.length > 0 && (
        <div className="lote-resultados">
          {resultados.map((r, i) => {
            const melhor = r.ia?.melhor_dominio || (r.candidatos && r.candidatos[0]?.domain) || ''
            return (
              <div className="lote-card" key={(r.cnpj || '') + r.empresa + i}>
                <div className="lote-topo">
                  <CompanyLogo dominio={melhor} nome={r.empresa} size={44} />
                  <div className="empresa-id">
                    <div className="empresa-nome">{r.empresa}</div>
                    <div className="empresa-cnpj">{r.cnpj || 'CNPJ —'}</div>
                  </div>
                  {r.ia?.probabilidade > 0 && (
                    <div className="lote-ia-resumo">
                      <small>palpite da IA</small>
                      <ProbBar valor={r.ia.probabilidade} />
                    </div>
                  )}
                </div>

                {r.ctx && (r.ctx.categoria || r.ctx.localizacao || r.ctx.razao_social) && (
                  <div className="lote-ctx">
                    {r.ctx.nome_fantasia && r.ctx.nome_fantasia.toLowerCase() !== (r.empresa || '').toLowerCase() && (
                      <span className="ctx-item">🏢 {r.ctx.nome_fantasia}</span>
                    )}
                    {r.ctx.categoria && <span className="ctx-item">{r.ctx.categoria}</span>}
                    {r.ctx.localizacao && <span className="ctx-item">📍 {r.ctx.localizacao}</span>}
                  </div>
                )}

                {r.erro ? (
                  <div className="ajuda">⏳ {r.erro}</div>
                ) : (r.candidatos && r.candidatos.length > 0) ? (
                  <>
                    {r.ia?.melhor_dominio && (
                      <div className="ia-box">
                        <span className="pill pill-ok">IA: {r.ia.melhor_dominio}</span>
                        {r.ia.justificativa && <span className="ia-just">{r.ia.justificativa}</span>}
                      </div>
                    )}
                    <div className="cand-chips">
                      {r.candidatos.map((c) => {
                        const eMelhor = c.domain === melhor
                        return (
                          <button
                            key={c.domain}
                            className={'cand-chip' + (eMelhor ? ' melhor' : '')}
                            title={`Enriquecer ${r.empresa} usando ${c.domain}`}
                            onClick={() => usarDominio(r, c.domain)}
                          >
                            <CompanyLogo dominio={c.domain} nome={c.domain} size={20} />
                            <span className="dom-nome">{c.domain}</span>
                            <small>{c.total} e-mail(s)</small>
                            {c.oficial && <span className="chip-tag oficial" title="domínio do e-mail oficial na Receita">Receita</span>}
                            {eMelhor && !c.oficial && <span className="chip-tag">★</span>}
                          </button>
                        )
                      })}
                    </div>
                    <div className="ajuda">Clique num domínio para enriquecê-lo e trazer os dados/e-mails de RH para a aba Empresas.</div>
                  </>
                ) : (
                  <div className="ajuda">Nenhum domínio candidato encontrado para este nome.</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Tela de Empresas (RF-09/10/33/37): empresas enriquecidas via Hunter —
// logo, CNPJ, domínio/site, localização, nº de funcionários, categoria e os
// e-mails de RH com cargo/validade. Duas visões: Cartões e Tabela (tipo Excel).
// Aba extra: Validação de domínio em lote (CSV → candidatos + IA).

export default function Empresas() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState('empresas')       // 'empresas' | 'lote'
  const [view, setView] = useState('cards')         // 'cards' | 'tabela'
  const [expandido, setExpandido] = useState(() => new Set())
  const [emLote, setEmLote] = useState(false)
  const [pickerKey, setPickerKey] = useState(null)  // card com o seletor de domínio aberto

  async function carregar() {
    setLoading(true); setErro('')
    try {
      setRows(await listarEmpresas())
    } catch (e) {
      setErro('Ainda não consigo ler as empresas do n8n (' + e.message + ').')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((e) =>
      [e.empresa, e.cnpj, e.dominio, e.localizacao].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  function toggleLinha(k) {
    setExpandido((prev) => {
      const s = new Set(prev)
      s.has(k) ? s.delete(k) : s.add(k)
      return s
    })
  }

  // Enriquece TODAS as empresas. Sem forçar: as que já estão no cache Redis
  // não gastam crédito; as que faltam (ex.: sem localização) vão ao Hunter.
  async function enriquecerTudo() {
    if (!window.confirm(`Enriquecer as ${rows.length} empresas? As que já estão no cache não gastam crédito; as novas consultam o Hunter.`)) return
    setEmLote(true); setMsg('')
    try {
      let n = 0
      for (const e of rows) {
        setMsg(`Enriquecendo ${++n}/${rows.length}: ${e.empresa}…`)
        await enriquecerEmpresa(e.empresa, e.cnpj, false, e.dominio)
        await new Promise((r) => setTimeout(r, 800))
      }
      setMsg('Enriquecimento em lote concluído. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    } finally {
      setEmLote(false)
    }
  }

  // reenriquecer força nova busca no Hunter (ignora o cache Redis)
  async function enriquecer(e) {
    try {
      setMsg(`Reenriquecendo "${e.empresa}" via Hunter (ignorando cache)...`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true, e.dominio)
      setMsg('Enriquecimento atualizado. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  // usa o domínio escolhido pelo usuário e reenriquece por esse domínio
  async function escolherDominio(e, dominio) {
    setPickerKey(null)
    try {
      setMsg(`Reenriquecendo "${e.empresa}" pelo domínio ${dominio}...`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true, dominio)
      setMsg('Domínio atualizado. Clique em Atualizar em instantes.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Empresas</h1></header>

      <div className="view-toggle abas-topo">
        <button className={aba === 'empresas' ? 'ativo' : ''} onClick={() => setAba('empresas')}>Empresas enriquecidas</button>
        <button className={aba === 'lote' ? 'ativo' : ''} onClick={() => setAba('lote')}>Validação de domínio em lote</button>
      </div>

      {aba === 'lote' ? (
        <ValidacaoLote onEnriquecido={carregar} />
      ) : (
      <>
      <p className="ajuda">Empresas enriquecidas via Hunter: domínio, site, localização, nº de funcionários, categoria, logo e e-mails de RH com cargo (RF-09/10/37).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <input placeholder="Buscar empresa, CNPJ, domínio ou local..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
        <button className="btn-primario" disabled={emLote || rows.length === 0} onClick={enriquecerTudo}>
          {emLote ? 'Enriquecendo…' : 'Enriquecer tudo'}
        </button>
        <div className="view-toggle">
          <button className={view === 'cards' ? 'ativo' : ''} onClick={() => setView('cards')}>Cartões</button>
          <button className={view === 'tabela' ? 'ativo' : ''} onClick={() => setView('tabela')}>Tabela</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="secao"><div className="empty">Nenhuma empresa enriquecida ainda.</div></div>
      ) : view === 'cards' ? (
        <div className="empresas-grid">
          {visiveis.map((e, i) => (
            <div className="empresa-card" key={e.cnpj || e.empresa || i}>
              <div className="empresa-topo">
                <CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={48} />
                <div className="empresa-id">
                  <div className="empresa-nome">{e.empresa || '—'}</div>
                  <div className="empresa-cnpj">{e.cnpj || 'CNPJ —'}</div>
                </div>
              </div>

              <div className="empresa-linha">
                <span className="chave">Domínio</span>
                <span className="dom-linha">
                  {e.dominio || '—'}
                  <button className="link-mini" onClick={() => setPickerKey(pickerKey === (e.cnpj || e.empresa || i) ? null : (e.cnpj || e.empresa || i))}>trocar</button>
                </span>
              </div>
              {pickerKey === (e.cnpj || e.empresa || i) && (
                <DomainPicker nome={e.empresa} onEscolher={(dom) => escolherDominio(e, dom)} onFechar={() => setPickerKey(null)} />
              )}
              <div className="empresa-linha"><span className="chave">Site</span>{e.site ? <a href={e.site} target="_blank" rel="noreferrer">{e.site}</a> : <span>—</span>}</div>
              <div className="empresa-linha"><span className="chave">Localização</span><span>{e.localizacao || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Funcionários</span><span>{e.funcionarios || '—'}</span></div>
              <div className="empresa-linha"><span className="chave">Categoria</span><span>{e.categoria || '—'}</span></div>

              <div className="empresa-rh">
                <div className="chave">E-mails de RH ({(e.emails_rh || []).length})</div>
                {(e.emails_rh && e.emails_rh.length > 0) ? (
                  e.emails_rh.map((em, j) => (
                    <div className="rh-item" key={j}>
                      <span className="rh-info">
                        <span>{em.email || em}</span>
                        {em.cargo && <small className="rh-cargo">{em.cargo}</small>}
                      </span>
                      <PillEmail valido={em.valido} />
                    </div>
                  ))
                ) : (
                  <span className="ajuda">nenhum e-mail encontrado</span>
                )}
              </div>

              <div className="acoes">
                <button className="btn-mini" onClick={() => enriquecer(e)}>reenriquecer</button>
                {e.enriquecido_em && <span className="ajuda">enriquecido em {e.enriquecido_em}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-wrap">
          <table className="preview">
            <thead>
              <tr>
                <th></th><th>Empresa</th><th>CNPJ</th><th>Localização</th>
                <th>Funcionários</th><th>Categoria</th><th>Domínio</th>
                <th>E-mails RH</th><th>Enriquecido</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((e, i) => {
                const k = e.cnpj || e.empresa || String(i)
                const aberto = expandido.has(k)
                const emails = e.emails_rh || []
                return (
                  <Fragment key={k}>
                    <tr className="linha-empresa" onClick={() => toggleLinha(k)}>
                      <td>{emails.length > 0 ? (aberto ? '▾' : '▸') : ''}</td>
                      <td><span className="empresa-cel"><CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={24} />{e.empresa || '—'}</span></td>
                      <td>{e.cnpj || '—'}</td>
                      <td>{e.localizacao || '—'}</td>
                      <td>{e.funcionarios || '—'}</td>
                      <td>{e.categoria || '—'}</td>
                      <td>{e.dominio || '—'}</td>
                      <td>{emails.length}</td>
                      <td>{e.enriquecido_em || '—'}</td>
                    </tr>
                    {aberto && emails.length > 0 && (
                      <tr className="linha-detalhe">
                        <td></td>
                        <td colSpan={8}>
                          <table className="sub">
                            <thead><tr><th>E-mail</th><th>Cargo</th><th>Departamento</th><th>Validade</th></tr></thead>
                            <tbody>
                              {emails.map((em, j) => (
                                <tr key={j}>
                                  <td>{em.email || '—'}</td>
                                  <td>{em.cargo || '—'}</td>
                                  <td>{em.departamento || '—'}</td>
                                  <td><PillEmail valido={em.valido} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <small className="ajuda">Clique numa linha para ver os cargos encontrados.</small>
        </div>
      )}
      </>
      )}
    </div>
  )
}
