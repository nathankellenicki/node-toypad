import { describe, expect, it } from "vitest";
import { getCharacterById, getVehicleById, listCharacters, listVehicles } from "../src/metadata";

describe("metadata helpers", () => {
  it("returns known character metadata", () => {
    const batman = getCharacterById(1);
    expect(batman).toEqual({ id: 1, name: "Batman", world: "DC Comics" });
  });

  it("returns known vehicle metadata", () => {
    const policeCar = getVehicleById(1000);
    expect(policeCar).toEqual({ id: 1000, name: "Police Car", world: "The LEGO Movie" });
  });

  it("returns new arrays when listing metadata", () => {
    const charactersA = listCharacters();
    const charactersB = listCharacters();
    expect(charactersA).not.toBe(charactersB);
    expect(charactersA.length).toBeGreaterThan(0);
    const vehiclesA = listVehicles();
    const vehiclesB = listVehicles();
    expect(vehiclesA).not.toBe(vehiclesB);
    expect(vehiclesA.length).toBeGreaterThan(0);
  });
});
