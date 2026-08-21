import { useState } from 'react'
import { enviarEmailEmpregadorTeste } from '../api/n8n'

// Painel de teste dos 2 modelos de e-mail para EMPREGADORES (educativo),
// disparados via CyberTalk (workflow "[TESTE CYBERTALK] E-mail Empregadores").
// Renderiza dentro de .disparos, então reaproveita os estilos escopados.

const MODELOS_EMP = [
  { id: 'repasse', nome: 'Repasse (dia 20)', assunto: 'Hoje (dia 20) é o prazo do repasse - Crédito do Trabalhador' },
  { id: 'escrituracao', nome: 'Prazo de escrituração', assunto: 'O prazo para a escrituração está quase vencendo' },
]

const EMAIL_PADRAO = 'gabriella.silva@kard.com.br'

// Exemplos prontos pra clicar e disparar rápido.
const EXEMPLOS = [
  { modelo: 'repasse', nome: 'Padaria Pão Quente LTDA', destino: EMAIL_PADRAO },
  { modelo: 'escrituracao', nome: 'Metalúrgica Silva ME', destino: EMAIL_PADRAO },
]

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)

export default function TesteEmpregadores() {
  const [modelo, setModelo] = useState('escrituracao')
  const [destino, setDestino] = useState(EMAIL_PADRAO)
  const [nome, setNome] = useState('Kard Teste LTDA')
  const [assunto, setAssunto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  const modeloAtual = MODELOS_EMP.find((m) => m.id === modelo) || MODELOS_EMP[0]

  function aplicarExemplo(ex) {
    setModelo(ex.modelo)
    setNome(ex.nome)
    setDestino(ex.destino)
    setAssunto('')
    setResultado(null)
    setErro('')
  }

  async function enviar() {
    if (!emailValido(destino) || !nome.trim()) return
    if (!window.confirm(`Enviar o modelo "${modeloAtual.nome}" para ${destino}?\n\nIsso dispara um e-mail de verdade pela CyberTalk.`)) return
    setEnviando(true)
    setResultado(null)
    setErro('')
    try {
      const r = await enviarEmailEmpregadorTeste({
        modelo,
        destino: destino.trim(),
        nome: nome.trim(),
        assunto: assunto.trim() || undefined,
      })
      setResultado(r)
    } catch (e) {
      setErro('Falha ao chamar o webhook: ' + e.message)
    } finally {
      setEnviando(false)
    }
  }

  const ok = resultado && resultado.status === 'aceito_pela_api'

  return (
    <div className="bloco">
      <h2>Teste — E-mail Empregadores <small>(2 modelos · CyberTalk)</small></h2>
      <p className="explica">
        Dispara um dos <b>2 modelos educativos</b> para empregadores e faz o merge do nome no HTML.
        <b> Envia um e-mail de verdade</b> para o destino informado — use um e-mail seu para testar.
      </p>

      <label className="campo"><span>Modelo</span>
        <select value={modelo} onChange={(e) => { setModelo(e.target.value); setResultado(null) }}>
          {MODELOS_EMP.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </label>
      <p className="ajuda">Assunto padrão: “{modeloAtual.assunto}”</p>

      <label className="campo"><span>Destino (e-mail)</span>
        <input type="text" value={destino} placeholder="voce@kard.com.br" onChange={(e) => setDestino(e.target.value)} />
      </label>
      <label className="campo"><span>Nome do empregador (merge do <span className="mono">*|NOME|*</span>)</span>
        <input type="text" value={nome} placeholder="ex.: Kard Teste LTDA" onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="campo"><span>Assunto (opcional — vazio usa o padrão)</span>
        <input type="text" value={assunto} placeholder={modeloAtual.assunto} onChange={(e) => setAssunto(e.target.value)} />
      </label>

      <div className="acoes" style={{ marginBottom: 8 }}>
        <button className="bt" disabled={enviando || !emailValido(destino) || !nome.trim()} onClick={enviar}>
          {enviando ? 'Enviando…' : 'Enviar teste'}
        </button>
      </div>

      <p className="ajuda" style={{ margin: '6px 0 8px' }}>Exemplos rápidos:</p>
      <div className="acoes">
        {EXEMPLOS.map((ex, i) => (
          <button key={i} className="bt claro mini" onClick={() => aplicarExemplo(ex)}>
            {MODELOS_EMP.find((m) => m.id === ex.modelo)?.nome} · {ex.nome}
          </button>
        ))}
      </div>

      {erro && <div className="erro-box" style={{ marginTop: 14 }}>{erro}</div>}

      {resultado && (
        <div className="banner" style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 6 }}>
            <span className={'st ' + (ok ? 'ok' : 'err')}>{ok ? 'aceito pela CyberTalk' : 'falha'}</span>
            <span style={{ marginLeft: 10, color: 'var(--fraco)' }}>HTTP {resultado.http_status ?? '—'}</span>
          </div>
          <div className="g-linha" style={{ padding: '6px 0' }}><span className="rot">Modelo</span><span className="val">{resultado.modelo}</span></div>
          <div className="g-linha" style={{ padding: '6px 0' }}><span className="rot">Destino</span><span className="val">{resultado.destino}</span></div>
          <div className="g-linha" style={{ padding: '6px 0' }}><span className="rot">Nome aplicado</span><span className="val">{resultado.nome_aplicado}</span></div>
          {resultado.communication_id && (
            <div className="g-linha" style={{ padding: '6px 0' }}><span className="rot">ID do envio</span><span className="val mono">{resultado.communication_id}</span></div>
          )}
          {ok && <p className="ajuda" style={{ margin: '8px 0 0' }}>{resultado.aviso || 'aceito ≠ entregue — a entrega aparece nos eventos da CyberTalk.'}</p>}
          {!ok && resultado.resposta && <p className="mono" style={{ margin: '8px 0 0', color: 'var(--fraco)', wordBreak: 'break-all' }}>{resultado.resposta}</p>}
        </div>
      )}
    </div>
  )
}
