import { EventEmitter } from "events";
import debug from "debug";
import HID from "node-hid";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  TOY_PAD_PRODUCT_ID,
  TOY_PAD_VENDOR_ID,
  WAKE_SEQUENCE
} from "./constants";
import {
  ToyPadCommand,
  ToyPadIncomingMessage,
  ToyPadResponseMessage,
  ToyPadTagEvent,
  decodeMessage,
  encodeCommand
} from "./protocol";

const log = debug("node-legodimensions:connection");
const rawLog = debug("node-legodimensions:connection:raw");

type PendingRequest = {
  resolve: (payload: Buffer) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export interface ToyPadConnectionEvents {
  connect: () => void;
  event: (event: ToyPadTagEvent) => void;
  message: (message: ToyPadResponseMessage) => void;
  error: (error: Error) => void;
}

export class ToyPadConnection extends EventEmitter {
  private device?: HID.HID;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private hasConnected = false;
  private readonly handleDataBound = (data: Buffer | number[]) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.handleData(buffer);
  };
  private readonly handleErrorBound = (error: Error) => {
    log("device error: %s", error.message);
    this.rejectAll(error);
    this.emit("error", error);
  };

  async open(): Promise<void> {
    if (this.device) {
      return;
    }
    this.hasConnected = false;

    const hidDevice = this.createHidDevice();
    this.device = hidDevice;
    hidDevice.on("data", this.handleDataBound);
    hidDevice.on("error", this.handleErrorBound);
    this.writeRaw(WAKE_SEQUENCE);
  }

  async request(command: ToyPadCommand, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<Buffer> {
    if (!this.device) {
      throw new Error("ToyPad is not connected");
    }
    const requestId = this.nextRequestId();
    const encoded = encodeCommand(command, requestId);
    rawLog("tx %s", encoded.toString("hex"));
    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`ToyPad request 0x${command.id.toString(16)} timed out`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout
      });
      this.writeRaw(encoded);
    });
  }

  close(): void {
    if (!this.device) {
      return;
    }
    this.device.removeListener("data", this.handleDataBound);
    this.device.removeListener("error", this.handleErrorBound);
    try {
      this.device.close();
    } catch (error) {
      log("error closing device: %s", error instanceof Error ? error.message : String(error));
    }
    this.device = undefined;
    this.rejectAll(new Error("ToyPad connection closed"));
    this.hasConnected = false;
  }

  private handleData(data: Buffer): void {
    rawLog("rx %s", data.toString("hex"));
    const parsed = decodeMessage(data);
    if (!parsed) {
      return;
    }
    if (parsed.kind === "event") {
      this.emit("event", parsed);
      return;
    }
    if (parsed.kind === "response" && this.isConnectResponse(parsed)) {
      this.hasConnected = true;
      this.emit("connect");
      return;
    }
    this.resolvePending(parsed);
  }

  private resolvePending(message: ToyPadIncomingMessage): void {
    if (message.kind !== "response") {
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) {
      this.emit("message", message);
      return;
    }
    this.pending.delete(message.requestId);
    pending.resolve(message.payload);
  }

  private rejectAll(error: Error): void {
    for (const [requestId, pending] of Array.from(this.pending.entries())) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private nextRequestId(): number {
    this.requestId = (this.requestId + 1) & 0xff;
    if (this.requestId === 0) {
      this.requestId = 1;
    }
    return this.requestId;
  }

  private writeRaw(buffer: Buffer): void {
    if (!this.device) {
      throw new Error("ToyPad is not connected");
    }
    const data = Array.from(buffer.values());
    this.device.write(data);
  }

  private isConnectResponse(message: ToyPadResponseMessage): boolean {
    return !this.hasConnected && message.payload.length >= 20;
  }

  private createHidDevice(): HID.HID {
    const devices = HID.devices().filter((device) => {
      return device.vendorId === TOY_PAD_VENDOR_ID && device.productId === TOY_PAD_PRODUCT_ID;
    });

    const errors: string[] = [];

    for (const device of devices) {
      if (!device.path) {
        continue;
      }
      try {
        return new HID.HID(device.path);
      } catch (error) {
        errors.push(`path ${device.path} open failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      return new HID.HID(TOY_PAD_VENDOR_ID, TOY_PAD_PRODUCT_ID);
    } catch (error) {
      errors.push(`vendor/product open failed: ${error instanceof Error ? error.message : String(error)}`);
      if (errors.length === 0) {
        throw new Error("Unable to find a connected ToyPad. Ensure it is plugged in and recognized by the OS.");
      }
      const message = errors.join("; ") || "unknown error";
      throw new Error(`Unable to open ToyPad HID device (${message}).`);
    }
  }
}

export interface ToyPadConnection {
  on<U extends keyof ToyPadConnectionEvents>(event: U, listener: ToyPadConnectionEvents[U]): this;
  once<U extends keyof ToyPadConnectionEvents>(event: U, listener: ToyPadConnectionEvents[U]): this;
  off<U extends keyof ToyPadConnectionEvents>(event: U, listener: ToyPadConnectionEvents[U]): this;
  emit<U extends keyof ToyPadConnectionEvents>(event: U, ...args: Parameters<ToyPadConnectionEvents[U]>): boolean;
}
