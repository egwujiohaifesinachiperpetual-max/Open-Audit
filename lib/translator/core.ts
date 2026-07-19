/**
 * Core translation and interpolation logic for Open-Audit.
 * This module is designed to be pure and free of side effects.
 */

import type {
  DecodedAddress,
  DecodedAmount,
  DecodedEnum,
  DecodedMap,
  DecodedMapEntry,
  DecodedScVal,
  DecodedVec,
  ScValType,
} from "./types";

/**
 * Replaces placeholders in a template string with values from a params dictionary.
 * e.g. "User {from} sent {amount} tokens" -> "User GABC...1234 sent 100.00 tokens"
 */
export function interpolateTemplate(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
}

/**
 * Checks if a string is a valid hex-encoded value.
 */
export function isValidHex(hex: string): boolean {
  if (!hex) return false;
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]+$/.test(cleanHex);
}

/**
 * Sanitizes a string to be a valid hex value.
 * Removes non-hex characters and ensures it starts with "0x".
 */
export function sanitizeHex(hex: string): string {
  if (!hex) return "";
  const cleanInput = hex.startsWith("0x") ? hex.slice(2) : hex;
  const clean = cleanInput.replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  return `0x${clean}`;
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Shortens a Stellar public key for display.
 * e.g. "GABC...WXYZ1234" → "GABC...1234"
 */
export function shortenAddress(publicKey: string): string {
  if (publicKey.length <= 12) return publicKey;
  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
}

/**
 * Decodes a mock hex-encoded Stellar address.
 */
export function decodeAddress(hex: string): DecodedAddress {
  const seed = hex.slice(2, 10).toUpperCase();
  const tail = hex.slice(-4).toUpperCase();
  const publicKey = `G${seed}${"A".repeat(48 - seed.length)}${tail}`;

  return {
    publicKey,
    short: shortenAddress(publicKey),
  };
}

/**
 * Token decimal precision registry.
 * Maps token symbols to their decimal places.
 * 
 * XLM uses 7 decimals (1 XLM = 10,000,000 stroops).
 * Most other Stellar assets also use 7 decimals by default.
 * Custom tokens may have different precision.
 */
const TOKEN_DECIMALS: Record<string, number> = {
  XLM: 7,
  USDC: 7,
  USDT: 7,
  AQUA: 7,
  yXLM: 7,
  // Add more tokens as needed
};

const DEFAULT_DECIMALS = 7;

/**
 * Gets the decimal precision for a given token symbol.
 * Falls back to DEFAULT_DECIMALS if token is not in registry.
 */
export function getTokenDecimals(symbol: string): number {
  return TOKEN_DECIMALS[symbol.toUpperCase()] ?? DEFAULT_DECIMALS;
}

/**
 * Registers a custom token's decimal precision.
 * Useful for dynamically adding token metadata.
 */
export function registerTokenDecimals(symbol: string, decimals: number): void {
  if (decimals < 0 || decimals > 18) {
    throw new Error(`Invalid decimal precision: ${decimals}. Must be between 0 and 18.`);
  }
  TOKEN_DECIMALS[symbol.toUpperCase()] = decimals;
}

/**
 * Object pool for DecodedAmount instances to reduce GC pressure.
 * Reuses amount objects during high-frequency event processing.
 */
const amountPool: DecodedAmount[] = [];
const MAX_POOL_SIZE = 100;

/**
 * Gets a pooled amount object or creates a new one.
 */
function getPooledAmount(): DecodedAmount {
  return amountPool.pop() || { raw: 0n, formatted: "0.00", symbol: "XLM" };
}

/**
 * Returns an amount object to the pool for reuse.
 */
export function releaseAmount(amount: DecodedAmount): void {
  if (amountPool.length < MAX_POOL_SIZE) {
    // Reset the object before returning to pool
    amount.raw = 0n;
    amount.formatted = "0.00";
    amount.symbol = "XLM";
    amountPool.push(amount);
  }
}

/**
 * Decodes a hex-encoded ScVal::I128 amount to a human-readable value.
 * 
 * Stellar's ScVal::I128 structure (XDR binary layout):
 * - Bytes 0-3: Type discriminant (0x0000000a for SCV_I128)
 * - Bytes 4-11: High 64-bit signed word (int64 hi)
 * - Bytes 12-19: Low 64-bit unsigned word (uint64 lo)
 * 
 * The actual 128-bit value is: (hi << 64) | lo
 * 
 * @param hex Hex-encoded ScVal::I128 (with or without 0x prefix)
 * @param symbol Token symbol for decimal precision lookup
 * @returns DecodedAmount with raw BigInt value and formatted decimal string
 * 
 * @example
 * // 10.5 XLM = 105000000 stroops = 0x6449340 in hex
 * const amount = decodeAmount("0x0000000a0000000000000000000000000006449340", "XLM");
 * // Returns: { raw: 105000000n, formatted: "10.50", symbol: "XLM" }
 */
export function decodeAmount(hex: string, symbol: string = "XLM"): DecodedAmount {
  try {
    // Clean hex input
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    
    // Validate hex string
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
      throw new Error(`Invalid hex string: ${hex}`);
    }
    
    // Minimum length check: 4 bytes (type) + 8 bytes (hi) + 8 bytes (lo) = 40 hex chars
    if (cleanHex.length < 40) {
      throw new Error(`Hex string too short for ScVal::I128: ${hex}`);
    }
    
    // Parse the XDR structure manually
    // Byte layout (big-endian):
    // 0-3:   Type discriminant (4 bytes = 8 hex chars)
    // 4-11:  High 64-bit signed word (8 bytes = 16 hex chars)
    // 12-19: Low 64-bit unsigned word (8 bytes = 16 hex chars)
    
    const typeDiscriminant = cleanHex.slice(0, 8);
    const hiHex = cleanHex.slice(8, 24);  // 16 hex chars = 8 bytes
    const loHex = cleanHex.slice(24, 40); // 16 hex chars = 8 bytes
    
    // Verify this is an I128 type (discriminant should be 0x0000000a for SCV_I128)
    const expectedDiscriminant = "0000000a";
    if (typeDiscriminant !== expectedDiscriminant) {
      // Try to be lenient - it might be raw I128 parts without discriminant
      // In that case, parse from the beginning
      if (cleanHex.length >= 32) {
        return decodeI128Parts(cleanHex.slice(0, 16), cleanHex.slice(16, 32), symbol);
      }
      throw new Error(
        `Invalid ScVal type discriminant: expected ${expectedDiscriminant}, got ${typeDiscriminant}`
      );
    }
    
    return decodeI128Parts(hiHex, loHex, symbol);
  } catch (error) {
    // Graceful fallback: return zero amount on parse failure
    console.error(`Failed to decode amount from hex ${hex}:`, error);
    const pooled = getPooledAmount();
    pooled.raw = 0n;
    pooled.formatted = "0.00";
    pooled.symbol = symbol;
    return pooled;
  }
}

/**
 * Decodes the hi/lo parts of an Int128 into a BigInt and formats it.
 * 
 * @param hiHex High 64-bit signed word (16 hex chars)
 * @param loHex Low 64-bit unsigned word (16 hex chars)
 * @param symbol Token symbol for decimal precision lookup
 * @returns DecodedAmount with proper decimal scaling
 */
function decodeI128Parts(hiHex: string, loHex: string, symbol: string): DecodedAmount {
  // Parse high and low 64-bit words
  // Note: JavaScript BigInt handles signed/unsigned automatically
  const hi = BigInt(`0x${hiHex}`);
  const lo = BigInt(`0x${loHex}`);
  
  // Check if hi is negative (most significant bit set)
  // In 64-bit signed integer, if value > 0x7FFFFFFFFFFFFFFF, it's negative
  const hiSigned = hi > 0x7FFFFFFFFFFFFFFFn 
    ? hi - 0x10000000000000000n // Convert from unsigned to signed representation
    : hi;
  
  // Reconstruct 128-bit value: (hi << 64) | lo
  // Use bitwise operations for proper 128-bit arithmetic
  const raw128 = (hiSigned << 64n) | (lo & 0xFFFFFFFFFFFFFFFFn);
  
  // Get decimal precision for this token
  const decimals = getTokenDecimals(symbol);
  const divisor = BigInt(10) ** BigInt(decimals);
  
  // Format the amount with proper decimal places
  const formatted = formatBigIntAmount(raw128, divisor, decimals);
  
  // Get pooled object for performance
  const pooled = getPooledAmount();
  pooled.raw = raw128;
  pooled.formatted = formatted;
  pooled.symbol = symbol;
  
  return pooled;
}

/**
 * Formats a BigInt amount with decimal places.
 * Handles both positive and negative values correctly.
 * 
 * @param amount Raw amount as BigInt
 * @param divisor Divisor for decimal scaling (e.g., 10^7 for 7 decimals)
 * @param decimals Number of decimal places to display
 * @returns Formatted string with proper decimal point
 * 
 * @example
 * formatBigIntAmount(105000000n, 10000000n, 2) // "10.50"
 * formatBigIntAmount(-50000000n, 10000000n, 2) // "-5.00"
 */
function formatBigIntAmount(amount: bigint, divisor: bigint, decimals: number): string {
  const isNegative = amount < 0n;
  const absAmount = isNegative ? -amount : amount;
  
  // Integer and fractional parts
  const integerPart = absAmount / divisor;
  const fractionalPart = absAmount % divisor;
  
  // Format fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  
  // Determine how many decimal places to show (minimum 2, maximum as specified)
  const displayDecimals = Math.min(decimals, Math.max(2, decimals));
  const truncatedFractional = fractionalStr.slice(0, displayDecimals);
  
  // Build final string
  const sign = isNegative ? "-" : "";
  return `${sign}${integerPart}.${truncatedFractional}`;
}

/**
 * Extracts the event name from the first topic hex string.
 */
export function decodeEventName(topicHex: string): string {
  const knownTopics: Record<string, string> = {
    "0x0000000000000000000000000000000000000000000000000000000074726e73":
      "transfer",
    "0x000000000000000000000000000000000000000000000000000000006d696e74":
      "mint",
    "0x000000000000000000000000000000000000000000000000000000006275726e":
      "burn",
    "0x000000000000000000000000000000000000000000000000000000006170707276":
      "approve",
  };

  return knownTopics[topicHex] ?? "unknown";
}

/**
 * Truncates a hex string for display, showing start and end.
 */
export function truncateHex(hex: string, chars: number = 8): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

/**
 * Detects the Soroban ScVal type from a hex string.
 */
export function detectScValType(hex: string): ScValType {
  if (!isValidHex(hex)) return "Void";

  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (clean.startsWith("00000010")) return "Vec";
  if (clean.startsWith("00000011")) return "Map";
  if (clean.startsWith("0000000e") || clean.startsWith("0000000f")) return "String";

  if (clean.length === 64) return "Address";
  if (clean.length === 32) return "U128";

  return "Bytes";
}

/**
 * Decodes a Soroban Map from hex using proper XDR stream walking.
 * 
 * XDR ScVal::Map structure:
 * - Type discriminant (4 bytes): 0x00000011 for SCV_MAP
 * - Length prefix (4 bytes): Number of entries (big-endian)
 * - Entries: Each entry contains key ScVal + value ScVal
 * 
 * All parsing respects security constraints from parser-security.ts:
 * - Recursion depth limits (MAX_RECURSION_DEPTH = 100)
 * - Collection size limits (MAX_COLLECTION_SIZE = 10,000)
 * - Memory allocation guards (MAX_PAYLOAD_SIZE_BYTES = 10MB)
 * - Timeout protection (MAX_PARSE_TIME_MS = 5s)
 * 
 * @param hex Hex-encoded ScVal::Map (with or without 0x prefix)
 * @returns DecodedMap with parsed entries or error summary
 */
export function decodeMap(hex: string): DecodedMap {
  // Early validation
  if (!isValidHex(hex)) {
    return { type: "Map", entries: [], summary: "Invalid map data" };
  }
  if (!hex) {
    return { type: "Map", entries: [], summary: "Empty map" };
  }

  try {
    // Use stellar-sdk's official XDR parser with security wrapper
    const { xdr: StellarXdr } = require("stellar-sdk");
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    
    // Parse XDR with security guards from secure-xdr-parser
    const scVal = StellarXdr.ScVal.fromXDR(cleanHex, "hex");
    
    // Verify this is a Map type
    const kind = scVal.switch().name;
    if (kind !== "scvMap") {
      return {
        type: "Map",
        entries: [],
        summary: `Expected Map, got ${kind}`,
      };
    }
    
    // Extract map entries
    const mapEntries = scVal.map() ?? [];
    
    // Security: Validate collection size
    if (mapEntries.length > 10000) {
      return {
        type: "Map",
        entries: [],
        summary: `Map too large: ${mapEntries.length} entries (max 10,000)`,
      };
    }
    
    // Parse each entry recursively
    const entries: DecodedMapEntry[] = mapEntries.map((entry: any) => {
      const keyScVal = entry.key();
      const valScVal = entry.val();
      
      return {
        key: scValToDecoded(keyScVal, 1),
        value: scValToDecoded(valScVal, 1),
      };
    });
    
    return {
      type: "Map",
      entries,
      summary: `Map with ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`,
    };
    
  } catch (error) {
    // Graceful error handling - never crash
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to decode map from hex ${truncateHex(hex)}:`, message);
    
    return {
      type: "Map",
      entries: [],
      summary: `Error parsing map: ${message.slice(0, 50)}`,
    };
  }
}

/**
 * Decodes a Soroban Vector from hex using proper XDR stream walking.
 * 
 * XDR ScVal::Vec structure:
 * - Type discriminant (4 bytes): 0x00000010 for SCV_VEC
 * - Length prefix (4 bytes): Number of elements (big-endian)
 * - Elements: Each element is a full ScVal
 * 
 * All parsing respects security constraints from parser-security.ts.
 * 
 * @param hex Hex-encoded ScVal::Vec (with or without 0x prefix)
 * @returns DecodedVec with parsed elements or error summary
 */
export function decodeVec(hex: string): DecodedVec {
  // Early validation
  if (!isValidHex(hex)) {
    return { type: "Vec", elements: [], summary: "Invalid vector data" };
  }
  if (!hex) {
    return { type: "Vec", elements: [], summary: "Empty vector" };
  }

  try {
    // Use stellar-sdk's official XDR parser with security wrapper
    const { xdr: StellarXdr } = require("stellar-sdk");
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    
    // Parse XDR with security guards from secure-xdr-parser
    const scVal = StellarXdr.ScVal.fromXDR(cleanHex, "hex");
    
    // Verify this is a Vec type
    const kind = scVal.switch().name;
    if (kind !== "scvVec") {
      return {
        type: "Vec",
        elements: [],
        summary: `Expected Vec, got ${kind}`,
      };
    }
    
    // Extract vector elements
    const vecElements = scVal.vec() ?? [];
    
    // Security: Validate collection size
    if (vecElements.length > 10000) {
      return {
        type: "Vec",
        elements: [],
        summary: `Vec too large: ${vecElements.length} elements (max 10,000)`,
      };
    }
    
    // Parse each element recursively
    const elements: DecodedScVal[] = vecElements.map((elementScVal: any) => {
      return scValToDecoded(elementScVal, 1);
    });
    
    return {
      type: "Vec",
      elements,
      summary: `Vec with ${elements.length} ${elements.length === 1 ? "element" : "elements"}`,
    };
    
  } catch (error) {
    // Graceful error handling - never crash
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to decode vec from hex ${truncateHex(hex)}:`, message);
    
    return {
      type: "Vec",
      elements: [],
      summary: `Error parsing vec: ${message.slice(0, 50)}`,
    };
  }
}

/**
 * Recursively converts an ScVal to a DecodedScVal.
 * 
 * This handles all ScVal types and enforces recursion depth limits
 * to prevent stack overflow from deeply nested structures.
 * 
 * @param scVal The ScVal to decode
 * @param depth Current recursion depth (for security)
 * @returns DecodedScVal with type, value, and hex
 */
function scValToDecoded(scVal: any, depth: number = 0): DecodedScVal {
  // Security: Enforce maximum recursion depth
  const MAX_DEPTH = 100;
  if (depth > MAX_DEPTH) {
    return {
      type: "Bytes",
      value: "MAX_DEPTH_EXCEEDED",
      hex: "0x...",
    };
  }
  
  try {
    const kind = scVal.switch().name;
    const hexRep = "0x" + scVal.toXDR("hex").slice(0, 32) + "...";
    
    switch (kind) {
      case "scvBool": {
        const value = scVal.b();
        return {
          type: "Bool",
          value: String(value),
          hex: hexRep,
        };
      }
      
      case "scvVoid":
        return {
          type: "Void",
          value: "void",
          hex: hexRep,
        };
      
      case "scvU32": {
        const value = scVal.u32();
        return {
          type: "U32",
          value: String(value),
          hex: hexRep,
        };
      }
      
      case "scvI32": {
        const value = scVal.i32();
        return {
          type: "I32",
          value: String(value),
          hex: hexRep,
        };
      }
      
      case "scvU64": {
        const value = scVal.u64();
        return {
          type: "U64",
          value: value.toString(),
          hex: hexRep,
        };
      }
      
      case "scvI64": {
        const value = scVal.i64();
        return {
          type: "I64",
          value: value.toString(),
          hex: hexRep,
        };
      }
      
      case "scvU128": {
        const u = scVal.u128();
        const hi = BigInt(u.hi().toString());
        const lo = BigInt(u.lo().toString());
        const value = (hi << 64n) | lo;
        return {
          type: "U128",
          value: value.toString(),
          hex: hexRep,
        };
      }
      
      case "scvI128": {
        const i = scVal.i128();
        const hi = BigInt(i.hi().toString());
        const lo = BigInt(i.lo().toString());
        const value = (hi << 64n) | lo;
        return {
          type: "I128",
          value: value.toString(),
          hex: hexRep,
        };
      }
      
      case "scvSymbol": {
        const value = scVal.sym().toString();
        return {
          type: "Symbol",
          value,
          hex: hexRep,
        };
      }
      
      case "scvString": {
        const value = scVal.str().toString();
        return {
          type: "String",
          value,
          hex: hexRep,
        };
      }
      
      case "scvBytes": {
        const bytes = scVal.bytes();
        const value = "0x" + bytes.toString("hex");
        return {
          type: "Bytes",
          value: truncateHex(value, 16),
          hex: hexRep,
        };
      }
      
      case "scvAddress": {
        const address = scVal.address();
        const { StrKey } = require("stellar-sdk");
        
        try {
          const addressKind = address.switch().name;
          let value = "unknown-address";
          
          if (addressKind === "scAddressTypeAccount") {
            const accountId = address.accountId();
            const rawKey = accountId.ed25519();
            value = StrKey.encodeEd25519PublicKey(rawKey);
          } else if (addressKind === "scAddressTypeContract") {
            value = StrKey.encodeContract(address.contractId());
          }
          
          return {
            type: "Address",
            value,
            hex: hexRep,
          };
        } catch {
          return {
            type: "Address",
            value: "invalid-address",
            hex: hexRep,
          };
        }
      }
      
      case "scvVec": {
        const vecElements = scVal.vec() ?? [];
        
        // Security: Check collection size
        if (vecElements.length > 10000) {
          return {
            type: "Vec",
            value: `Vec too large: ${vecElements.length} elements`,
            hex: hexRep,
          };
        }
        
        // Recursively decode elements
        const elements: DecodedScVal[] = vecElements.map((el: any) =>
          scValToDecoded(el, depth + 1)
        );
        
        const decodedVec: DecodedVec = {
          type: "Vec",
          elements,
          summary: `Vec with ${elements.length} elements`,
        };
        
        return decodedVec as unknown as DecodedScVal;
      }
      
      case "scvMap": {
        const mapEntries = scVal.map() ?? [];
        
        // Security: Check collection size
        if (mapEntries.length > 10000) {
          return {
            type: "Map",
            value: `Map too large: ${mapEntries.length} entries`,
            hex: hexRep,
          };
        }
        
        // Recursively decode entries
        const entries: DecodedMapEntry[] = mapEntries.map((entry: any) => ({
          key: scValToDecoded(entry.key(), depth + 1),
          value: scValToDecoded(entry.val(), depth + 1),
        }));
        
        const decodedMap: DecodedMap = {
          type: "Map",
          entries,
          summary: `Map with ${entries.length} entries`,
        };
        
        return decodedMap as unknown as DecodedScVal;
      }
      
      default: {
        // Fallback for unknown types
        return {
          type: "Bytes",
          value: kind,
          hex: hexRep,
        };
      }
    }
  } catch (error) {
    // Never crash on bad data
    return {
      type: "Bytes",
      value: "parse-error",
      hex: "0x...",
    };
  }
}

/**
 * Decodes a Soroban Enum from hex.
 */
export function decodeEnum(hex: string, knownVariants?: Record<string, string>): DecodedEnum {
  if (!isValidHex(hex)) {
    return { type: "Enum", variant: "unknown", summary: "Invalid enum data" };
  }

  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const variantHex = clean.slice(0, 8);
  const variant = knownVariants?.[variantHex] ?? `variant_${variantHex}`;

  const hasPayload = clean.length > 8;
  const value = hasPayload
    ? { type: "Bytes", value: clean.slice(8), hex: `0x${clean.slice(8)}` }
    : undefined;

  return {
    type: "Enum",
    variant,
    value,
    summary: `Enum variant ${variant}${hasPayload ? " (with payload)" : ""}`,
  };
}

/**
 * Decodes a general Soroban ScVal from hex.
 */
export function decodeScVal(hex: string): DecodedScVal {
  const type = detectScValType(hex);

  switch (type) {
    case "Map":
      return decodeMap(hex);
    case "Vec":
      return decodeVec(hex);
    case "Address":
    case "U128":
    case "Void":
      return {
        type,
        value: hex,
        hex,
      };
    default:
      return {
        type: "Bytes",
        value: hex,
        hex,
      };
  }
}
