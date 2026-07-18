/** Translation blueprint for Soroswap Router AMM events. */
import { StrKey, xdr } from "stellar-sdk";
import { shortenAddress } from "../core";
import { getTranslation } from "../translations";
import type { Language, RawEvent, TranslationBlueprint, TranslationResult } from "../types";

type RouterPayload = Record<string, xdr.ScVal>;

function eventName(topic: string): string | null {
  try {
    const value = xdr.ScVal.fromXDR(topic.replace(/^0x/, ""), "hex");
    return value.switch().name === "scvSymbol" ? value.sym().toString() : null;
  } catch {
    return null;
  }
}

function payload(data: string): RouterPayload | null {
  try {
    const value = xdr.ScVal.fromXDR(data.replace(/^0x/, ""), "hex");
    if (value.switch().name !== "scvMap") return null;
    const entries = value.map();
    if (!entries) return null;
    const result: RouterPayload = {};
    for (const entry of entries) {
      if (entry.key().switch().name === "scvSymbol") {
        result[entry.key().sym().toString()] = entry.val();
      }
    }
    return result;
  } catch {
    return null;
  }
}

function address(value: xdr.ScVal | undefined): string | null {
  if (!value || value.switch().name !== "scvAddress") return null;
  const scAddress = value.address();
  if (scAddress.switch().name === "scAddressTypeContract") {
    return shortenAddress(StrKey.encodeContract(scAddress.contractId()));
  }
  if (scAddress.switch().name === "scAddressTypeAccount") {
    return shortenAddress(StrKey.encodeEd25519PublicKey(scAddress.accountId().value()));
  }
  return null;
}

function amount(value: xdr.ScVal | undefined): string | null {
  if (!value || value.switch().name !== "scvI128") return null;
  const parts = value.i128();
  const raw = (BigInt(parts.hi().toString()) << BigInt(64)) + BigInt(parts.lo().toString());
  return (Number(raw) / 10_000_000).toFixed(2);
}

function addresses(value: xdr.ScVal | undefined): string[] | null {
  if (!value || value.switch().name !== "scvVec") return null;
  const decoded = (value.vec() ?? []).map(address);
  return decoded.every((item): item is string => item !== null) ? decoded : null;
}

function amounts(value: xdr.ScVal | undefined): string[] | null {
  if (!value || value.switch().name !== "scvVec") return null;
  const decoded = (value.vec() ?? []).map(amount);
  return decoded.every((item): item is string => item !== null) ? decoded : null;
}

function translateRouterEvent(event: RawEvent, lang: Language): TranslationResult | null {
  const name = eventName(event.topics[1] ?? event.topics[0] ?? "");
  const fields = payload(event.data);
  if (!name || !fields) return null;
  const t = getTranslation(lang).soroswap;

  if (name === "swap") {
    const path = addresses(fields.path);
    const traded = amounts(fields.amounts);
    if (!path || path.length < 2 || !traded || traded.length < 2) return null;
    return {
      description: t.swap(path[0], traded[0], path[path.length - 1], traded[traded.length - 1]),
      eventType: t.eventTypes.Swap,
    };
  }

  if (
    name === "add" ||
    name === "add_liquidity" ||
    name === "remove" ||
    name === "remove_liquidity"
  ) {
    const tokenA = address(fields.token_a);
    const tokenB = address(fields.token_b);
    const amountA = amount(fields.amount_a);
    const amountB = amount(fields.amount_b);
    const liquidity = amount(fields.liquidity);
    if (!tokenA || !tokenB || !amountA || !amountB || !liquidity) return null;
    const adding = name === "add" || name === "add_liquidity";
    return {
      description: adding
        ? t.addLiquidity(tokenA, amountA, tokenB, amountB, liquidity)
        : t.removeLiquidity(tokenA, amountA, tokenB, amountB, liquidity),
      eventType: adding ? t.eventTypes.AddLiquidity : t.eventTypes.RemoveLiquidity,
    };
  }

  return null;
}

/** Creates a blueprint for a deployed Soroswap Router contract. */
export function createSoroswapRouterBlueprint(contractId: string): TranslationBlueprint {
  return {
    contractId,
    contractName: "Soroswap Router",
    translate: translateRouterEvent,
  };
}
