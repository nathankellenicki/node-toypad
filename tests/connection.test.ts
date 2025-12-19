import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToyPadConnection } from "../src/connection.js";
import { RequestType, ToyPadPanel } from "../src/constants.js";
import { createSetColorCommand } from "../src/protocol.js";

type MockHidState = {
  devices: Array<{ vendorId?: number; productId?: number; path?: string }>;
  lastInstance?: {
    write: (...args: any[]) => any;
    close: (...args: any[]) => any;
    on: (event: string, handler: (...args: any[]) => void) => void;
    removeListener: (event: string, handler: (...args: any[]) => void) => void;
    emit: (event: string, ...args: any[]) => void;
  };
  pathErrors: Map<string, Error>;
  vendorProductError?: Error;
};

function getMockState(): MockHidState {
  const globalState = (globalThis as { __mockHidState?: MockHidState }).__mockHidState;
  if (globalState) {
    return globalState;
  }
  const initial: MockHidState = {
    devices: [],
    lastInstance: undefined,
    pathErrors: new Map<string, Error>(),
    vendorProductError: undefined
  };
  (globalThis as { __mockHidState?: MockHidState }).__mockHidState = initial;
  return initial;
}

vi.mock("node-hid", () => {
  const state = getMockState();
  class MockHID {
    private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();
    write = vi.fn();
    close = vi.fn();
    constructor(...args: any[]) {
      if (args.length === 1) {
        const path = args[0] as string;
        const error = state.pathErrors.get(path);
        if (error) {
          throw error;
        }
      }
      if (args.length === 2 && state.vendorProductError) {
        throw state.vendorProductError;
      }
      state.lastInstance = this;
    }

    on(event: string, handler: (...args: any[]) => void): void {
      const existing = this.listeners.get(event) ?? new Set();
      existing.add(handler);
      this.listeners.set(event, existing);
    }

    removeListener(event: string, handler: (...args: any[]) => void): void {
      const existing = this.listeners.get(event);
      if (!existing) {
        return;
      }
      existing.delete(handler);
    }

    emit(event: string, ...args: any[]): void {
      const handlers = this.listeners.get(event);
      if (!handlers) {
        return;
      }
      for (const handler of Array.from(handlers)) {
        handler(...args);
      }
    }
  }
  return {
    default: {
      devices: vi.fn(() => state.devices),
      HID: MockHID
    }
  };
});

function makeResponse(requestId: number, payload: number[]): Buffer {
  const buffer = Buffer.alloc(32, 0);
  const length = payload.length + 1;
  buffer[0] = 0x55;
  buffer[1] = length & 0xff;
  buffer[2] = requestId & 0xff;
  buffer.set(payload, 3);
  return buffer;
}

function makeEvent(): Buffer {
  const buffer = Buffer.alloc(32, 0);
  buffer.set([
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
  ]);
  return buffer;
}

describe("ToyPadConnection", () => {
  const mockState = getMockState();

  beforeEach(() => {
    mockState.devices = [];
    mockState.pathErrors.clear();
    mockState.vendorProductError = undefined;
    mockState.lastInstance = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the HID device and writes the wake sequence", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    await connection.open();
    expect(mockState.lastInstance).toBeDefined();
    expect(mockState.lastInstance?.write).toHaveBeenCalledTimes(1);
  });

  it("emits connect after the first long response payload", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    const handler = vi.fn();
    connection.on("connect", handler);
    await connection.open();
    const response = makeResponse(1, new Array(20).fill(0xaa));
    mockState.lastInstance?.emit("data", response);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("resolves requests when a response arrives", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    await connection.open();
    const command = createSetColorCommand(ToyPadPanel.Left, 0x112233);
    const pending = connection.request(command);
    const response = makeResponse(1, [0xde, 0xad]);
    mockState.lastInstance?.emit("data", response);
    await expect(pending).resolves.toEqual(Buffer.from([0xde, 0xad]));
  });

  it("emits message when a response arrives without a pending request", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    await connection.open();
    const handler = vi.fn();
    connection.on("message", handler);
    const response = makeResponse(7, [0x01]);
    mockState.lastInstance?.emit("data", response);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits events when tag data arrives", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    await connection.open();
    const handler = vi.fn();
    connection.on("event", handler);
    mockState.lastInstance?.emit("data", makeEvent());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("times out requests and clears pending entries", async () => {
    vi.useFakeTimers();
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    await connection.open();
    const promise = connection.request({ id: RequestType.SetColor, params: [ToyPadPanel.Left, 0, 0, 0] }, 5);
    vi.advanceTimersByTime(6);
    await expect(promise).rejects.toThrow(/timed out/);
  });

  it("rejects pending requests on close", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    const connection = new ToyPadConnection();
    await connection.open();
    const promise = connection.request({ id: RequestType.GetColor, params: [ToyPadPanel.Left] }, 50);
    connection.close();
    await expect(promise).rejects.toThrow(/connection closed/);
  });

  it("falls back to vendor/product when path opens fail", async () => {
    mockState.devices = [{ vendorId: 0x0e6f, productId: 0x0241, path: "/dev/toypad" }];
    mockState.pathErrors.set("/dev/toypad", new Error("permission denied"));
    const connection = new ToyPadConnection();
    await connection.open();
    expect(mockState.lastInstance).toBeDefined();
  });

  it("throws a helpful error when the device cannot be opened", async () => {
    mockState.devices = [];
    mockState.vendorProductError = new Error("not found");
    const connection = new ToyPadConnection();
    await expect(connection.open()).rejects.toThrow(/Unable to open ToyPad HID device/);
  });
});
