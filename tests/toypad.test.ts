import { describe, expect, it, vi } from "vitest";
import { ToyPad } from "../src/toypad";
import { ActionType, ToyPadPanel } from "../src/constants";
import type { ToyPadTagEvent } from "../src/protocol";

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
    expect(result.id).toBe(16);
    expect(result.signature).toBe(signatureEvent.signature);
    expect(result.type).toBeDefined();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
