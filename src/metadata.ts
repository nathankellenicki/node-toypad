import charactersJson from "../data/minifigs.json";
import vehiclesJson from "../data/vehicles.json";

export interface TagMetadata {
  id: number;
  name: string;
  world: string;
}

export interface VehicleMetadata extends TagMetadata {
  parentId: number;
  map: number;
  abilities: string[];
  step?: number;
}

const characters = (charactersJson as TagMetadata[]) ?? [];
const vehicles = (vehiclesJson as VehicleMetadata[]) ?? [];

const characterMap = new Map<number, TagMetadata>(characters.map((character) => [character.id, character]));
const vehicleMap = new Map<number, VehicleMetadata>(vehicles.map((vehicle) => [vehicle.id, vehicle]));
const vehicleVariants = new Map<number, VehicleMetadata[]>();

for (const vehicle of vehicles) {
  const parentId = vehicle.parentId || vehicle.id;
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

export function getCharacterById(id: number): TagMetadata | undefined {
  return characterMap.get(id);
}

export function getVehicleById(id: number): VehicleMetadata | undefined {
  return vehicleMap.get(id);
}

export function getVehicleVariant(id: number, step?: number): VehicleMetadata | undefined {
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

export function listCharacters(): TagMetadata[] {
  return characters.slice();
}

export function listVehicles(): VehicleMetadata[] {
  return vehicles.slice();
}
