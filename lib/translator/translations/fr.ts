export const FR_TRANSLATIONS = {
  sac: {
    transfer: (from: string, amount: string, symbol: string, to: string) =>
      `Clé publique [${from}] a transféré ${amount} ${symbol} à [${to}]`,
    mint: (admin: string, amount: string, symbol: string, to: string) =>
      `Administrateur [${admin}] a miné ${amount} ${symbol} à [${to}]`,
    burn: (from: string, amount: string, symbol: string) =>
      `Clé publique [${from}] a brûlé ${amount} ${symbol}`,
    eventTypes: {
      Transfer: "Transfert",
      Mint: "Minage",
      Burn: "Brûlure",
    },
  },
  soroswap: {
    swap: (tokenIn: string, amountIn: string, tokenOut: string, amountOut: string) =>
      `A échangé ${amountIn} de [${tokenIn}] contre ${amountOut} de [${tokenOut}]`,
    addLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `A ajouté ${amountA} de [${tokenA}] et ${amountB} de [${tokenB}] (${liquidity} jetons de liquidité)`,
    removeLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `A retiré ${amountA} de [${tokenA}] et ${amountB} de [${tokenB}] en brûlant ${liquidity} jetons de liquidité`,
    eventTypes: {
      Swap: "Échange",
      AddLiquidity: "Ajouter de la liquidité",
      RemoveLiquidity: "Retirer de la liquidité",
    },
  },
};
