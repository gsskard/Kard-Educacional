import { useEffect, useMemo, useRef, useState } from 'react'
import { listarContatos, listarEmpresas, enriquecerEmpresa, importarContatos } from '../api/n8n'
import CompanyLogo from '../componentes/CompanyLogo'

// Lê uma planilha CSV de contatos e devolve [{nome,cargo,empresa,cnpj,dominio,email}].
// Aceita cabeçalho (em qualquer ordem) ou, sem cabeçalho, tenta adivinhar as colunas.
function parseContatosCSV(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!linhas.length) return []
  const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ','
  const split = (l) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
  const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const head = split(linhas[0]).map(norm)
  const mapa = {
    nome: ['nome', 'name', 'contato', 'fullname', 'nomecompleto'],
    cargo: ['cargo', 'position', 'funcao', 'titulo', 'jobtitle'],
    empresa: ['empresa', 'company', 'razaosocial', 'cliente', 'empregador'],
    cnpj: ['cnpj'],
    dominio: ['dominio', 'site', 'url', 'website', 'link', 'pagina'],
    email: ['email', 'mail', 'emailaddress', 'endereco'],
  }
  const temHeader = head.some((h) => Object.values(mapa).some((alt) => alt.includes(h)))
  const idx = {}
  if (temHeader) for (const k of Object.keys(mapa)) idx[k] = head.findIndex((h) => mapa[k].includes(h))
  const corpo = temHeader ? linhas.slice(1) : linhas
  const out = []
  for (const l of corpo) {
    const cols = split(l)
    let reg
    if (temHeader) {
      reg = {
        nome: idx.nome >= 0 ? cols[idx.nome] || '' : '',
        cargo: idx.cargo >= 0 ? cols[idx.cargo] || '' : '',
        empresa: idx.empresa >= 0 ? cols[idx.empresa] || '' : '',
        cnpj: idx.cnpj >= 0 ? cols[idx.cnpj] || '' : '',
        dominio: idx.dominio >= 0 ? cols[idx.dominio] || '' : '',
        email: idx.email >= 0 ? cols[idx.email] || '' : '',
      }
    } else {
      // sem cabeçalho: adivinha e-mail (tem @), cnpj (>=11 dígitos), domínio (tem . sem @)
      const email = cols.find((c) => c.includes('@')) || ''
      const cnpj = cols.find((c) => c.replace(/\D/g, '').length >= 11) || ''
      const dominio = cols.find((c) => c !== email && /\./.test(c) && !c.includes('@') && c.replace(/\D/g, '').length < 11) || ''
      const resto = cols.filter((c) => c && c !== email && c !== cnpj && c !== dominio)
      reg = { nome: resto[0] || '', cargo: resto[1] || '', empresa: resto[2] || '', cnpj, dominio, email }
    }
    if (reg.nome || reg.email) out.push(reg)
  }
  return out
}

// Tela de Contatos (RF-33 a RF-38): a "casa" dos dados que retroalimentam
// o sistema. Lista os contatos (tabela cobranca) e CRUZA com as empresas já
// enriquecidas (tabela empresas) pela empresa do contato — assim o logo e o
// status de enriquecimento aparecem aqui também, conectando as duas abas.
// O enriquecimento é por EMPRESA (Hunter) e roda no n8n.

const chave = (nome) => String(nome || '').trim().toLowerCase()

export default function Contatos() {
  const [rows, setRows] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [msg, setMsg] = useState('')
  const [importando, setImportando] = useState(false)
  const inputArquivo = useRef(null)

  async function carregar() {
    setLoading(true); setErro('')
    // contatos primeiro: assim que chega, a tela já aparece
    try {
      const contatos = await listarContatos()
      setRows(contatos)
    } catch (e) {
      setErro('Não consegui carregar os contatos do n8n (' + e.message + ')')
    } finally {
      setLoading(false)
    }
    // empresas em paralelo, só para cruzar logo/enriquecimento — nunca trava a tela
    listarEmpresas().then(setEmpresas).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  // Mapa empresa (normalizada) -> dados enriquecidos, para cruzar com os contatos.
  const empresaPorNome = useMemo(() => {
    const m = new Map()
    for (const e of empresas) {
      const k = chave(e.empresa)
      if (k) m.set(k, e)
    }
    return m
  }, [empresas])

  const visiveis = useMemo(() => {
    // só contatos com e-mail desbloqueado
    const comEmail = rows.filter((r) => r.email && String(r.email).trim())
    const q = busca.trim().toLowerCase()
    if (!q) return comEmail
    return comEmail.filter((r) =>
      [r.nome, r.cargo, r.empresa, r.cnpj, r.email].some((c) => String(c || '').toLowerCase().includes(q))
    )
  }, [rows, busca])

  // Importa uma base de contatos (CSV) e salva no banco (rh_enriquecimento) via n8n.
  async function importarArquivo(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = '' // permite reimportar o mesmo arquivo
    if (!file) return
    try {
      const texto = await file.text()
      const contatos = parseContatosCSV(texto)
      if (contatos.length === 0) { setMsg('Não achei contatos na planilha. Use colunas: nome, cargo, empresa, cnpj, dominio, email.'); return }
      setImportando(true)
      setMsg(`Importando ${contatos.length} contato(s)…`)
      const resp = await importarContatos(contatos)
      const n = Array.isArray(resp) ? resp.length : contatos.length
      setMsg(`✓ ${n} contato(s) importado(s) e salvos no banco.`)
      carregar()
    } catch (e) {
      setMsg('Falha ao importar: ' + e.message)
    } finally {
      setImportando(false)
    }
  }

  // Exporta os contatos visíveis em CSV que o Excel abre (BOM UTF-8 + ; separador).
  function exportarExcel() {
    const cols = ['Nome', 'Cargo', 'Empresa', 'CNPJ', 'Domínio', 'E-mail', 'Status', 'Validado']
    const esc = (v) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[";\n]/.test(s) ? `"${s}"` : s
    }
    const simNao = (v) => (v === true || String(v).toLowerCase() === 'true' ? 'Sim' : 'Não')
    const linhas = visiveis.map((r) => [
      r.nome, r.cargo, r.empresa, r.cnpj, r.dominio, r.email, r.email_status, simNao(r.validado),
    ])
    const csv = [cols, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function alternar(id) {
    setSelecionados((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  // Enriquece as EMPRESAS (únicas) dos contatos escolhidos, via Hunter.
  async function enriquecerEmpresasDe(lista) {
    const alvo = [...new Map(
      lista.filter((r) => r.empresa).map((r) => [chave(r.empresa), r])
    ).values()]
    if (alvo.length === 0) { setMsg('Selecione contatos que tenham empresa.'); return }
    try {
      setMsg('Enriquecendo ' + alvo.length + ' empresa(s) via Hunter...')
      await Promise.all(alvo.map((r) => enriquecerEmpresa(r.empresa, r.cnpj_empregador || r.cnpj)))
      setMsg('Enriquecimento concluído. O logo e os e-mails já aparecem aqui e na aba Empresas.')
      carregar()
    } catch (err) {
      setMsg('⏳ ' + err.message)
    }
  }

  return (
    <div>
      <header className="pagina-head"><h1>Contatos</h1></header>
      <p className="ajuda">Base de contatos que retroalimenta o sistema (RF-15/33). O enriquecimento (Hunter) é por empresa e reflete na aba Empresas (RF-36).</p>

      {erro && <div className="banner">{erro}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="toolbar">
        <input placeholder="Buscar nome, empresa ou e-mail..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn-refresh" onClick={carregar}>Atualizar</button>
        <input ref={inputArquivo} type="file" accept=".csv,text/csv" onChange={importarArquivo} hidden />
        <button className="btn-refresh" disabled={importando} onClick={() => inputArquivo.current?.click()} title="Importar planilha de contatos (CSV) e salvar no banco">
          {importando ? 'Importando…' : 'Importar base'}
        </button>
        <button className="btn-refresh btn-excel" disabled={visiveis.length === 0} onClick={exportarExcel} title="Exportar Excel" aria-label="Exportar Excel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z" fill="#fff" stroke="#1D6F42" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M13 2v7h7" stroke="#1D6F42" strokeWidth="1.5" strokeLinejoin="round"/>
            <rect x="7" y="12" width="10" height="7" rx="1" fill="#1D6F42"/>
            <path d="M9.4 13.7l3.2 3.6M12.6 13.7l-3.2 3.6" stroke="#fff" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          className="btn-primario"
          disabled={selecionados.size === 0}
          onClick={() => enriquecerEmpresasDe(rows.filter((r) => selecionados.has(r.id)))}
        >
          Enriquecer empresas ({selecionados.size})
        </button>
      </div>

      {loading ? <div className="loading">Carregando…</div> : (
        <table className="preview">
          <thead>
            <tr>
              <th></th><th>Nome</th><th>Cargo</th><th>Empresa</th><th>CNPJ</th><th>Domínio</th><th>E-mail</th>
              <th>Enriquecimento</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r, i) => {
              const emp = empresaPorNome.get(chave(r.empresa))
              return (
                <tr key={r.id ?? i}>
                  <td><input type="checkbox" checked={selecionados.has(r.id)} onChange={() => alternar(r.id)} /></td>
                  <td>{r.nome || '—'}</td>
                  <td>{r.cargo || '—'}</td>
                  <td>
                    <span className="empresa-cel">
                      <CompanyLogo dominio={emp?.dominio || r.dominio} logo={emp?.logo} nome={r.empresa} size={24} />
                      {r.empresa || '—'}
                    </span>
                  </td>
                  <td>{r.cnpj || '—'}</td>
                  <td>{r.dominio || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td>
                    {emp
                      ? <span className="pill pill-ok">enriquecida{emp.enriquecido_em ? ' ' + emp.enriquecido_em : ''}</span>
                      : <span className="ajuda">não</span>}
                  </td>
                  <td><button className="btn-mini" onClick={() => enriquecerEmpresasDe([r])}>enriquecer</button></td>
                </tr>
              )
            })}
            {visiveis.length === 0 && <tr><td colSpan={9} className="empty">Nenhum contato.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
