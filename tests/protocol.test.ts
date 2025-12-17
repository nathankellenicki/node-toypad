import { describe, expect, it } from "vitest";
import { ActionType, ToyPadPanel } from "../src/constants";
import {
  createSetColorCommand,
  decodeMessage,
  encodeCommand,
  type ToyPadCommand
} from "../src/protocol";

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
});
