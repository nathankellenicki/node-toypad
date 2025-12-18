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
  createWriteTagCommand,
  decodeColor
} from "./protocol";
import { TagType, detectTagType, getCharacterId, getVehicleId } from "./tag";
import { VehicleMetadata, getCharacterById, getVehicleById, getVehicleVariant, listCharacters, listVehicles } from "./metadata";

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
  signature: string;
}

export interface WriteVehicleOptions {
  signature?: string;
  step?: number;
}

type ActiveTag = {
  index: number;
  uid: Buffer;
  signature: string;
};

export class ToyPad extends EventEmitter {
  static Panel = ToyPadPanel;
  static metadata = {
    getCharacterById,
    getVehicleById,
    listCharacters,
    listVehicles
  };

  private connection?: ToyPadConnection;
  private readonly activeTags = new Map<ToyPadPanel, Map<string, ActiveTag>>();

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

  async readTag(panel: ToyPadPanel, signature?: string): Promise<ToyPadTagInfo> {
    const tag = this.resolveActiveTag(panel, signature);
    const info = await this.readTagData(tag);
    return { ...info, signature: tag.signature };
  }

  async writeVehicle(panel: ToyPadPanel, vehicleId: number, options: WriteVehicleOptions = {}): Promise<void> {
    const { signature, step } = options;
    const tag = this.resolveActiveTag(panel, signature);
    const info = await this.readTagData(tag);
    if (info.type !== TagType.Vehicle) {
      throw new Error(`Tag on panel ${panel} is not a vehicle tag.`);
    }
    const variant = this.resolveVehicleVariant(vehicleId, step);
    const payload = this.createVehiclePayload(variant.id, variant.step ?? 0);
    const connection = this.ensureConnection();
    await connection.request(createWriteTagCommand(tag.index, 0x24, payload));
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
        const tagKey = this.normalizeSignature(event.signature);
        const panelTags = this.activeTags.get(event.panel) ?? new Map<string, ActiveTag>();
        panelTags.set(tagKey, { index: event.index, uid: event.raw, signature: event.signature });
        this.activeTags.set(event.panel, panelTags);
      }
      this.emit("add", event);
    } else {
      if (event.panel !== ToyPadPanel.All) {
        const tagKey = this.normalizeSignature(event.signature);
        const panelTags = this.activeTags.get(event.panel);
        if (panelTags) {
          panelTags.delete(tagKey);
          if (!panelTags.size) {
            this.activeTags.delete(event.panel);
          }
        }
      }
      this.emit("remove", event);
    }
  }

  private normalizeSignature(signature: string): string {
    return signature.trim().toLowerCase();
  }

  private resolveActiveTag(panel: ToyPadPanel, signature?: string): ActiveTag {
    const panelTags = this.activeTags.get(panel);
    if (!panelTags || panelTags.size === 0) {
      throw new Error(`No tag present on panel ${panel}.`);
    }
    if (signature) {
      const tag = panelTags.get(this.normalizeSignature(signature));
      if (!tag) {
        throw new Error(`No tag with signature ${signature} on panel ${panel}.`);
      }
      return tag;
    }
    if (panelTags.size === 1) {
      const iterator = panelTags.values().next();
      if (!iterator.done && iterator.value) {
        return iterator.value;
      }
      throw new Error("Unable to determine which tag to read.");
    }
    const available = Array.from(panelTags.values())
      .map((value) => value.signature)
      .join(", ");
    throw new Error(`Multiple tags present on panel ${panel}. Specify signature (${available}).`);
  }

  private async readTagData(tag: ActiveTag): Promise<Omit<ToyPadTagInfo, "signature">> {
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

  private resolveVehicleVariant(vehicleId: number, step?: number): VehicleMetadata {
    const variant = getVehicleVariant(vehicleId, step);
    if (!variant) {
      if (typeof step === "number") {
        throw new Error(`Vehicle ${vehicleId} does not have rebuild step ${step}.`);
      }
      throw new Error(`Unknown vehicle id ${vehicleId}.`);
    }
    return variant;
  }

  private createVehiclePayload(vehicleId: number, step: number): Buffer {
    const payload = Buffer.alloc(16, 0);
    payload.writeUInt32LE(vehicleId, 0);
    payload[9] = 0x01;
    payload[12] = this.resolveUpgradeFlag(step);
    return payload;
  }

  private resolveUpgradeFlag(step: number): number {
    switch (step) {
      case 1:
        return 0x04;
      case 2:
        return 0x08;
      default:
        return 0x00;
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
