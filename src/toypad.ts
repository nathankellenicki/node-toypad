import debug from "debug";
import { EventEmitter } from "events";
import { ToyPadConnection } from "./connection.js";
import { ActionType, ToyPadPanel } from "./constants.js";
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
} from "./protocol.js";
import { TagType, detectTagType, getCharacterId, getVehicleId } from "./tag.js";
import { CharacterId, VehicleId, UpgradeId } from "./ids.js";
import {
  VehicleMetadata,
  getCharacterById,
  getVehicleById,
  getVehicleVariant,
  listCharacters,
  listVehicles,
  getUpgradeLabel,
  listUpgradeLabels,
  getVehicleMap
} from "./metadata.js";
import { UpgradeOverrides, UpgradeValue, decodeUpgradePayload, encodePresetPayload, encodeUpgradePayload, listUpgradeSlots } from "./upgrades.js";

const metadataLog = debug("node-toypad:metadata");

const UPGRADE_READ_RETRY_COUNT = 3;
const UPGRADE_READ_RETRY_DELAY_MS = 25;

export interface ToyPadEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  event: (event: ToyPadTagEvent) => void;
  add: (event: ToyPadTagEvent) => void;
  remove: (event: ToyPadTagEvent) => void;
}

type BasicTagInfo =
  | { id: CharacterId; type: TagType.Character }
  | { id: VehicleId; type: TagType.Vehicle };

export type ToyPadTagInfo = BasicTagInfo & { signature: string };

export interface WriteVehicleOptions {
  signature?: string;
  step?: number;
}

export interface WriteVehicleUpgradesOptions {
  signature?: string;
  upgrades: UpgradeOverrides;
}

export interface ReadVehicleUpgradesOptions {
  signature?: string;
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
    listVehicles,
    getUpgradeLabel,
    listUpgradeLabels,
    listVehicleUpgrades(vehicleId: VehicleId): UpgradeId[] {
      const vehicle = getVehicleById(vehicleId);
      const mapId = vehicle ? getVehicleMap(vehicle.id) : 0;
      if (!vehicle || mapId === 0) {
        return [];
      }
      try {
        return listUpgradeSlots(mapId).map((slot) => slot.id);
      } catch (error) {
        metadataLog(`Unable to list upgrades for vehicle ${vehicleId}: ${error instanceof Error ? error.message : error}`);
        return [];
      }
    }
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

  async writeVehicle(panel: ToyPadPanel, vehicleId: VehicleId, options: WriteVehicleOptions = {}): Promise<void> {
    const { signature, step } = options;
    const tag = this.resolveActiveTag(panel, signature);
    const info = await this.readTagData(tag);
    if (info.type !== TagType.Vehicle) {
      throw new Error(`Tag on panel ${panel} is not a vehicle tag.`);
    }
    const variant = this.resolveVehicleVariant(vehicleId, step);
    const mapId = getVehicleMap(variant.id);
    const presetPayload = encodePresetPayload(mapId, variant.step ?? 0);
    if (!presetPayload) {
      throw new Error(`Vehicle preset data is missing for map ${mapId} step ${variant.step ?? 0}.`);
    }
    await this.writeUpgradePayload(tag, presetPayload);
    const payload = this.createVehiclePayload(variant.id, variant.step ?? 0);
    const connection = this.ensureConnection();
    await connection.request(createWriteTagCommand(tag.index, 0x24, payload));
  }

  async writeVehicleUpgrades(panel: ToyPadPanel, options: WriteVehicleUpgradesOptions): Promise<void> {
    const { signature, upgrades } = options;
    if (!upgrades || !upgrades.length) {
      throw new Error("No upgrades specified.");
    }
    const tag = this.resolveActiveTag(panel, signature);
    const info = await this.readTagData(tag);
    if (info.type !== TagType.Vehicle) {
      throw new Error(`Tag on panel ${panel} is not a vehicle tag.`);
    }
    const vehicle = getVehicleById(info.id);
    if (!vehicle) {
      throw new Error(`Vehicle metadata for id ${info.id} is not available.`);
    }
    const mapId = getVehicleMap(vehicle.id);
    if (mapId === 0) {
      throw new Error("Cannot write upgrades to an empty vehicle tag. Program a vehicle first.");
    }
    const upgradeBlock = await this.readUpgradeBlock(tag);
    const currentPayload = this.extractUpgradePayload(upgradeBlock);
    const payload = encodeUpgradePayload(mapId, upgrades, currentPayload);
    await this.writeUpgradePayload(tag, payload, upgradeBlock);
  }

  async readVehicleUpgrades(panel: ToyPadPanel, options: ReadVehicleUpgradesOptions = {}): Promise<UpgradeValue[]> {
    const { signature } = options;
    const tag = this.resolveActiveTag(panel, signature);
    const info = await this.readTagData(tag);
    if (info.type !== TagType.Vehicle) {
      throw new Error(`Tag on panel ${panel} is not a vehicle tag.`);
    }
    const vehicle = getVehicleById(info.id);
    if (!vehicle) {
      throw new Error(`Vehicle metadata for id ${info.id} is not available.`);
    }
    const mapId = getVehicleMap(vehicle.id);
    if (mapId === 0) {
      return [];
    }
    const payload = await this.readUpgradePayload(tag);
    const states = decodeUpgradePayload(mapId, payload);
    return states.map((slot) => ({
      id: slot.id,
      value: slot.max <= 1 ? slot.value > 0 : slot.value
    }));
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
        const existing = panelTags.get(tagKey);
        panelTags.set(tagKey, { index: event.index, uid: event.raw, signature: event.signature });
        this.activeTags.set(event.panel, panelTags);
        if (existing && existing.index === event.index) {
          return;
        }
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

  private async readTagData(tag: ActiveTag): Promise<BasicTagInfo> {
    const connection = this.ensureConnection();
    const cardData = await this.readBlock(tag, 0x24, connection);
    const payloadView = cardData.subarray(8, 12);
    const type = detectTagType(payloadView);
    if (type === TagType.Vehicle) {
      const id = getVehicleId(cardData);
      return { id, type };
    }
    if (type === TagType.Character) {
      const id = getCharacterId(tag.uid, cardData.subarray(0, 8));
      if (id === CharacterId.Unknown) {
        throw new Error("Unable to decrypt character id from tag.");
      }
      return { id, type };
    }
    throw new Error("Unsupported tag type detected.");
  }

  private resolveVehicleVariant(vehicleId: VehicleId, step?: number): VehicleMetadata {
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

  private async writeUpgradePayload(tag: ActiveTag, payload: Buffer, baseBlock?: Buffer): Promise<void> {
    if (payload.length !== 8) {
      throw new Error(`Upgrade payload must be 8 bytes, received ${payload.length}.`);
    }
    const connection = this.ensureConnection();
    const block = baseBlock ? Buffer.from(baseBlock) : await this.readUpgradeBlock(tag, connection);
    payload.subarray(0, 4).copy(block, 0);
    payload.subarray(4, 8).copy(block, 8);
    await connection.request(createWriteTagCommand(tag.index, 0x23, block));
  }

  private async readUpgradePayload(tag: ActiveTag): Promise<Buffer> {
    const block = await this.readUpgradeBlock(tag);
    return this.extractUpgradePayload(block);
  }

  private async readUpgradeBlock(tag: ActiveTag, connection?: ToyPadConnection): Promise<Buffer> {
    const activeConnection = connection ?? this.ensureConnection();
    let attempt = 0;
    let lastError: unknown;
    while (attempt < UPGRADE_READ_RETRY_COUNT) {
      try {
        const block = await this.readBlock(tag, 0x23, activeConnection);
        if (block.length < 12) {
          throw new Error("ToyPad returned an invalid upgrade block.");
        }
        return block;
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt >= UPGRADE_READ_RETRY_COUNT) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        await this.delay(UPGRADE_READ_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to read upgrade block.");
  }

  private extractUpgradePayload(block: Buffer): Buffer {
    const payload = Buffer.alloc(8);
    block.subarray(0, 4).copy(payload, 0);
    block.subarray(8, 12).copy(payload, 4);
    return payload;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async readBlock(tag: ActiveTag, page: number, connection?: ToyPadConnection): Promise<Buffer> {
    const activeConnection = connection ?? this.ensureConnection();
    const payload = await activeConnection.request(createReadTagCommand(tag.index, page));
    if (payload.length < 17) {
      throw new Error("ToyPad returned an invalid read response.");
    }
    const errorCode = payload[0];
    if (errorCode !== 0) {
      throw new Error(`ToyPad read failed with error code 0x${errorCode.toString(16).padStart(2, "0")}.`);
    }
    const cardData = payload.subarray(1);
    if (cardData.length < 16) {
      throw new Error("ToyPad read response did not include enough data.");
    }
    return cardData.subarray(0, 16);
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
