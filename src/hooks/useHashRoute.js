import { useEffect, useState } from 'react'

// Mini-roteador em React puro (sem dependência externa).
// A tela atual fica no "hash" da URL, ex.: .../#/contatos
// Assim dá para navegar entre telas, usar o botão voltar do navegador
// e recarregar a página sem perder onde estava — sem instalar react-router.

export function rotaAtual() {
  // remove o "#/" do começo; se vier vazio, cai no dashboard
  const h = window.location.hash.replace(/^#\/?/, '').trim()
  return h || 'dashboard'
}

export function irPara(rota) {
  window.location.hash = '#/' + rota
}

export function useHashRoute() {
  const [rota, setRota] = useState(rotaAtual())

  useEffect(() => {
    const aoMudar = () => setRota(rotaAtual())
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  return rota
}
