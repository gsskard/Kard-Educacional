// Fachada de compatibilidade (camada de view).
// A implementação real agora mora em serviços OOP (src/services) + modelos (src/models):
//   ApiClient  -> rede (fetch, base URL, erros)
//   CobrancaService / EmpresasService -> regras de cada domínio
//   Empresa / Contato -> modelos
// Este arquivo só reexporta funções finas para as telas não precisarem mudar os imports.
// (Pode migrar as telas para usar os serviços direto no futuro.)
import { api } from '../services/ApiClient'
import { cobrancaService } from '../services/CobrancaService'
import { empresasService } from '../services/EmpresasService'

// --- Cobrança / contatos ---
export const listarContatos = () => cobrancaService.listarContatos()
export const moverContato = (id, etapa) => cobrancaService.moverContato(id, etapa)
export const importarCarga = (etapa, registros) => cobrancaService.importarCarga(etapa, registros)
export const dispararEtapa = (etapa, modelo) => cobrancaService.dispararEtapa(etapa, modelo)

// --- Empresas ---
export const listarEmpresas = () => empresasService.listarEmpresas()
export const enriquecerEmpresa = (empresa, cnpj, forcar, dominio) =>
  empresasService.enriquecerEmpresa(empresa, cnpj, forcar, dominio)
export const sugerirDominios = (nome) => empresasService.sugerirDominios(nome)
export const validarDominio = (empresa, cnpj) => empresasService.validarDominio(empresa, cnpj)

// RF-39/40: eventos de e-mail — endpoint ainda não existe no n8n.
export function listarEventos() {
  throw new Error('PENDENTE: criar webhook de eventos no n8n (RF-40)')
}

export const API = api.base
