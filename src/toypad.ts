import { EventEmitter } from "events";
import { ToyPadConnection } from "./connection";
import { ActionType, ToyPadPanel } from "./constants";
import {
  FlashOptions,
  ToyPadTagEvent,
  createFadeCommand,
  createFlashCommand,
  createGetColorCommand,
  createReadTagCommand,
  createSetColorCommand,
  decodeColor
} from "./protocol";
import { TagType, detectTagType, getCharacterId, getVehicleId } from "./tag";
import { getCharacterById, getVehicleById, listCharacters, listVehicles } from "./metadata";

export interface ToyPadEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  event: (event: ToyPadTagEvent) => void;
  add: (event: ToyPadTagEvent) => void;
  remove: (event: ToyPadTagEvent) => void;
}

export interface ToyPadTagInfo {
  id: number;
  type: TagType;
}

export class ToyPad extends EventEmitter {
  static Panel = ToyPadPanel;
  static metadata = {
    getCharacterById,
    getVehicleById,
    listCharacters,
    listVehicles
  };

  private connection?: ToyPadConnection;
  private readonly activeTags = new Map<ToyPadPanel, { index: number; uid: Buffer }>();

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
    this.activeTags.clear();
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

  async readTag(panel: ToyPadPanel): Promise<ToyPadTagInfo> {
    const tag = this.activeTags.get(panel);
    if (!tag) {
      throw new Error(`No tag present on panel ${panel}.`);
    }

    const connection = this.ensureConnection();
    const payload = await connection.request(createReadTagCommand(tag.index, 0x24));
    if (payload.length < 17) {
      throw new Error("ToyPad returned an invalid read response.");
    }
    const errorCode = payload[0];
    if (errorCode !== 0) {
      throw new Error(`ToyPad read failed with error code 0x${errorCode.toString(16).padStart(2, "0")}.`);
    }
    const cardData = payload.subarray(1);
    if (cardData.length < 12) {
      throw new Error("ToyPad read response did not include enough data.");
    }
    const payloadView = cardData.subarray(8, 12);
    const type = detectTagType(payloadView);
    if (type === TagType.Vehicle) {
      const id = getVehicleId(cardData);
      return { id, type };
    }
    if (type === TagType.Character) {
      const id = getCharacterId(tag.uid, cardData.subarray(0, 8));
      if (!id) {
        throw new Error("Unable to decrypt character id from tag.");
      }
      return { id, type };
    }
    return { id: 0, type: TagType.Unknown };
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
      if (event.panel !== ToyPadPanel.All) {
        this.activeTags.set(event.panel, { index: event.index, uid: event.raw });
      }
      this.emit("add", event);
    } else {
      if (event.panel !== ToyPadPanel.All) {
        this.activeTags.delete(event.panel);
      }
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
