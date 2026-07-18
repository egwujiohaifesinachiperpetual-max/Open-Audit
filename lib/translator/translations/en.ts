export const EN_TRANSLATIONS = {
  sac: {
    transfer: (from: string, amount: string, symbol: string, to: string) =>
      `Public Key [${from}] transferred ${amount} ${symbol} to [${to}]`,
    mint: (admin: string, amount: string, symbol: string, to: string) =>
      `Admin [${admin}] minted ${amount} ${symbol} to [${to}]`,
    burn: (from: string, amount: string, symbol: string) =>
      `Public Key [${from}] burned ${amount} ${symbol}`,
    eventTypes: {
      Transfer: "Transfer",
      Mint: "Mint",
      Burn: "Burn",
    },
  },
  soroswap: {
    swap: (tokenIn: string, amountIn: string, tokenOut: string, amountOut: string) =>
      `Swapped ${amountIn} of [${tokenIn}] for ${amountOut} of [${tokenOut}]`,
    addLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `Added ${amountA} of [${tokenA}] and ${amountB} of [${tokenB}] (${liquidity} liquidity tokens)`,
    removeLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `Removed ${amountA} of [${tokenA}] and ${amountB} of [${tokenB}] by burning ${liquidity} liquidity tokens`,
    eventTypes: {
      Swap: "Swap",
      AddLiquidity: "Add Liquidity",
      RemoveLiquidity: "Remove Liquidity",
    },
  },
};
