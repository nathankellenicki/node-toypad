import charactersJson from "../data/minifigs.json" with { type: "json" };
import vehiclesJson from "../data/vehicles.json" with { type: "json" };
import upgradesJson from "../data/upgrades.json" with { type: "json" };
import { CharacterId, VehicleId, UpgradeId } from "./ids.js";
import { VEHICLE_MAP_BY_ID } from "./vehicle-map.js";

export interface CharacterMetadata {
  id: CharacterId;
  name: string;
  world: string;
}

export interface VehicleMetadata {
  id: VehicleId;
  name: string;
  world: string;
  parentId: VehicleId;
  step?: number;
}

export interface UpgradeLabelMetadata {
  id: UpgradeId;
  label: string;
}

const characters = (charactersJson as CharacterMetadata[]) ?? [];
const vehicles = (vehiclesJson as VehicleMetadata[]) ?? [];
const upgrades = (upgradesJson as UpgradeLabelMetadata[]) ?? [];

const characterMap = new Map<CharacterId, CharacterMetadata>(characters.map((character) => [character.id as CharacterId, character]));
const vehicleMap = new Map<VehicleId, VehicleMetadata>(vehicles.map((vehicle) => [vehicle.id as VehicleId, vehicle]));
const vehicleVariants = new Map<VehicleId, VehicleMetadata[]>();
const upgradeLabelMap = new Map<UpgradeId, string>(upgrades.map((entry) => [entry.id as UpgradeId, entry.label]));

for (const vehicle of vehicles) {
  const parentId = (vehicle.parentId || vehicle.id) as VehicleId;
  const variants = vehicleVariants.get(parentId) ?? [];
  variants.push(vehicle);
  vehicleVariants.set(parentId, variants);
}

for (const [parentId, variants] of vehicleVariants.entries()) {
  variants.sort((a, b) => {
    const aBase = a.id === parentId ? 0 : 1;
    const bBase = b.id === parentId ? 0 : 1;
    if (aBase !== bBase) {
      return aBase - bBase;
    }
    return a.id - b.id;
  });
}

export function getCharacterById(id: CharacterId): CharacterMetadata | undefined {
  return characterMap.get(id);
}

export function getVehicleById(id: VehicleId): VehicleMetadata | undefined {
  return vehicleMap.get(id);
}

export function getVehicleVariant(id: VehicleId, step?: number): VehicleMetadata | undefined {
  if (typeof step === "number") {
    const variants = vehicleVariants.get(id);
    if (!variants) {
      return undefined;
    }
    if (step < 0 || step >= variants.length) {
      return undefined;
    }
    const variant = variants[step];
    return { ...variant, step };
  }
  const vehicle = vehicleMap.get(id);
  if (!vehicle) {
    return undefined;
  }
  const variants = vehicleVariants.get(vehicle.parentId || vehicle.id);
  const stepIndex = variants ? variants.findIndex((entry) => entry.id === vehicle.id) : -1;
  return stepIndex >= 0 ? { ...vehicle, step: stepIndex } : vehicle;
}

export function listCharacters(): CharacterMetadata[] {
  return characters.slice();
}

export function listVehicles(): VehicleMetadata[] {
  return vehicles.slice();
}

export function getUpgradeLabel(id: UpgradeId): string | undefined {
  return upgradeLabelMap.get(id);
}

export function listUpgradeLabels(): UpgradeLabelMetadata[] {
  return upgrades.slice();
}

export function getVehicleMap(id: VehicleId): number {
  return VEHICLE_MAP_BY_ID[id] ?? 0;
}
