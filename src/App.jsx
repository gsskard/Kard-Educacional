import { useEffect, useMemo, useState } from 'react'

const API = (import.meta.env.VITE_N8N_BASE || 'https://n8n.srv1759869.hstgr.cloud/webhook').replace(/\/$/, '')

const STAGES = [
  { key: 'Educativo', label: 'Educativo', color: '#639922' },
  { key: 'Cobranca 1', label: 'Cobrança 1', color: '#BA7517' },
  { key: 'Cobranca 2', label: 'Cobrança 2', color: '#E24B4A' },
]

const brl = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const fmtData = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleDateString('pt-BR')
}

export default function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const r = await fetch(`${API}/crm-cobranca/list`)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const data = await r.json()
      const lista = Array.isArray(data) ? data : data.data || []
      setRows(lista)
    } catch (e) {
      setErro(
        'Não consegui carregar os dados da API do n8n. Confira a VITE_N8N_BASE no .env e se o workflow "IA - Cobrança - API" está ativo. (' +
          e.message +
          ')'
      )
    } finally {
      setLoading(false)
    }
  }

  async function mover(row, etapaDestino) {
    setRows((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, etapa: etapaDestino } : x))
    )
    try {
      await fetch(`${API}/crm-cobranca/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, etapa: etapaDestino }),
      })
    } catch (e) {
      setErro('Falha ao mover o contato: ' + e.message)
      carregar()
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        String(r.nome || '').toLowerCase().includes(q) ||
        String(r.empresa || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q)
    )
  }, [rows, busca])

  const totalAberto = rows.reduce((s, r) => s + Number(r.valor || 0), 0)
  const emCobranca = rows.filter((r) => r.etapa && r.etapa !== 'Educativo').length

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1>Kard CRM — Régua de cobrança</h1>
          <small>Educativo e cobrança</small>
        </div>
        <button className="btn-refresh" onClick={carregar}>
          Atualizar
        </button>
      </div>

      {erro && <div className="banner">{erro}</div>}

      <div className="metrics">
        <div className="metric">
          <div className="label">Contatos</div>
          <div className="value">{rows.length}</div>
        </div>
        <div className="metric">
          <div className="label">Valor em aberto</div>
          <div className="value">{brl(totalAberto)}</div>
        </div>
        <div className="metric">
          <div className="label">Em cobrança</div>
          <div className="value">{emCobranca}</div>
        </div>
        <div className="metric">
          <div className="label">Educativo</div>
          <div className="value">
            {rows.filter((r) => r.etapa === 'Educativo').length}
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar nome, empresa ou email..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Carregando…</div>
      ) : (
        <div className="board">
          {STAGES.map((stage, si) => {
            const items = visiveis.filter((r) => (r.etapa || 'Educativo') === stage.key)
            return (
              <div key={stage.key}>
                <div className="col-head" style={{ background: stage.color + '22' }}>
                  <span style={{ color: stage.color }}>
                    {si + 1}. {stage.label}
                  </span>
                  <span className="count" style={{ background: stage.color }}>
                    {items.length}
                  </span>
                </div>

                {items.length === 0 && <div className="empty">—</div>}

                {items.map((row) => {
                  const proxima = STAGES[si + 1]
                  return (
                    <div
                      key={row.id}
                      className="card"
                      style={{ borderLeft: `3px solid ${stage.color}` }}
                    >
                      <div className="top">
                        <span className="nome">{row.nome || 'Sem nome'}</span>
                        <span className="valor" style={{ color: stage.color }}>
                          {brl(row.valor)}
                        </span>
                      </div>
                      <div className="empresa">{row.empresa || '—'}</div>
                      <div className="venc">vence {fmtData(row.vencimento)}</div>
                      {row.status_envio && (
                        <span className="status">{row.status_envio}</span>
                      )}
                      <div className="actions">
                        {si > 0 ? (
                          <button onClick={() => mover(row, STAGES[si - 1].key)}>
                            ◀ voltar
                          </button>
                        ) : (
                          <span />
                        )}
                        {proxima ? (
                          <button
                            className={si === 1 ? 'manual' : 'adv'}
                            onClick={() => mover(row, proxima.key)}
                          >
                            {proxima.label} ▶
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: '#9aa191' }}>final</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
