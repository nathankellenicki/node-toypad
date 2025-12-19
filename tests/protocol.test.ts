import { describe, expect, it } from "vitest";
import { ActionType, ToyPadPanel } from "../src/constants.js";
import {
  createFadeCommand,
  createFlashCommand,
  createGetColorCommand,
  createSetColorCommand,
  createWriteTagCommand,
  decodeColor,
  decodeMessage,
  encodeCommand,
  type ToyPadCommand
} from "../src/protocol.js";

describe("protocol helpers", () => {
  it("encodes commands into padded ToyPad packets", () => {
    const command: ToyPadCommand = {
      id: 0xc0,
      params: [ToyPadPanel.Left, 0xaa, 0xbb, 0xcc]
    };
    const encoded = encodeCommand(command, 1);
    expect(encoded.length).toBe(32);
    expect(encoded[0]).toBe(0x55);
    expect(encoded[2]).toBe(0xc0);
    expect(encoded[3]).toBe(0x01);
  });

  it("builds setColor commands with RGB components", () => {
    const command = createSetColorCommand(ToyPadPanel.Right, 0x123456);
    expect(command.id).toBe(0xc0);
    expect(command.params).toEqual([ToyPadPanel.Right, 0x12, 0x34, 0x56]);
  });

  it("builds getColor commands with zero-based panel index", () => {
    const command = createGetColorCommand(ToyPadPanel.Right);
    expect(command.id).toBe(0xc1);
    expect(command.params).toEqual([2]);
  });

  it("builds fade commands with masked colors", () => {
    const command = createFadeCommand(ToyPadPanel.Left, 5, 2, 0xffaa33ff);
    expect(command.id).toBe(0xc2);
    expect(command.params).toEqual([ToyPadPanel.Left, 5, 2, 0xaa, 0x33, 0xff]);
  });

  it("builds flash commands with default and custom tick values", () => {
    const defaultFlash = createFlashCommand(ToyPadPanel.Center, 0x0a0b0c, 3);
    expect(defaultFlash.id).toBe(0xc3);
    expect(defaultFlash.params.slice(1, 4)).toEqual([10, 10, 3]);

    const customFlash = createFlashCommand(ToyPadPanel.Center, 0x0a0b0c, 3, { onTicks: 1, offTicks: 2 });
    expect(customFlash.params.slice(1, 4)).toEqual([2, 1, 3]);
  });

  it("validates writeTag payload length", () => {
    expect(() => createWriteTagCommand(1, 0x24, Buffer.alloc(15))).toThrow(/16 bytes/);
    const command = createWriteTagCommand(1, 0x24, Buffer.alloc(16, 0x01));
    expect(command.params.length).toBe(18);
  });

  it("decodes colors and returns 0 for short payloads", () => {
    expect(decodeColor(Buffer.alloc(2, 0xff))).toBe(0);
    expect(decodeColor(Buffer.from([0x12, 0x34, 0x56]))).toBe(0x123456);
  });

  it("decodes action events from raw buffers", () => {
    const bytes = Buffer.alloc(32, 0);
    const payload = [
      0x56,
      0x0b,
      0x02,
      0x00,
      0x01,
      0x00,
      0x04,
      0x64,
      0x74,
      0xfa,
      0x00,
      0x49,
      0x81
    ];
    bytes.set(payload, 0);
    const event = decodeMessage(bytes);
    expect(event).toBeDefined();
    expect(event?.kind).toBe("event");
    if (event?.kind === "event") {
      expect(event.panel).toBe(ToyPadPanel.Left);
      expect(event.action).toBe(ActionType.Add);
      expect(event.index).toBe(1);
      expect(event.signature).toBe("04 64 74 fa 00 49 81");
    }
  });

  it("ignores invalid action events and unknown packets", () => {
    const invalid = Buffer.from([0x56, 0xff, 0x00]);
    expect(decodeMessage(invalid)).toBeUndefined();
    const unknown = Buffer.from([0x10, 0x00, 0x00]);
    expect(decodeMessage(unknown)).toBeUndefined();
  });

  it("decodes response messages with payloads", () => {
    const buffer = Buffer.alloc(32, 0);
    buffer.set([0x55, 0x04, 0x10, 0xde, 0xad, 0xbe], 0);
    const response = decodeMessage(buffer);
    expect(response).toBeDefined();
    expect(response?.kind).toBe("response");
    if (response?.kind === "response") {
      expect(response.requestId).toBe(0x10);
      expect(Array.from(response.payload.values())).toEqual([0xde, 0xad, 0xbe]);
    }
  });

  it("returns undefined for empty or truncated response payloads", () => {
    expect(decodeMessage(Buffer.alloc(0))).toBeUndefined();
    const short = Buffer.from([0x55, 0x01, 0x10]);
    expect(decodeMessage(short)).toBeUndefined();
  });

  it("truncates oversized command packets", () => {
    const params = new Array(40).fill(0xff);
    const command: ToyPadCommand = { id: 0xc0, params };
    const encoded = encodeCommand(command, 1);
    expect(encoded.length).toBe(32);
  });
});
