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
  sdex: {
    manageBuyOffer: (seller: string, amount: string, buyingAsset: string, sellingAsset: string) =>
      `Account [${seller}] placed a buy offer for ${amount} of asset [${buyingAsset}], offering asset [${sellingAsset}]`,
    manageSellOffer: (seller: string, amount: string, sellingAsset: string, buyingAsset: string) =>
      `Account [${seller}] placed a sell offer for ${amount} of asset [${sellingAsset}], requesting asset [${buyingAsset}]`,
    offerFilled: (seller: string, amount: string, assetSold: string, buyer: string) =>
      `Offer from [${seller}] was filled: ${amount} of asset [${assetSold}] was sold to [${buyer}]`,
    eventTypes: {
      ManageBuyOffer: "Manage Buy Offer",
      ManageSellOffer: "Manage Sell Offer",
      OfferFilled: "Offer Filled",
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
