import { api } from './ApiClient'

// Serviço do ETL — envia o resultado tratado (pequeno) para o n8n guardar.
//   POST /etl-salvar  { regra, arquivo, linhas, dados }
//     dados: string JSON com as linhas do resultado
//   → grava na Data Table etl_resultados e responde { ok, id }
export class EtlService {
  constructor(cliente = api) {
    this.api = cliente
  }

  salvarResultado({ regra, arquivo, linhas, dados }) {
    return this.api.post('/etl-salvar', { regra, arquivo, linhas, dados })
  }
}

export const etlService = new EtlService()
