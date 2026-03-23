import { describe, expect, it, vi } from "vitest";
import { ToyPad } from "../src/toypad.js";
import { ActionType, RequestType, ToyPadPanel } from "../src/constants.js";
import type { ToyPadTagEvent } from "../src/protocol.js";
import { CharacterId, UpgradeId, VehicleId } from "../src/ids.js";
import { decodeUpgradePayload, encodePresetPayload, encodeUpgradePayload } from "../src/upgrades.js";
import { TagType } from "../src/tag.js";

function makeEvent(panel: ToyPadPanel, index: number, signatureBytes: number[]): ToyPadTagEvent {
  const raw = Buffer.from(signatureBytes);
  const signature = raw
    .toString("hex")
    .match(/.{1,2}/g)!
    .join(" ");
  return {
    kind: "event",
    panel,
    action: ActionType.Add,
    index,
    tagType: 0,
    signature,
    raw
  };
}

describe("ToyPad tag tracking", () => {
  it("suppresses duplicate add events for the same signature and index", () => {
    const toyPad = new ToyPad();
    const handler = vi.fn();
    toyPad.on("add", handler);
    const event = makeEvent(ToyPadPanel.Left, 1, [0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
    (toyPad as any).forwardEvent(event);
    (toyPad as any).forwardEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("requires a signature when multiple tags share a panel", async () => {
    const toyPad = new ToyPad();
    (toyPad as any).forwardEvent(makeEvent(ToyPadPanel.Left, 1, [0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]));
    (toyPad as any).forwardEvent(makeEvent(ToyPadPanel.Left, 2, [0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02]));

    await expect(toyPad.readTag(ToyPadPanel.Left)).rejects.toThrow(/Multiple tags/);
  });

  it("reads the correct tag when a signature is supplied", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0x47, 0x37, 0xe2, 0x48, 0x3f, 0x80];
    const signatureEvent = makeEvent(ToyPadPanel.Center, 3, signatureBytes);
    (toyPad as any).forwardEvent(signatureEvent);

    const encrypted = Buffer.from([0x5c, 0xf7, 0x1c, 0xde, 0x29, 0xad, 0xea, 0x08]);
    const cardData = Buffer.concat([encrypted, Buffer.alloc(8, 0)]);
    const mockResponse = Buffer.concat([Buffer.from([0x00]), cardData]);
    const request = vi.fn().mockResolvedValue(mockResponse);
    (toyPad as any).connection = {
      request
    };

    const result = await toyPad.readTag(ToyPadPanel.Center, signatureEvent.signature);
    expect(result.id).toBe(CharacterId.Emmet);
    expect(result.signature).toBe(signatureEvent.signature);
    expect(result.type).toBeDefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("writes vehicle upgrades using the encoder", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
    const event = makeEvent(ToyPadPanel.Left, 2, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(1000, 1);
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 1 + 8);

    const upgradeBlock = Buffer.from([
      0xaa, 0xaa, 0xaa, 0xaa,
      0x11, 0x22, 0x33, 0x44,
      0xbb, 0xbb, 0xbb, 0xbb,
      0x55, 0x66, 0x77, 0x88
    ]);
    const upgradeResponse = Buffer.concat([Buffer.from([0x00]), upgradeBlock]);

    const request = vi.fn()
      .mockResolvedValueOnce(vehicleResponse)
      .mockResolvedValueOnce(upgradeResponse)
      .mockResolvedValue(Buffer.alloc(0));
    (toyPad as any).connection = { request };

    await toyPad.writeVehicleUpgrades(ToyPadPanel.Left, {
      signature: event.signature,
      upgrades: [{ id: UpgradeId.Map1PowerDigit20, value: true }]
    });

    expect(request).toHaveBeenCalledTimes(3);
    const writeCommand = request.mock.calls[2][0];
    expect(writeCommand.id).toBe(RequestType.WriteTag);
    expect(writeCommand.params[1]).toBe(0x23);

    const payload = writeCommand.params.slice(2);
    const basePayload = Buffer.alloc(8);
    upgradeBlock.subarray(0, 4).copy(basePayload, 0);
    upgradeBlock.subarray(8, 12).copy(basePayload, 4);
    const expected = encodeUpgradePayload(1, [{ id: UpgradeId.Map1PowerDigit20, value: true }], basePayload);
    expect(Buffer.from(payload.slice(0, 4))).toEqual(expected.subarray(0, 4));
    expect(Buffer.from(payload.slice(4, 8))).toEqual(Buffer.from([0x11, 0x22, 0x33, 0x44]));
    expect(Buffer.from(payload.slice(8, 12))).toEqual(expected.subarray(4, 8));
    expect(Buffer.from(payload.slice(12, 16))).toEqual(Buffer.from([0x55, 0x66, 0x77, 0x88]));
  });

  it("allows numeric upgrade overrides", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
    const event = makeEvent(ToyPadPanel.Center, 6, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(1000, 1);
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 9);

    const upgradeBlock = Buffer.alloc(16, 0);
    const upgradeResponse = Buffer.concat([Buffer.from([0x00]), upgradeBlock]);
    const request = vi.fn()
      .mockResolvedValueOnce(vehicleResponse)
      .mockResolvedValueOnce(upgradeResponse)
      .mockResolvedValue(Buffer.alloc(0));
    (toyPad as any).connection = { request };

    await toyPad.writeVehicleUpgrades(ToyPadPanel.Center, {
      signature: event.signature,
      upgrades: [{ id: UpgradeId.Map1ExtrasDigit11, value: 3 }]
    });

    const expected = encodeUpgradePayload(1, [{ id: UpgradeId.Map1ExtrasDigit11, value: 3 }]);
    const writeCommand = request.mock.calls[2][0];
    const payload = writeCommand.params.slice(2);
    expect(Buffer.from(payload.slice(0, 4))).toEqual(expected.subarray(0, 4));
    expect(Buffer.from(payload.slice(8, 12))).toEqual(expected.subarray(4, 8));
  });

  it("ignores null/undefined upgrade overrides", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
    const event = makeEvent(ToyPadPanel.Right, 7, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(1000, 1);
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 9);

    const upgradeBlock = Buffer.alloc(16, 0);
    const upgradeResponse = Buffer.concat([Buffer.from([0x00]), upgradeBlock]);
    const request = vi.fn()
      .mockResolvedValueOnce(vehicleResponse)
      .mockResolvedValueOnce(upgradeResponse)
      .mockResolvedValue(Buffer.alloc(0));
    (toyPad as any).connection = { request };

    await toyPad.writeVehicleUpgrades(ToyPadPanel.Right, {
      signature: event.signature,
      upgrades: [
        { id: UpgradeId.Map1PowerDigit20, value: undefined },
        { id: UpgradeId.Map1WeaponsDigit19, value: null }
      ]
    });

    const writeCommand = request.mock.calls[2][0];
    const payload = Buffer.from(writeCommand.params.slice(2));
    expect(payload.subarray(0, 4)).toEqual(Buffer.alloc(4, 0));
    expect(payload.subarray(8, 12)).toEqual(Buffer.alloc(4, 0));
  });

  it("rejects upgrade writes on empty vehicle tags", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06];
    const event = makeEvent(ToyPadPanel.Left, 9, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(0, 1); // Empty vehicle id
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 9);

    const request = vi.fn().mockResolvedValueOnce(vehicleResponse);
    (toyPad as any).connection = { request };

    await expect(
      toyPad.writeVehicleUpgrades(ToyPadPanel.Left, {
        signature: event.signature,
        upgrades: [{ id: UpgradeId.Map1PowerDigit20, value: true }]
      })
    ).rejects.toThrow(/empty vehicle/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves existing upgrades when only some slots are updated", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42];
    const event = makeEvent(ToyPadPanel.Center, 8, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(1000, 1);
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 9);

    const basePayload = encodeUpgradePayload(1, [
      { id: UpgradeId.Map1PowerDigit20, value: true },
      { id: UpgradeId.Map1WeaponsDigit19, value: 2 }
    ]);
    const upgradeBlock = Buffer.alloc(16, 0);
    basePayload.subarray(0, 4).copy(upgradeBlock, 0);
    basePayload.subarray(4, 8).copy(upgradeBlock, 8);
    const upgradeResponse = Buffer.concat([Buffer.from([0x00]), upgradeBlock]);

    const request = vi.fn()
      .mockResolvedValueOnce(vehicleResponse)
      .mockResolvedValueOnce(upgradeResponse)
      .mockResolvedValue(Buffer.alloc(0));
    (toyPad as any).connection = { request };

    await toyPad.writeVehicleUpgrades(ToyPadPanel.Center, {
      signature: event.signature,
      upgrades: [{ id: UpgradeId.Map1WeaponsDigit19, value: 1 }]
    });

    const writeCommand = request.mock.calls[2][0];
    const payloadBytes = Buffer.from(writeCommand.params.slice(2));
    const mergedPayload = Buffer.alloc(8);
    payloadBytes.subarray(0, 4).copy(mergedPayload, 0);
    payloadBytes.subarray(8, 12).copy(mergedPayload, 4);
    const decoded = decodeUpgradePayload(1, mergedPayload);
    const bolts = decoded.find((slot) => slot.id === UpgradeId.Map1PowerDigit20);
    const mines = decoded.find((slot) => slot.id === UpgradeId.Map1WeaponsDigit19);
    expect(bolts?.value).toBeGreaterThan(0);
    expect(mines?.value).toBe(1);
  });

  it("writes preset upgrades when reprogramming vehicles", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
    const event = makeEvent(ToyPadPanel.Right, 4, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleCardData = Buffer.alloc(16, 0);
    vehicleCardData.writeUInt16LE(0x03e8, 0); // vehicle id 1000
    vehicleCardData.set([0x00, 0x01, 0x00, 0x00], 8);
    const readVehicleResponse = Buffer.concat([Buffer.from([0x00]), vehicleCardData]);

    const existingUpgradeBlock = Buffer.from([
      0x10, 0x11, 0x12, 0x13,
      0x20, 0x21, 0x22, 0x23,
      0x30, 0x31, 0x32, 0x33,
      0x40, 0x41, 0x42, 0x43
    ]);
    const readUpgradeResponse = Buffer.concat([Buffer.from([0x00]), existingUpgradeBlock]);

    const request = vi.fn()
      .mockResolvedValueOnce(readVehicleResponse)
      .mockResolvedValueOnce(readUpgradeResponse)
      .mockResolvedValueOnce(Buffer.alloc(0))
      .mockResolvedValueOnce(Buffer.alloc(0));
    (toyPad as any).connection = { request };

    await toyPad.writeVehicle(ToyPadPanel.Right, VehicleId.PoliceCar, { signature: event.signature });

    expect(request).toHaveBeenCalledTimes(4);
    const upgradeCommand = request.mock.calls[2][0];
    expect(upgradeCommand.id).toBe(RequestType.WriteTag);
    expect(upgradeCommand.params[1]).toBe(0x23);
    const preset = encodePresetPayload(1, 0);
    expect(preset).toBeDefined();
    const payload = Buffer.from(upgradeCommand.params.slice(2));
    expect(payload.subarray(0, 4)).toEqual(preset!.subarray(0, 4));
    expect(payload.subarray(8, 12)).toEqual(preset!.subarray(4, 8));
    expect(payload.subarray(4, 8)).toEqual(existingUpgradeBlock.subarray(4, 8));
    expect(payload.subarray(12, 16)).toEqual(existingUpgradeBlock.subarray(12, 16));

    const vehicleCommand = request.mock.calls[3][0];
    expect(vehicleCommand.id).toBe(RequestType.WriteTag);
    expect(vehicleCommand.params[1]).toBe(0x24);
  });

  it("throws when preset data is missing for a vehicle", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88];
    const event = makeEvent(ToyPadPanel.Left, 5, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleCardData = Buffer.alloc(16, 0);
    vehicleCardData.writeUInt16LE(0x0000, 0); // Empty vehicle tag id 0
    vehicleCardData.set([0x00, 0x01, 0x00, 0x00], 8);
    const readVehicleResponse = Buffer.concat([Buffer.from([0x00]), vehicleCardData]);

    const request = vi.fn().mockResolvedValueOnce(readVehicleResponse);
    (toyPad as any).connection = { request };

    await expect(
      toyPad.writeVehicle(ToyPadPanel.Left, VehicleId.EmptyVehicleTag, { signature: event.signature })
    ).rejects.toThrow(/preset/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reads vehicle upgrades with decoded slot values", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60];
    const event = makeEvent(ToyPadPanel.Center, 5, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(1000, 1); // Police Car
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 9);

    const upgradePayload = encodeUpgradePayload(1, [
      { id: UpgradeId.Map1SpeedDigit229, value: true },
      { id: UpgradeId.Map1SpeedDigit22, value: true }
    ]);
    const upgradeBlock = Buffer.alloc(16, 0);
    upgradePayload.subarray(0, 4).copy(upgradeBlock, 0);
    upgradePayload.subarray(4, 8).copy(upgradeBlock, 8);
    const upgradeResponse = Buffer.concat([Buffer.from([0x00]), upgradeBlock]);

    const request = vi.fn()
      .mockResolvedValueOnce(vehicleResponse)
      .mockResolvedValueOnce(upgradeResponse);
    (toyPad as any).connection = { request };

    const slots = await toyPad.readVehicleUpgrades(ToyPadPanel.Center, { signature: event.signature });
    expect(request).toHaveBeenCalledTimes(2);
    expect(Array.isArray(slots)).toBe(true);
    const boolSlot = slots.find((slot) => slot.id === UpgradeId.Map1SpeedDigit22);
    const numericSlot = slots.find((slot) => slot.id === UpgradeId.Map1SpeedDigit229);
    expect(typeof boolSlot?.value).toBe("boolean");
    expect(typeof numericSlot?.value).toBe("number");
    expect((numericSlot?.value as number) > 0).toBe(true);
  });

  it("returns no upgrades for empty vehicle tags", async () => {
    const toyPad = new ToyPad();
    const signatureBytes = [0x04, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa];
    const event = makeEvent(ToyPadPanel.Center, 6, signatureBytes);
    (toyPad as any).forwardEvent(event);

    const vehicleResponse = Buffer.alloc(17, 0);
    vehicleResponse.writeUInt32LE(0, 1);
    vehicleResponse.set([0x00, 0x01, 0x00, 0x00], 9);

    const request = vi.fn().mockResolvedValueOnce(vehicleResponse);
    (toyPad as any).connection = { request };

    const slots = await toyPad.readVehicleUpgrades(ToyPadPanel.Center, { signature: event.signature });
    expect(slots).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries upgrade block reads before failing", async () => {
    const toyPad = new ToyPad();
    (toyPad as any).connection = {};
    const tag: any = { index: 1, uid: Buffer.alloc(7, 0), signature: "aa" };
    const block = Buffer.alloc(16, 0);
    const readBlock = vi.spyOn(toyPad as any, "readBlock")
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(block);

    const result = await (toyPad as any).readUpgradeBlock(tag);
    expect(result).toBe(block);
    expect(readBlock).toHaveBeenCalledTimes(2);
  });

  it("lists tags from the portal", async () => {
    const toyPad = new ToyPad();
    const responsePayload = Buffer.from([0x30, 0x00, 0x21, 0x00]);
    const request = vi.fn().mockResolvedValue(responsePayload);
    (toyPad as any).connection = { request };

    const tags = await toyPad.listTags();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].id).toBe(RequestType.ListTags);
    expect(tags).toEqual([
      { panel: ToyPadPanel.Right, index: 0, status: "ok" },
      { panel: ToyPadPanel.Left, index: 1, status: "ok" }
    ]);
  });

  it("reads a character tag by index, fetching UID from page 0", async () => {
    const toyPad = new ToyPad();

    // Page 0: UID bytes at [0,1,2] and [4,5,6,7]
    // UID = 04 47 37 e2 48 3f 80
    const page0Data = Buffer.alloc(16, 0);
    page0Data[0] = 0x04; page0Data[1] = 0x47; page0Data[2] = 0x37;
    page0Data[3] = 0x88; // BCC0 (ignored)
    page0Data[4] = 0xe2; page0Data[5] = 0x48; page0Data[6] = 0x3f; page0Data[7] = 0x80;
    const page0Response = Buffer.concat([Buffer.from([0x00]), page0Data]);

    // Page 0x24: encrypted character data for Emmet with this UID
    const encrypted = Buffer.from([0x5c, 0xf7, 0x1c, 0xde, 0x29, 0xad, 0xea, 0x08]);
    const cardData = Buffer.concat([encrypted, Buffer.alloc(8, 0)]);
    const page24Response = Buffer.concat([Buffer.from([0x00]), cardData]);

    const request = vi.fn()
      .mockResolvedValueOnce(page0Response)
      .mockResolvedValueOnce(page24Response);
    (toyPad as any).connection = { request };

    const result = await toyPad.readTag(ToyPadPanel.Center, 3);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0].id).toBe(RequestType.ReadTag);
    expect(request.mock.calls[0][0].params[1]).toBe(0x00);
    expect(request.mock.calls[1][0].params[1]).toBe(0x24);
    expect(result.id).toBe(CharacterId.Emmet);
    expect(result.type).toBe(TagType.Character);
    expect(result.signature).toBe("04 47 37 e2 48 3f 80");
  });

  it("reads a vehicle tag by index", async () => {
    const toyPad = new ToyPad();

    const page0Data = Buffer.alloc(16, 0);
    page0Data[0] = 0x04; page0Data[1] = 0x11; page0Data[2] = 0x22;
    page0Data[4] = 0x33; page0Data[5] = 0x44; page0Data[6] = 0x55; page0Data[7] = 0x66;
    const page0Response = Buffer.concat([Buffer.from([0x00]), page0Data]);

    const vehicleCardData = Buffer.alloc(16, 0);
    vehicleCardData.writeUInt16LE(1000, 0);
    vehicleCardData.set([0x00, 0x01, 0x00, 0x00], 8);
    const page24Response = Buffer.concat([Buffer.from([0x00]), vehicleCardData]);

    const request = vi.fn()
      .mockResolvedValueOnce(page0Response)
      .mockResolvedValueOnce(page24Response);
    (toyPad as any).connection = { request };

    const result = await toyPad.readTag(ToyPadPanel.Left, 5);
    expect(result.id).toBe(VehicleId.PoliceCar);
    expect(result.type).toBe(TagType.Vehicle);
  });

  it("sends setColors command", () => {
    const toyPad = new ToyPad();
    const send = vi.fn();
    (toyPad as any).connection = { send };

    toyPad.setColors(0xff0000, null, 0x0000ff);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe(RequestType.SetColorAll);
  });

  it("sends fadeAll command", () => {
    const toyPad = new ToyPad();
    const send = vi.fn();
    (toyPad as any).connection = { send };

    toyPad.fadeAll({ speed: 10, cycles: 1, color: 0xff0000 }, null, null);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe(RequestType.FadeAll);
  });

  it("sends flashAll command", () => {
    const toyPad = new ToyPad();
    const send = vi.fn();
    (toyPad as any).connection = { send };

    toyPad.flashAll({ color: 0xff0000, count: 3 }, null, null);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe(RequestType.FlashAll);
  });

  it("sends fade command with params object", () => {
    const toyPad = new ToyPad();
    const send = vi.fn();
    (toyPad as any).connection = { send };

    toyPad.fade(ToyPadPanel.Left, { speed: 5, cycles: 2, color: 0xaa33ff });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.id).toBe(RequestType.Fade);
    expect(command.params).toEqual([ToyPadPanel.Left, 5, 2, 0xaa, 0x33, 0xff]);
  });

  it("sends flash command with params object", () => {
    const toyPad = new ToyPad();
    const send = vi.fn();
    (toyPad as any).connection = { send };

    toyPad.flash(ToyPadPanel.Center, { color: 0x0a0b0c, count: 3, onTicks: 1, offTicks: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.id).toBe(RequestType.Flash);
    expect(command.params).toEqual([ToyPadPanel.Center, 2, 1, 3, 0x0a, 0x0b, 0x0c]);
  });
});
