import { describe, expect, it } from "vitest";
import { xdr } from "stellar-sdk";
import { createSoroswapRouterBlueprint } from "../blueprints/soroswap-router";
import type { RawEvent } from "../types";

const ROUTER = "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD";

function contract(byte: string) {
  return xdr.ScVal.scvAddress(
    xdr.ScAddress.scAddressTypeContract(Buffer.from(byte.repeat(64), "hex"))
  );
}

function i128(value: number) {
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({ hi: xdr.Int64.fromString("0"), lo: xdr.Uint64.fromString(String(value)) })
  );
}

function fixture(name: string, fields: Array<[string, xdr.ScVal]>): RawEvent {
  return {
    id: `router-${name}`,
    contractId: ROUTER,
    // Soroswap emits ("SoroswapRouter", symbol_short!(event)); the event symbol is topic[1].
    topics: [
      `0x${xdr.ScVal.scvSymbol("SoroswapRouter").toXDR("hex")}`,
      `0x${xdr.ScVal.scvSymbol(name).toXDR("hex")}`,
    ],
    data: `0x${xdr.ScVal.scvMap(fields.map(([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val }))).toXDR("hex")}`,
    ledger: 1,
    timestamp: 1,
    txHash: "a".repeat(64),
  };
}

const pairFields: Array<[string, xdr.ScVal]> = [
  ["token_a", contract("1")],
  ["token_b", contract("2")],
  ["pair", contract("3")],
  ["amount_a", i128(25_000_000)],
  ["amount_b", i128(40_000_000)],
  ["liquidity", i128(10_000_000)],
  ["to", contract("4")],
];

describe("Soroswap Router blueprint", () => {
  const blueprint = createSoroswapRouterBlueprint(ROUTER);

  it("translates a realistic swap XDR fixture", () => {
    const event = fixture("swap", [
      ["path", xdr.ScVal.scvVec([contract("1"), contract("2")])],
      ["amounts", xdr.ScVal.scvVec([i128(15_000_000), i128(23_500_000)])],
      ["to", contract("4")],
    ]);
    const result = blueprint.translate(event, "en");
    expect(result?.eventType).toBe("Swap");
    expect(result?.description).toContain("1.50");
    expect(result?.description).toContain("2.35");
  });

  it("translates a realistic add_liquidity XDR fixture", () => {
    const result = blueprint.translate(fixture("add", pairFields), "en");
    expect(result?.eventType).toBe("Add Liquidity");
    expect(result?.description).toContain("2.50");
    expect(result?.description).toContain("4.00");
  });

  it("translates a realistic remove_liquidity XDR fixture", () => {
    const result = blueprint.translate(fixture("remove", pairFields), "en");
    expect(result?.eventType).toBe("Remove Liquidity");
    expect(result?.description).toContain("burning 1.00 liquidity tokens");
  });

  it("returns null for unknown router event types", () => {
    expect(blueprint.translate(fixture("init", pairFields), "en")).toBeNull();
  });
});
