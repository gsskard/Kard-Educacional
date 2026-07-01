import { useEffect, useState } from 'react'
import { listarContatos } from '../api/n8n'
import { ETAPAS, ETAPAS_ORDEM } from '../config/etapas'
import { irPara } from '../hooks/useHashRoute'

// Home / Dashboard (RF-30/32): funil por etapa + números gerais.
// Lê os contatos reais do n8n (workflow API que já existe).

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export default function Dashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    (async () => {
      try { setRows(await listarContatos()) }
      catch (e) { setErro('Não consegui carregar do n8n (' + e.message + '). Confira a VITE_N8N_BASE e o workflow "IA - Cobrança - API".') }
      finally { setLoading(false) }
    })()
  }, [])

  const totalAberto = rows.reduce((s, r) => s + Number(r.valor || 0), 0)

  return (
    <div>
      <header className="pagina-head"><h1>Dashboard</h1></header>

      {erro && <div className="banner">{erro}</div>}

      <div className="metrics">
        <div className="metric"><div className="label">Contatos</div><div className="value">{rows.length}</div></div>
        <div className="metric"><div className="label">Valor em aberto</div><div className="value">{brl(totalAberto)}</div></div>
        <div className="metric"><div className="label">Etapas ativas</div><div className="value">{ETAPAS_ORDEM.length}</div></div>
      </div>

      <h2 className="secao-titulo">Funil por etapa</h2>
      {loading ? <div className="loading">Carregando…</div> : (
        <div className="funil">
          {ETAPAS_ORDEM.map((chave) => {
            const et = ETAPAS[chave]
            const qtd = rows.filter((r) => (r.etapa || 'Educacional 1') === et.valorEtapa).length
            return (
              <button key={chave} className="funil-card" style={{ borderTopColor: et.cor }} onClick={() => irPara(chave)}>
                <div className="funil-num" style={{ color: et.cor }}>{qtd}</div>
                <div className="funil-label">{et.ordem}. {et.titulo}</div>
                <div className="ajuda">abrir etapa →</div>
              </button>
            )
          })}
        </div>
      )}

      <p className="ajuda" style={{ marginTop: 20 }}>
        Fase 2 acrescenta aqui a tela de <b>Analytics</b> (taxas de abertura/clique por etapa e inbox).
      </p>
    </div>
  )
}
