export const ES_TRANSLATIONS = {
  sac: {
    transfer: (from: string, amount: string, symbol: string, to: string) =>
      `Clave pública [${from}] transfirió ${amount} ${symbol} a [${to}]`,
    mint: (admin: string, amount: string, symbol: string, to: string) =>
      `Administrador [${admin}] minteó ${amount} ${symbol} a [${to}]`,
    burn: (from: string, amount: string, symbol: string) =>
      `Clave pública [${from}] quemó ${amount} ${symbol}`,
    eventTypes: {
      Transfer: "Transferencia",
      Mint: "Minteo",
      Burn: "Quema",
    },
  },
  sdex: {
    manageBuyOffer: (seller: string, amount: string, buyingAsset: string, sellingAsset: string) =>
      `La cuenta [${seller}] colocó una oferta de compra por ${amount} del activo [${buyingAsset}], ofreciendo el activo [${sellingAsset}]`,
    manageSellOffer: (seller: string, amount: string, sellingAsset: string, buyingAsset: string) =>
      `La cuenta [${seller}] colocó una oferta de venta por ${amount} del activo [${sellingAsset}], solicitando el activo [${buyingAsset}]`,
    offerFilled: (seller: string, amount: string, assetSold: string, buyer: string) =>
      `La oferta de [${seller}] fue completada: ${amount} del activo [${assetSold}] fue vendido a [${buyer}]`,
    eventTypes: {
      ManageBuyOffer: "Gestionar Oferta de Compra",
      ManageSellOffer: "Gestionar Oferta de Venta",
      OfferFilled: "Oferta Completada",
    },
  },
  soroswap: {
    swap: (tokenIn: string, amountIn: string, tokenOut: string, amountOut: string) =>
      `Intercambió ${amountIn} de [${tokenIn}] por ${amountOut} de [${tokenOut}]`,
    addLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `Añadió ${amountA} de [${tokenA}] y ${amountB} de [${tokenB}] (${liquidity} tokens de liquidez)`,
    removeLiquidity: (
      tokenA: string,
      amountA: string,
      tokenB: string,
      amountB: string,
      liquidity: string
    ) =>
      `Retiró ${amountA} de [${tokenA}] y ${amountB} de [${tokenB}] al quemar ${liquidity} tokens de liquidez`,
    eventTypes: {
      Swap: "Intercambio",
      AddLiquidity: "Añadir liquidez",
      RemoveLiquidity: "Retirar liquidez",
    },
  },
};
