import charactersJson from "../data/minifigs.json";
import vehiclesJson from "../data/vehicles.json";

export interface TagMetadata {
  id: number;
  name: string;
  world: string;
}

const characters = (charactersJson as TagMetadata[]) ?? [];
const vehicles = (vehiclesJson as TagMetadata[]) ?? [];

const characterMap = new Map<number, TagMetadata>(characters.map((character) => [character.id, character]));
const vehicleMap = new Map<number, TagMetadata>(vehicles.map((vehicle) => [vehicle.id, vehicle]));

export function getCharacterById(id: number): TagMetadata | undefined {
  return characterMap.get(id);
}

export function getVehicleById(id: number): TagMetadata | undefined {
  return vehicleMap.get(id);
}

export function listCharacters(): TagMetadata[] {
  return characters.slice();
}

export function listVehicles(): TagMetadata[] {
  return vehicles.slice();
}
