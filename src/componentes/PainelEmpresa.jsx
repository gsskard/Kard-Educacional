import { useEffect, useState } from 'react'
import CompanyLogo from './CompanyLogo'
import { enriquecerEmpresa, sugerirDominios, rhRevelar } from '../api/n8n'
import { nomeProprio, formatarCnpj } from '../lib/formato'

// Painel lateral ÚNICO (gaveta estilo HubSpot) com o "perfil" da empresa.
// É autossuficiente: chama os serviços por dentro (desbloquear e-mail, trocar
// domínio, reenriquecer). Usado igual nas telas Empresas e Contatos.
// Props:
//   empresa      → objeto da empresa (inclui rh_contatos: [{id,nome,cargo,email,valido,eh_rh}])
//   aoFechar()   → fecha o painel
//   aoAtualizar()→ recarrega a lista do pai após uma ação (revelar/trocar/reenriquecer)

// Cargos-alvo padrão (definem quem é marcado como RH). Editáveis por empresa.
const CARGOS_PADRAO = ['RH', 'Recursos Humanos', 'DP', 'Departamento Pessoal', 'Gente e Gestão', 'Financeiro', 'Jurídico', 'Contabilidade']

// Selo de validade do e-mail
function PillEmail({ valido }) {
  const v = String(valido || '').toLowerCase()
  if (v === 'valido' || v === 'valid') return <span className="pill pill-ok">VÁLIDO</span>
  if (v === 'invalido' || v === 'invalid') return <span className="pill pill-erro">INVÁLIDO</span>
  return <span className="pill pill-neutro">?</span>
}

// Troca de domínio: candidatos salvos (Snov) + sugestões ao vivo (Hunter) + manual.
function TrocaDominio({ empresa, onEnriquecer, onFechar }) {
  const [manual, setManual] = useState('')
  const [live, setLive] = useState(null)
  useEffect(() => {
    let ativo = true
    sugerirDominios(empresa.empresa).then((s) => { if (ativo) setLive(s || []) }).catch(() => { if (ativo) setLive([]) })
    return () => { ativo = false }
  }, [empresa.empresa])

  const mapa = new Map()
  for (const c of (empresa.candidatos || [])) {
    mapa.set(c.domain, { domain: c.domain, count: c.emails ?? 0, oficial: c.oficial === true })
  }
  for (const s of (live || [])) {
    const ex = mapa.get(s.domain)
    if (ex) { if (ex.count == null) ex.count = s.total }
    else mapa.set(s.domain, { domain: s.domain, count: s.total ?? 0, oficial: false })
  }
  const cands = [...mapa.values()].sort((a, b) => (b.count || 0) - (a.count || 0))

  return (
    <div className="dominio-picker">
      <div className="ajuda">
        Domínios de <b>{nomeProprio(empresa.empresa)}</b> — o número é de e-mails públicos (grátis).
        <b> Enriquecer</b> busca os contatos de RH na Snov e <b>gasta crédito</b>.
      </div>
      {live === null ? (
        <div className="ajuda">buscando domínios…</div>
      ) : cands.length > 0 ? (
        cands.map((c) => (
          <div key={c.domain} className={'dom-cand' + (c.domain === empresa.dominio ? ' atual' : '')}>
            <CompanyLogo dominio={c.domain} nome={c.domain} size={20} />
            <span className="dom-nome">{c.domain}{c.oficial ? ' ★' : ''}</span>
            <small>{c.count ?? 0} e-mail(s)</small>
            <button className="btn-mini" onClick={() => onEnriquecer(c.domain)}>enriquecer</button>
          </div>
        ))
      ) : (
        <div className="ajuda">Sem candidatos — digite o domínio abaixo e clique em usar.</div>
      )}
      <div className="dom-manual">
        <input placeholder="ex.: kard.com.br" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn-mini" disabled={!manual.trim()} onClick={() => onEnriquecer(manual.trim())}>usar</button>
        <button className="btn-mini" onClick={onFechar}>fechar</button>
      </div>
    </div>
  )
}

export default function PainelEmpresa({ empresa, aoFechar, aoAtualizar }) {
  // cargos-alvo salvos por empresa (chave = CNPJ; cai no nome se faltar)
  const cargoKey = 'kard_cargos_' + (String(empresa?.cnpj || '').replace(/\D/g, '') || empresa?.empresa || 'geral')
  const [picker, setPicker] = useState(false)
  const [revelando, setRevelando] = useState(() => new Set())
  const [aviso, setAviso] = useState('')
  const [tags, setTags] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(cargoKey) || 'null'); if (Array.isArray(s) && s.length) return s } catch { /* ignora */ }
    return CARGOS_PADRAO
  })
  const [novoCargo, setNovoCargo] = useState('')
  const [expandido, setExpandido] = useState(false)

  if (!empresa) return null
  const e = empresa

  function salvarTags(novas) {
    setTags(novas)
    try { localStorage.setItem(cargoKey, JSON.stringify(novas)) } catch { /* ignora */ }
  }
  function addCargo() {
    const t = novoCargo.trim()
    if (!t) return
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) salvarTags([...tags, t])
    setNovoCargo('')
  }
  function removerCargo(t) { salvarTags(tags.filter((x) => x !== t)) }
  const contatos = e.rh_contatos || []
  const totalProspects = e.total_prospects ?? contatos.length
  const totalRh = e.total_rh ?? contatos.filter((c) => c.eh_rh).length

  const recarregar = () => { aoAtualizar && aoAtualizar() }

  async function desbloquear(contato) {
    if (revelando.has(contato.id)) return
    if (!window.confirm(`Desbloquear o e-mail de ${contato.nome || 'este contato'}?\nGasta 1 crédito Snov (se o e-mail for encontrado).`)) return
    setRevelando((prev) => new Set(prev).add(contato.id))
    try {
      await rhRevelar(e.cnpj, [contato.id], 'selecionados')
      recarregar()
    } catch (err) {
      setAviso('⏳ ' + err.message)
    } finally {
      setRevelando((prev) => { const s = new Set(prev); s.delete(contato.id); return s })
    }
  }

  async function escolherDominio(dominio) {
    setPicker(false)
    try {
      setAviso(`Reenriquecendo pelo domínio ${dominio}…`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true, dominio, tags)
      setAviso('Domínio atualizado. Atualizando em instantes…')
      recarregar()
    } catch (err) {
      setAviso('⏳ ' + err.message)
    }
  }

  async function reenriquecer() {
    try {
      setAviso(`Reenriquecendo "${e.empresa}"…`)
      await enriquecerEmpresa(e.empresa, e.cnpj, true, e.dominio, tags)
      setAviso('Enriquecimento atualizado. Atualizando em instantes…')
      recarregar()
    } catch (err) {
      setAviso('⏳ ' + err.message)
    }
  }

  return (
    <>
      <div className="painel-backdrop" onClick={aoFechar} />
      <aside
        className={'painel-empresa' + (expandido ? ' painel-expandido' : '')}
        role="dialog"
        aria-label={'Empresa ' + (e.empresa || '')}
      >
        <header className="painel-topo">
          <CompanyLogo dominio={e.dominio} logo={e.logo} nome={e.empresa} size={44} />
          <div className="painel-titulo">
            <strong>{nomeProprio(e.empresa) || '—'}</strong>
            {e.cnpj && <small>{formatarCnpj(e.cnpj)}</small>}
          </div>
          <button
            className="painel-fechar"
            onClick={() => setExpandido((v) => !v)}
            aria-label={expandido ? 'Recolher' : 'Expandir'}
            title={expandido ? 'Recolher' : 'Expandir para página'}
          >{expandido ? '⤡' : '⤢'}</button>
          <button className="painel-fechar" onClick={aoFechar} aria-label="Fechar">✕</button>
        </header>

        <div className="painel-corpo">
          {aviso && <div className="banner">{aviso}</div>}

          <div className="empresa-linha">
            <span className="chave">Domínio</span>
            <span className="dom-linha">
              {e.dominio || '—'}
              {e.dominio_count != null && <small className="dom-count">· {e.dominio_count} e-mail(s)</small>}
              <button className="link-mini" onClick={() => setPicker((v) => !v)}>trocar</button>
            </span>
          </div>
          {picker && (
            <TrocaDominio
              empresa={e}
              onEnriquecer={(dom) => {
                if (window.confirm(`Enriquecer "${e.empresa}" pelo domínio ${dom}?\nIsso busca os contatos de RH na Snov e gasta crédito.`)) escolherDominio(dom)
              }}
              onFechar={() => setPicker(false)}
            />
          )}
          <div className="empresa-linha"><span className="chave">Site</span>{e.site ? <a href={e.site} target="_blank" rel="noreferrer">{e.site}</a> : <span>{e.dominio ? <a href={'https://' + e.dominio} target="_blank" rel="noreferrer">{'https://' + e.dominio}</a> : '—'}</span>}</div>
          <div className="empresa-linha"><span className="chave">Localização</span><span>{e.localizacao || '—'}</span></div>
          <div className="empresa-linha"><span className="chave">Porte</span><span>{e.porte || '—'}</span></div>
          <div className="empresa-linha"><span className="chave">Capital social</span><span>{e.capital_social || '—'}</span></div>
          <div className="empresa-linha"><span className="chave">Categoria</span><span>{e.categoria || '—'}</span></div>

          <div className="empresa-rh">
            <div className="chave">
              Contatos encontrados: {totalProspects}
              {totalRh > 0 && <span className="tag-rh"> · {totalRh} de RH</span>}
            </div>
            <div className="cargos-alvo">
              {tags.map((t) => (
                <span className="hashtag" key={t}>
                  {t}
                  <button type="button" className="tag-x" title="remover cargo" onClick={() => removerCargo(t)}>×</button>
                </span>
              ))}
              <input
                className="cargo-add"
                value={novoCargo}
                onChange={(ev) => setNovoCargo(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCargo() } }}
                onBlur={addCargo}
                placeholder="+ cargo"
              />
            </div>
            <small className="ajuda">Esses cargos definem quem é marcado como <b>RH</b>. Edite e clique em <b>reenriquecer</b> pra reclassificar (fica salvo por empresa).</small>
            {contatos.length > 0 ? (
              <div className="rh-lista">
                {contatos.map((c, i) => (
                  <div className={'rh-linha' + (c.eh_rh ? ' rh-alvo' : '')} key={c.id ?? i}>
                    <span className="rh-info">
                      <span className="rh-nome">
                        {nomeProprio(c.nome) || '—'}
                        {c.eh_rh && <span className="tag-rh-mini">RH</span>}
                      </span>
                      <small className="rh-cargo">{c.cargo || '—'}</small>
                    </span>
                    {c.email ? (
                      <span className="rh-email-ok">
                        <a href={`mailto:${c.email}`}>{c.email}</a>
                        <PillEmail valido={c.valido} />
                      </span>
                    ) : (
                      <button
                        className="btn-olho"
                        title="Desbloquear e-mail (1 crédito Snov)"
                        disabled={revelando.has(c.id)}
                        onClick={() => desbloquear(c)}
                      >
                        {revelando.has(c.id) ? '…' : (
                          <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            desbloquear
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : totalProspects > 0 ? (
              <span className="ajuda">Contatos encontrados, mas nenhum classificado como RH neste domínio. Use “trocar” pra revisar o domínio.</span>
            ) : (
              <span className="ajuda">Nenhum contato encontrado para este domínio.</span>
            )}
          </div>

          <div className="acoes">
            <button className="btn-mini" onClick={reenriquecer}>reenriquecer</button>
            {e.enriquecido_em && <span className="ajuda">enriquecido em {e.enriquecido_em}</span>}
          </div>
        </div>
      </aside>
    </>
  )
}
