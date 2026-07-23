// Fachada de compatibilidade (camada de view).
// A implementação real agora mora em serviços OOP (src/services) + modelos (src/models):
//   ApiClient  -> rede (fetch, base URL, erros)
//   CobrancaService / EmpresasService -> regras de cada domínio
//   Empresa / Contato -> modelos
// Este arquivo só reexporta funções finas para as telas não precisarem mudar os imports.
// (Pode migrar as telas para usar os serviços direto no futuro.)
import { api } from '../services/ApiClient'
import { cobrancaService } from '../services/CobrancaService'
import { listasService } from '../services/ListasService'
import { empresasService } from '../services/EmpresasService'
import { rhService } from '../services/RhService'

// --- Cobrança / contatos ---
export const listarContatos = () => cobrancaService.listarContatos()
export const importarContatos = (contatos) => cobrancaService.importarContatos(contatos)
export const moverContato = (id, etapa) => cobrancaService.moverContato(id, etapa)
export const importarCarga = (etapa, registros) => cobrancaService.importarCarga(etapa, registros)
export const dispararEtapa = (etapa, modelo) => cobrancaService.dispararEtapa(etapa, modelo)

// --- Listas (mail merge) ---
export const criarLista = (nome, etiquetas, etapa, registros) => listasService.criarLista(nome, etiquetas, etapa, registros)
export const listarListas = () => listasService.listarListas()
export const lerItensLista = (listaId) => listasService.lerItens(listaId)
export const dispararLista = (listaId, modelo) => listasService.dispararLista(listaId, modelo)
export const importarForaDaBase = (listaId) => listasService.importarFora(listaId)
export const lerEnviosListas = () => listasService.lerEnvios()

// --- Empresas ---
export const listarEmpresas = () => empresasService.listarEmpresas()
export const enriquecerEmpresa = (empresa, cnpj, forcar, dominio, cargosAlvo) =>
  empresasService.enriquecerEmpresa(empresa, cnpj, forcar, dominio, cargosAlvo)
export const descobrirEmpresa = (empresa, cnpj, dominio) =>
  empresasService.descobrirEmpresa(empresa, cnpj, dominio)
export const descobrirRapido = (empresa, cnpj) => empresasService.descobrirRapido(empresa, cnpj)
export const salvarEmpresa = (dados) => empresasService.salvarEmpresa(dados)
export const ocultarEmpresa = (cnpj, oculto) => empresasService.ocultarEmpresa(cnpj, oculto)
export const sugerirDominios = (nome) => empresasService.sugerirDominios(nome)
export const validarDominio = (empresa, cnpj) => empresasService.validarDominio(empresa, cnpj)
export const iniciarValidacaoLote = (loteId, registros) => empresasService.iniciarLote(loteId, registros)
export const lerValidacoes = (loteId) => empresasService.lerLote(loteId)
export const validarDominioIA = (razaoSocial, cnpj, loteId, cargos) =>
  empresasService.validarDominioIA(razaoSocial, cnpj, loteId, cargos)
export const listarLotesDominio = () => empresasService.listarLotesDominio()
export const urlCsvLote = (loteId) => empresasService.urlCsvLote(loteId)
export const apagarLote = (loteId) => empresasService.apagarLote(loteId)
export const urlCsvTudo = () => empresasService.urlCsvTudo()

// --- Enriquecimento de RH (Snov.io) — 3 rotas: preview (grátis), revelar/validar (pago) ---
export const rhPreview = (empresa, cnpj, dominio, cargosAlvo) => rhService.preview(empresa, cnpj, dominio, cargosAlvo)
export const rhRevelar = (cnpj, hashes, modo, n) => rhService.revelar(cnpj, hashes, modo, n)
export const rhValidar = (hashes) => rhService.validar(hashes)
export const snovSaldo = () => rhService.saldo()
export const saldosPlataformas = () => rhService.saldosPlataformas()

// RF-39/40: eventos de e-mail — endpoint ainda não existe no n8n.
export function listarEventos() {
  throw new Error('PENDENTE: criar webhook de eventos no n8n (RF-40)')
}

export const API = api.base
