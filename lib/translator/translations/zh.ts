export const ZH_TRANSLATIONS = {
  sac: {
    transfer: (from: string, amount: string, symbol: string, to: string) =>
      `公钥 [${from}] 向 [${to}] 转账了 ${amount} ${symbol}`,
    mint: (admin: string, amount: string, symbol: string, to: string) =>
      `管理员 [${admin}] 为 [${to}] 铸造了 ${amount} ${symbol}`,
    burn: (from: string, amount: string, symbol: string) =>
      `公钥 [${from}] 销毁了 ${amount} ${symbol}`,
    eventTypes: {
      Transfer: "转账",
      Mint: "铸造",
      Burn: "销毁",
    },
  },
  soroswap: {
    swap: (tokenIn: string, amountIn: string, tokenOut: string, amountOut: string) =>
      `将 [${tokenIn}] 的 ${amountIn} 兑换为 [${tokenOut}] 的 ${amountOut}`,
    addLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `添加了 [${tokenA}] 的 ${amountA} 和 [${tokenB}] 的 ${amountB}（${liquidity} 个流动性代币）`,
    removeLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `销毁 ${liquidity} 个流动性代币，移除了 [${tokenA}] 的 ${amountA} 和 [${tokenB}] 的 ${amountB}`,
    eventTypes: { Swap: "兑换", AddLiquidity: "添加流动性", RemoveLiquidity: "移除流动性" },
  },
};
