import { describe, expect, it } from "vitest";
import {
  getCharacterById,
  getVehicleById,
  getVehicleMap,
  getVehicleVariant,
  getUpgradeLabel,
  listCharacters,
  listUpgradeLabels,
  listVehicles
} from "../src/metadata.js";
import { CharacterId, VehicleId, UpgradeId } from "../src/ids.js";
import { ToyPad } from "../src/toypad.js";

describe("metadata helpers", () => {
  it("returns known character metadata", () => {
    const batman = getCharacterById(CharacterId.Batman);
    expect(batman).toEqual({ id: CharacterId.Batman, name: "Batman", world: "DC Comics" });
  });

  it("returns known vehicle metadata", () => {
    const policeCar = getVehicleById(VehicleId.PoliceCar);
    expect(policeCar).toEqual({
      id: VehicleId.PoliceCar,
      name: "Police Car",
      world: "The LEGO Movie",
      parentId: VehicleId.PoliceCar
    });
    expect(getVehicleMap(VehicleId.PoliceCar)).toBe(1);
  });

  it("resolves vehicle rebuilds by step", () => {
    const base = getVehicleVariant(VehicleId.BASVan, 0);
    const variant = getVehicleVariant(VehicleId.BASVan, 2);
    const direct = getVehicleVariant(VehicleId.ThePainPlane);
    expect(base?.id).toBe(VehicleId.BASVan);
    expect(variant?.id).toBe(VehicleId.ThePainPlane);
    expect(direct?.id).toBe(VehicleId.ThePainPlane);
    expect(variant?.step).toBe(2);
    expect(getVehicleVariant(VehicleId.BASVan, 5)).toBeUndefined();
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

  it("exposes upgrade labels", () => {
    const labelsA = listUpgradeLabels();
    const labelsB = listUpgradeLabels();
    expect(labelsA).not.toBe(labelsB);
    expect(labelsA.length).toBeGreaterThan(0);
    const first = labelsA[0];
    expect(getUpgradeLabel(first.id)).toBe(first.label);
    expect(getUpgradeLabel(UpgradeId.Map1SpeedDigit22)).toBe("Model Boost Ability");
  });

  it("lists upgrade ids for vehicles", () => {
    const ids = ToyPad.metadata.listVehicleUpgrades(VehicleId.PoliceCar);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain(UpgradeId.Map1SpeedDigit22);
    expect(ToyPad.metadata.listVehicleUpgrades(VehicleId.EmptyVehicleTag)).toEqual([]);
  });

  it("returns undefined when a vehicle variant does not exist", () => {
    const invalidId = 9999 as VehicleId;
    expect(getVehicleVariant(invalidId, 0)).toBeUndefined();
  });

  it("returns undefined when metadata is missing for a vehicle id", () => {
    const invalidId = 9998 as VehicleId;
    expect(getVehicleVariant(invalidId)).toBeUndefined();
  });
});
