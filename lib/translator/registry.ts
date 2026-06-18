/**
 * The Open-Audit Translation Registry
 *
 * This is the central lookup table that maps Contract IDs to their
 * translation blueprints. When a raw event arrives, the registry:
 *
 *   1. Looks up the contract ID in the blueprint map.
 *   2. Selects the most recent versioned schema whose validFromLedger ≤ event.ledger.
 *   3. Calls the blueprint's translate() function.
 *   4. Returns a TranslatedEvent with a human-readable description,
 *      or marks the event as "cryptic" if no blueprint matches.
 *
 * To add support for a new contract, create a blueprint in ./blueprints/
 * and register it in buildRegistry() below.
 *
 * To support a contract upgrade, register an additional VersionedTranslationBlueprint
 * with a `validFromLedger` set to the first ledger of the upgraded contract.
 */

import { createAllSacBlueprints } from "./blueprints/sac-transfer";
import { createSacMintBurnBlueprint } from "./blueprints/sac-mint-burn";
import type { RawEvent, TranslatedEvent, VersionedTranslationBlueprint } from "./types";

/**
 * The registry maps contract IDs to an array of versioned blueprints,
 * sorted descending by validFromLedger so the newest schema is tried first.
 */
type BlueprintRegistry = Map<string, VersionedTranslationBlueprint[]>;

/**
 * Builds the global blueprint registry by collecting all known blueprints.
 * Add new blueprints here as the community contributes them.
 */
function buildRegistry(): BlueprintRegistry {
  const registry: BlueprintRegistry = new Map();

  const allBlueprints: VersionedTranslationBlueprint[] = [
    // Stellar Asset Contract — Transfer events
    ...createAllSacBlueprints(),

    // Stellar Asset Contract — Mint/Burn events
    createSacMintBurnBlueprint("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"),
    createSacMintBurnBlueprint("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
    createSacMintBurnBlueprint("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"),
    createSacMintBurnBlueprint("CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"),

    // TODO: Add Soroswap Router blueprint (see good-first-issues.json GFI-003)
    // TODO: Add Blend Protocol blueprint
    // TODO: Add Phoenix DEX blueprint
  ];

  for (const blueprint of allBlueprints) {
    const existing = registry.get(blueprint.contractId) ?? [];
    existing.push(blueprint);
    registry.set(blueprint.contractId, existing);
  }

  // Sort each contract's blueprints descending by validFromLedger so the
  // engine can find the applicable version with a simple linear scan.
  for (const [contractId, blueprints] of Array.from(registry.entries())) {
    registry.set(
      contractId,
      blueprints.sort(
        (a: VersionedTranslationBlueprint, b: VersionedTranslationBlueprint) =>
          (b.validFromLedger ?? 0) - (a.validFromLedger ?? 0)
      )
    );
  }

  return registry;
}

/** Singleton registry instance. */
const REGISTRY: BlueprintRegistry = buildRegistry();

/**
 * Selects the correct versioned blueprint for an event by finding the newest
 * schema whose validFromLedger is less than or equal to the event's ledger.
 *
 * Blueprints are pre-sorted descending by validFromLedger, so the first match
 * is always the most recent applicable version.
 */
function resolveBlueprint(
  blueprints: VersionedTranslationBlueprint[],
  ledger: number
): VersionedTranslationBlueprint | null {
  for (const blueprint of blueprints) {
    if ((blueprint.validFromLedger ?? 0) <= ledger) {
      return blueprint;
    }
  }
  return null;
}

/**
 * Translates a single raw Soroban event into a human-readable TranslatedEvent.
 *
 * Looks up the contract ID in the registry, selects the schema version that
 * matches the event's ledger, and calls its translate() function. If no
 * blueprint is found or the blueprint returns null, the event is marked as
 * "cryptic".
 */
export function translateEvent(event: RawEvent): TranslatedEvent {
  const blueprints = REGISTRY.get(event.contractId);

  if (!blueprints) {
    return {
      raw: event,
      description: null,
      status: "cryptic",
      blueprintName: null,
      eventType: null,
      schemaVersion: null,
    };
  }

  const blueprint = resolveBlueprint(blueprints, event.ledger);

  if (!blueprint) {
    return {
      raw: event,
      description: null,
      status: "cryptic",
      blueprintName: null,
      eventType: null,
      schemaVersion: null,
    };
  }

  const result = blueprint.translate(event);

  if (!result) {
    return {
      raw: event,
      description: null,
      status: "cryptic",
      blueprintName: blueprint.contractName,
      eventType: null,
      schemaVersion: blueprint.version ?? null,
    };
  }

  return {
    raw: event,
    description: result.description,
    status: "translated",
    blueprintName: blueprint.contractName,
    eventType: result.eventType,
    schemaVersion: blueprint.version ?? null,
  };
}

/**
 * Translates a batch of raw events.
 * Preserves order and handles errors per-event gracefully.
 */
export function translateEvents(events: RawEvent[]): TranslatedEvent[] {
  return events.map(function (event: RawEvent): TranslatedEvent {
    try {
      return translateEvent(event);
    } catch {
      return {
        raw: event,
        description: null,
        status: "cryptic",
        blueprintName: null,
        eventType: null,
        schemaVersion: null,
      };
    }
  });
}

/**
 * Returns true if a contract ID has a registered blueprint.
 */
export function hasBlueprint(contractId: string): boolean {
  return REGISTRY.has(contractId);
}

/**
 * Returns the list of all registered contract IDs.
 */
export function getRegisteredContracts(): string[] {
  return Array.from(REGISTRY.keys());
}

/**
 * Returns the number of registered blueprints.
 */
export function getBlueprintCount(): number {
  return REGISTRY.size;
}

/**
 * Registers one or more versioned blueprints for a contract at runtime.
 *
 * Call this to add or upgrade a contract's translation schemas without
 * rebuilding the singleton. The blueprint list is re-sorted after insertion.
 */
export function registerBlueprint(...blueprints: VersionedTranslationBlueprint[]): void {
  for (const blueprint of blueprints) {
    const existing = REGISTRY.get(blueprint.contractId) ?? [];
    existing.push(blueprint);
    REGISTRY.set(
      blueprint.contractId,
      existing.sort((a, b) => (b.validFromLedger ?? 0) - (a.validFromLedger ?? 0))
    );
  }
}