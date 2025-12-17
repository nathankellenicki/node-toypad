import { EventEmitter } from "events";
import { ToyPadConnection } from "./connection";
import { ActionType, ToyPadPanel } from "./constants";
import {
  FlashOptions,
  ToyPadTagEvent,
  createFadeCommand,
  createFlashCommand,
  createGetColorCommand,
  createSetColorCommand,
  decodeColor
} from "./protocol";

export interface ToyPadEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  event: (event: ToyPadTagEvent) => void;
  add: (event: ToyPadTagEvent) => void;
  remove: (event: ToyPadTagEvent) => void;
}

export class ToyPad extends EventEmitter {
  static Panel = ToyPadPanel;

  private connection?: ToyPadConnection;

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }
    const connection = new ToyPadConnection();
    this.connection = connection;
    connection.on("event", (event) => this.forwardEvent(event));
    connection.on("connect", () => this.emit("connect"));
    connection.on("error", (error) => this.emit("error", error));
    await connection.open();
  }

  disconnect(): void {
    if (!this.connection) {
      return;
    }
    this.connection.close();
    this.connection.removeAllListeners();
    this.connection = undefined;
    this.emit("disconnect");
  }

  async setColor(panel: ToyPadPanel, color: number): Promise<void> {
    const connection = this.ensureConnection();
    await connection.request(createSetColorCommand(panel, color));
  }

  async getColor(panel: ToyPadPanel): Promise<number> {
    const connection = this.ensureConnection();
    const response = await connection.request(createGetColorCommand(panel));
    return decodeColor(response);
  }

  async fade(panel: ToyPadPanel, speed: number, cycles: number, color: number): Promise<void> {
    const connection = this.ensureConnection();
    await connection.request(createFadeCommand(panel, speed, cycles, color));
  }

  async flash(panel: ToyPadPanel, color: number, count: number, options?: FlashOptions): Promise<void> {
    const connection = this.ensureConnection();
    await connection.request(createFlashCommand(panel, color, count, options));
  }

  private ensureConnection(): ToyPadConnection {
    if (!this.connection) {
      throw new Error("ToyPad is not connected");
    }
    return this.connection;
  }

  private forwardEvent(event: ToyPadTagEvent): void {
    this.emit("event", event);
    if (event.action === ActionType.Add) {
      this.emit("add", event);
    } else {
      this.emit("remove", event);
    }
  }
}

export interface ToyPad {
  on<U extends keyof ToyPadEvents>(event: U, listener: ToyPadEvents[U]): this;
  once<U extends keyof ToyPadEvents>(event: U, listener: ToyPadEvents[U]): this;
  off<U extends keyof ToyPadEvents>(event: U, listener: ToyPadEvents[U]): this;
  emit<U extends keyof ToyPadEvents>(event: U, ...args: Parameters<ToyPadEvents[U]>): boolean;
}

export type { ToyPadTagEvent };
