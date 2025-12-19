import debug from "debug";
import { UPGRADE_DEFINITIONS } from "./upgrades-data.js";
import { UpgradeId } from "./ids.js";
import { getUpgradeLabel } from "./metadata.js";
import { getUpgradeDigits } from "./upgrade-token-map.js";

export type UpgradeGroup = "speed" | "power" | "weapons" | "extras" | "colors";
export type UpgradeOverrideValue = boolean | number;
export interface UpgradeOverride {
  id: UpgradeId;
  value: UpgradeOverrideValue | undefined | null;
}
export type UpgradeOverrides = UpgradeOverride[];

const GROUPS: UpgradeGroup[] = ["speed", "power", "weapons", "extras", "colors"];

interface UpgradeSlotDefinition {
  slot: number;
  max: number;
  digitId?: number;
  label?: string;
  id: UpgradeId;
}

interface PresetSlotDefinition {
  slot: number;
  value: number;
  digitId?: number;
  id: UpgradeId;
}

type UpgradePresetDefinition = Partial<Record<UpgradeGroup, PresetSlotDefinition[]>>;

interface UpgradeDefinition {
  map: number;
  slots: Record<UpgradeGroup, UpgradeSlotDefinition[]>;
  presets?: Record<string, UpgradePresetDefinition>;
}

interface DigitEntry {
  id: number;
  maxValue: number;
}

const log = debug("node-toypad:upgrades");

const upgradeDefinitions = (UPGRADE_DEFINITIONS as unknown as UpgradeDefinition[]) ?? [];
const missingSlotWarnings = new Set<string>();

function findUpgradeDefinition(mapId: number): UpgradeDefinition | undefined {
  return upgradeDefinitions.find((entry) => entry.map === mapId);
}

function getDefinition(mapId: number): UpgradeDefinition {
  const definition = findUpgradeDefinition(mapId);
  if (!definition) {
    throw new Error(`Unknown upgrade map ${mapId}`);
  }
  return definition;
}

function buildSlotLookup(definition: UpgradeDefinition): Map<UpgradeId, UpgradeSlotDefinition> {
  const lookup = new Map<UpgradeId, UpgradeSlotDefinition>();
  for (const group of GROUPS) {
    const slots = definition.slots[group] ?? [];
    for (const slotDef of slots) {
      lookup.set(slotDef.id, slotDef);
    }
  }
  return lookup;
}

function getDigitEntries(mapId: number): DigitEntry[] {
  const digits = getUpgradeDigits(mapId);
  if (!digits.length) {
    return [];
  }
  return digits.map((maxValue, index) => ({
    id: index,
    maxValue: maxValue || 0
  }));
}

function warnMissingSlot(mapId: number, slotId: UpgradeId, group: UpgradeGroup, max: number): void {
  if (max <= 1) {
    return;
  }
  const key = `${mapId}:${slotId}`;
  if (missingSlotWarnings.has(key)) {
    return;
  }
  missingSlotWarnings.add(key);
  log(`Upgrade slot ${slotId} (map ${mapId}, group ${group}) is missing encoder metadata and will decode as 0.`);
}

function clamp(value: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (maxValue <= 0) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return Math.trunc(value);
}

function decodeEncoderValues(entries: DigitEntry[], payload: Buffer): number[] {
  if (payload.length < 8) {
    throw new Error("Upgrade payload must be 8 bytes.");
  }
  const total = payload.readBigUInt64BE(0);
  const values = entries.map(() => 0);
  let remainder = total;
  for (let i = entries.length - 1; i >= 0; i--) {
    const baseValue = entries[i].maxValue || 0;
    const base = BigInt(baseValue + 1);
    if (base === BigInt(0)) {
      values[i] = 0;
      continue;
    }
    const digit = remainder % base;
    values[i] = Number(digit);
    remainder = remainder / base;
  }
  return values;
}

export function encodeUpgradePayload(mapId: number, overrides: UpgradeOverrides, basePayload?: Buffer): Buffer {
  if (!overrides || !overrides.length) {
    throw new Error("No upgrades specified.");
  }
  const definition = getDefinition(mapId);
  const entries = getDigitEntries(definition.map);
  const values = basePayload && basePayload.length >= 8 ? decodeEncoderValues(entries, basePayload) : entries.map(() => 0);
  const slotLookup = buildSlotLookup(definition);

  for (const override of overrides) {
    const rawValue = override.value;
    if (rawValue === undefined) {
      continue;
    }
    const slotDef = slotLookup.get(override.id);
    if (!slotDef) {
      throw new Error(`Upgrade ${override.id} is not valid for map ${mapId}.`);
    }
    if (typeof slotDef.digitId !== "number") {
      throw new Error(`Upgrade ${override.id} cannot be written because encoder metadata is missing.`);
    }
    const entry = entries[slotDef.digitId];
    if (!entry) {
      continue;
    }
    const maxValue = entry.maxValue;
    const normalized = normalizeOverrideValue(rawValue, maxValue, slotDef.id);
    if (normalized === undefined) {
      continue;
    }
    values[slotDef.digitId] = normalized;
  }

  let total = BigInt(0);
  let multiplier = BigInt(1);
  for (let i = entries.length - 1; i >= 0; i--) {
    total += BigInt(values[i]) * multiplier;
    const base = BigInt((entries[i].maxValue || 0) + 1);
    multiplier *= base === BigInt(0) ? BigInt(1) : base;
  }

  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(total);
  return buffer;
}

function buildOverridesFromPreset(preset: UpgradePresetDefinition): UpgradeOverrides {
  const overrides: UpgradeOverrides = [];
  for (const group of GROUPS) {
    const slots = preset[group];
    if (!slots) {
      continue;
    }
    for (const slot of slots) {
      if (typeof slot.digitId !== "number") {
        continue;
      }
      overrides.push({
        id: slot.id,
        value: slot.value ?? 0
      });
    }
  }
  return overrides;
}

export function getPresetOverrides(mapId: number, step: number): UpgradeOverrides | undefined {
  const definition = findUpgradeDefinition(mapId);
  if (!definition || !definition.presets) {
    return undefined;
  }
  const preset = definition.presets[`step${step}`];
  if (!preset) {
    return undefined;
  }
  const overrides = buildOverridesFromPreset(preset);
  return overrides.length ? overrides : undefined;
}

export function encodePresetPayload(mapId: number, step: number): Buffer | undefined {
  const overrides = getPresetOverrides(mapId, step);
  if (!overrides) {
    return undefined;
  }
  return encodeUpgradePayload(mapId, overrides);
}

function normalizeOverrideValue(value: UpgradeOverrideValue | undefined | null, maxValue: number, slotId: UpgradeId): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value ? maxValue : 0;
  }
  if (typeof value === "number") {
    return clamp(value, maxValue);
  }
  throw new Error(`Invalid override for ${slotId}: expected boolean or number.`);
}

export interface UpgradeSlotInfo extends UpgradeSlotDefinition {
  group: UpgradeGroup;
  id: UpgradeId;
}

export interface UpgradeSlotState extends UpgradeSlotInfo {
  value: number;
}

export interface UpgradeValue {
  id: UpgradeId;
  value: boolean | number;
}

export function listUpgradeSlots(mapId: number): UpgradeSlotInfo[] {
  const definition = findUpgradeDefinition(mapId);
  if (!definition) {
    return [];
  }
  const slots: UpgradeSlotInfo[] = [];
  for (const group of GROUPS) {
    for (const slot of (definition.slots[group] ?? []).slice().sort((a, b) => a.slot - b.slot)) {
      const label = getUpgradeLabel(slot.id);
      slots.push({
        ...slot,
        ...(label ? { label } : {}),
        group
      });
    }
  }
  return slots;
}

export function decodeUpgradePayload(mapId: number, payload: Buffer): UpgradeSlotState[] {
  if (!payload || payload.length < 8) {
    throw new Error("Upgrade payload must be 8 bytes.");
  }
  const definition = getDefinition(mapId);
  const entries = getDigitEntries(definition.map);
  const entryValues = decodeEncoderValues(entries, payload);

  const states: UpgradeSlotState[] = [];
  for (const group of GROUPS) {
    for (const slot of (definition.slots[group] ?? []).slice().sort((a, b) => a.slot - b.slot)) {
      const digitId = typeof slot.digitId === "number" ? slot.digitId : undefined;
      const value = digitId !== undefined ? entryValues[digitId] ?? 0 : 0;
      if (digitId === undefined) {
        warnMissingSlot(mapId, slot.id, group, slot.max);
      }
      const label = getUpgradeLabel(slot.id);
      states.push({
        ...slot,
        ...(label ? { label } : {}),
        group,
        value
      });
    }
  }
  return states;
}
