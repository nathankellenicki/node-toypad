import { describe, expect, it } from "vitest";
import { UpgradeId } from "../src/ids.js";
import { decodeUpgradePayload, encodeUpgradePayload } from "../src/upgrades.js";

describe("upgrade encoding", () => {
  it("throws when an override has an invalid type", () => {
    const overrides: any = [{ id: UpgradeId.Map1PowerDigit20, value: "fast" }];
    expect(() => encodeUpgradePayload(1, overrides)).toThrow(/expected boolean or number/);
  });

  it("ignores undefined or null overrides", () => {
    const payload = encodeUpgradePayload(1, [
      { id: UpgradeId.Map1SpeedDigit22, value: true },
      { id: UpgradeId.Map1SpeedDigit229, value: undefined },
      { id: UpgradeId.Map1PowerDigit20, value: null }
    ] as any);
    expect(payload.length).toBe(8);
  });

  it("encodes extended tokens such as z-slots", () => {
    const payload = encodeUpgradePayload(1, [{ id: UpgradeId.Map1SpeedDigit22, value: true }]);
    const decoded = decodeUpgradePayload(1, payload);
    const slot = decoded.find((entry) => entry.id === UpgradeId.Map1SpeedDigit22);
    expect(slot?.value).toBeGreaterThan(0);
  });

  it("encodes toggle-style upgrades", () => {
    const payload = encodeUpgradePayload(1, [{ id: UpgradeId.Map1PowerDigit20, value: true }]);
    const decoded = decodeUpgradePayload(1, payload);
    const slot = decoded.find((entry) => entry.id === UpgradeId.Map1PowerDigit20);
    expect(slot?.value).toBeGreaterThan(0);
  });

  it("throws when targeting a slot that does not belong to the map", () => {
    expect(() => encodeUpgradePayload(1, [{ id: UpgradeId.Map2SpeedDigit22, value: true }])).toThrow(/not valid/);
  });

  it("merges overrides with an existing payload", () => {
    const base = encodeUpgradePayload(1, [{ id: UpgradeId.Map1PowerDigit20, value: true }]);
    const merged = encodeUpgradePayload(
      1,
      [{ id: UpgradeId.Map1WeaponsDigit19, value: 2 }],
      base
    );
    const decoded = decodeUpgradePayload(1, merged);
    const bolts = decoded.find((entry) => entry.id === UpgradeId.Map1PowerDigit20);
    const mines = decoded.find((entry) => entry.id === UpgradeId.Map1WeaponsDigit19);
    expect(bolts?.value).toBeGreaterThan(0);
    expect(mines?.value).toBe(2);
  });
});
