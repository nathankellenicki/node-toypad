import { describe, expect, it } from "vitest";
import { TagType, detectTagType, getCharacterId, getVehicleId, isVehicle } from "../src/tag.js";

describe("tag utilities", () => {
  it("detects vehicles based on marker bytes", () => {
    const marker = Buffer.from([0x00, 0x01, 0x00, 0x00]);
    expect(isVehicle(marker)).toBe(true);
    expect(detectTagType(marker)).toBe(TagType.Vehicle);
  });

  it("reads vehicle ids from NFC data", () => {
    const vehicleBlock = Buffer.from([
      0x63, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    expect(getVehicleId(vehicleBlock)).toBe(0x0463);
  });

  it("decrypts character ids from NFC payload", () => {
    const encrypted = Buffer.from([0x5c, 0xf7, 0x1c, 0xde, 0x29, 0xad, 0xea, 0x08]);
    const uid = Buffer.from([0x04, 0x47, 0x37, 0xe2, 0x48, 0x3f, 0x80]);
    expect(getCharacterId(uid, encrypted)).toBe(16);
  });

  it("treats unknown markers as characters by default", () => {
    const marker = Buffer.from([0x10, 0x20, 0x30, 0x40]);
    expect(isVehicle(marker)).toBe(false);
    expect(detectTagType(marker)).toBe(TagType.Character);
  });
});
