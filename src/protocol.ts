import { ActionType, CommandType, MessageType, PACKET_LENGTH, RequestType, ToyPadPanel } from "./constants";

export interface ToyPadCommand {
  id: RequestType | number;
  params: number[];
}

export interface ToyPadResponseMessage {
  kind: "response";
  requestId: number;
  payload: Buffer;
}

export interface ToyPadTagEvent {
  kind: "event";
  panel: ToyPadPanel;
  action: ActionType;
  index: number;
  tagType: number;
  signature: string;
  raw: Buffer;
}

export type ToyPadIncomingMessage = ToyPadResponseMessage | ToyPadTagEvent;

export interface FlashOptions {
  onTicks?: number;
  offTicks?: number;
}

export function encodeCommand(command: ToyPadCommand, requestId: number): Buffer {
  const params = command.params ?? [];
  const payload = [
    MessageType.Response,
    (params.length + 2) & 0xff,
    command.id & 0xff,
    requestId & 0xff,
    ...params.map((value) => value & 0xff)
  ];
  const withChecksum = appendChecksum(payload);
  return padMessage(withChecksum);
}

export function decodeMessage(data: Buffer): ToyPadIncomingMessage | undefined {
  const normalized = normalizePacket(data);
  if (!normalized.length) {
    return undefined;
  }
  const type = normalized[0];
  if (type === MessageType.Event) {
    return decodeActionEvent(normalized);
  }
  if (type === MessageType.Response) {
    return decodeResponse(normalized);
  }
  return undefined;
}

export function createSetColorCommand(panel: ToyPadPanel, color: number): ToyPadCommand {
  const rgb = normalizeColor(color);
  return {
    id: RequestType.SetColor,
    params: [panel & 0xff, rgb.red, rgb.green, rgb.blue]
  };
}

export function createGetColorCommand(panel: ToyPadPanel): ToyPadCommand {
  return {
    id: RequestType.GetColor,
    params: [((panel - 1) & 0xff) >>> 0]
  };
}

export function createFadeCommand(panel: ToyPadPanel, speed: number, cycles: number, color: number): ToyPadCommand {
  const rgb = normalizeColor(color);
  return {
    id: RequestType.Fade,
    params: [panel & 0xff, speed & 0xff, cycles & 0xff, rgb.red, rgb.green, rgb.blue]
  };
}

export function createFlashCommand(
  panel: ToyPadPanel,
  color: number,
  count: number,
  options: FlashOptions = {}
): ToyPadCommand {
  const rgb = normalizeColor(color);
  const offTicks = (options.offTicks ?? 10) & 0xff;
  const onTicks = (options.onTicks ?? 10) & 0xff;
  return {
    id: RequestType.Flash,
    params: [panel & 0xff, offTicks, onTicks, count & 0xff, rgb.red, rgb.green, rgb.blue]
  };
}

export function createReadTagCommand(index: number, page: number): ToyPadCommand {
  return {
    id: RequestType.ReadTag,
    params: [index & 0xff, page & 0xff]
  };
}

export function createWriteTagCommand(index: number, page: number, data: Buffer | number[]): ToyPadCommand {
  const payload = Array.isArray(data) ? data.slice() : Array.from(data.values());
  if (payload.length !== 16) {
    throw new Error(`ToyPad write requires 16 bytes of data, received ${payload.length}.`);
  }
  return {
    id: RequestType.WriteTag,
    params: [index & 0xff, page & 0xff, ...payload.map((value) => value & 0xff)]
  };
}

export function decodeColor(payload: Buffer): number {
  if (payload.length < 3) {
    return 0;
  }
  return ((payload[0] & 0xff) << 16) | ((payload[1] & 0xff) << 8) | (payload[2] & 0xff);
}

export function normalizePanel(value: number): ToyPadPanel {
  switch (value) {
    case ToyPadPanel.Center:
    case ToyPadPanel.Left:
    case ToyPadPanel.Right:
      return value;
    default:
      return ToyPadPanel.All;
  }
}

export function normalizeAction(value: number): ActionType {
  return value === ActionType.Remove ? ActionType.Remove : ActionType.Add;
}

function decodeActionEvent(data: Buffer): ToyPadTagEvent | undefined {
  if (data.length < 14) {
    return undefined;
  }
  const command = data[1];
  if (command !== CommandType.Action) {
    return undefined;
  }
  const panel = normalizePanel(data[2]);
  const tagType = data[3] & 0xff;
  const index = data[4] & 0xff;
  const action = normalizeAction(data[5]);
  const signatureBytes = data.subarray(6, 13);
  return {
    kind: "event",
    panel,
    action,
    index,
    tagType,
    signature: formatSignature(signatureBytes),
    raw: Buffer.from(signatureBytes)
  };
}

function decodeResponse(data: Buffer): ToyPadResponseMessage | undefined {
  if (data.length < 3) {
    return undefined;
  }
  const length = data[1];
  const payloadStart = 2;
  const payloadEnd = Math.min(data.length - 1, payloadStart + length);
  if (payloadEnd <= payloadStart) {
    return undefined;
  }
  const payloadWithRequestId = data.subarray(payloadStart, payloadEnd);
  if (!payloadWithRequestId.length) {
    return undefined;
  }
  const [requestId] = payloadWithRequestId;
  const payload = payloadWithRequestId.subarray(1);
  return {
    kind: "response",
    requestId,
    payload
  };
}

function appendChecksum(values: number[]): number[] {
  let checksum = 0;
  for (const value of values) {
    checksum = (checksum + (value & 0xff)) & 0xff;
  }
  return [...values, checksum];
}

function padMessage(values: number[]): Buffer {
  if (values.length > PACKET_LENGTH) {
    return Buffer.from(values.slice(0, PACKET_LENGTH));
  }
  const padded = values.slice();
  while (padded.length < PACKET_LENGTH) {
    padded.push(0x00);
  }
  return Buffer.from(padded);
}

function normalizePacket(data: Buffer): Buffer {
  if (!data.length) {
    return data;
  }
  if (data[0] === 0x00 && data.length > 1) {
    return data.subarray(1);
  }
  return data;
}

function formatSignature(buffer: Buffer): string {
  return Array.from(buffer)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}

function normalizeColor(color: number): { red: number; green: number; blue: number } {
  const clamped = color & 0xffffff;
  return {
    red: (clamped >> 16) & 0xff,
    green: (clamped >> 8) & 0xff,
    blue: clamped & 0xff
  };
}
