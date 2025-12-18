import charactersJson from "../data/minifigs.json";
import vehiclesJson from "../data/vehicles.json";

export interface TagMetadata {
  id: number;
  name: string;
  world: string;
}

interface VehicleMetadata extends TagMetadata {
  parentId: number;
  map: number;
  abilities: string[];
}

const characters = (charactersJson as TagMetadata[]) ?? [];
const vehicles = (vehiclesJson as VehicleMetadata[]) ?? [];

const characterMap = new Map<number, TagMetadata>(characters.map((character) => [character.id, character]));
const vehicleMap = new Map<number, VehicleMetadata>(vehicles.map((vehicle) => [vehicle.id, vehicle]));

export function getCharacterById(id: number): TagMetadata | undefined {
  return characterMap.get(id);
}

export function getVehicleById(id: number): TagMetadata | undefined {
  const vehicle = vehicleMap.get(id);
  if (!vehicle) {
    return undefined;
  }
  const { name, world } = vehicle;
  return { id, name, world };
}

export function listCharacters(): TagMetadata[] {
  return characters.slice();
}

export function listVehicles(): TagMetadata[] {
  return vehicles.map(({ id, name, world }) => ({ id, name, world }));
}
