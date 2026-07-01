import { ETAPAS_ORDEM, ETAPAS } from '../config/etapas'

// Configurações / Admin (RF-22 / seção 8, item 7).
// Cadastro das inboxes por etapa e credenciais das integrações.
// Estrutura visual pronta; a gravação segura fica no n8n / cofre (RNF-01),
// nunca no código do front — por isso os campos aqui são só o esqueleto.

export default function Configuracoes() {
  return (
    <div>
      <header className="pagina-head"><h1>Configurações</h1></header>
      <p className="ajuda">Onde ficam as inboxes por etapa e as integrações. Segredos ficam no n8n / cofre — nunca no front (RNF-01).</p>

      <section className="secao">
        <h2>Inboxes por etapa <small>(RF-22)</small></h2>
        <table className="preview">
          <thead><tr><th>Etapa</th><th>Chave da inbox</th><th>Remetente (e-mail)</th></tr></thead>
          <tbody>
            {ETAPAS_ORDEM.map((chave) => {
              const et = ETAPAS[chave]
              return (
                <tr key={chave}>
                  <td>{et.titulo}</td>
                  <td><code>{et.chaveConfigInbox}</code></td>
                  <td><input placeholder="preencher no n8n / admin" disabled /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="pendente">⏳ A gravação dessas configurações será feita por um workflow do n8n.</p>
      </section>

      <section className="secao">
        <h2>Integrações</h2>
        <ul className="lista-integracoes">
          <li><b>CyberTalk</b> — disparo de e-mail. Chave fica no n8n (Credential), não aqui.</li>
          <li><b>Snov.io</b> — enriquecimento de contatos. Chave fica no n8n.</li>
          <li><b>Banco (RDS)</b> — persistência/retroalimentação. Conexão no n8n. <span className="pendente">[A VALIDAR: engine]</span></li>
        </ul>
      </section>
    </div>
  )
}
