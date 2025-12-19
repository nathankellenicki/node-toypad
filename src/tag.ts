import { CharacterId, VehicleId } from "./ids.js";

const VEHICLE_MARKER = Buffer.from([0x00, 0x01, 0x00, 0x00]);
const TEA_DELTA = 0x9e3779b9;
const TEA_SUM_INIT = 0xc6ef3720;

export enum TagType {
  Unknown = "unknown",
  Character = "character",
  Vehicle = "vehicle"
}

export function isVehicle(data: Buffer | Uint8Array): boolean {
  if (data.length < VEHICLE_MARKER.length) {
    return false;
  }
  for (let i = 0; i < VEHICLE_MARKER.length; i++) {
    if ((data[i] ?? 0) !== VEHICLE_MARKER[i]) {
      return false;
    }
  }
  return true;
}

export function getVehicleId(data: Buffer | Uint8Array): VehicleId {
  if (data.length < 2) {
    throw new Error("Vehicle data must contain at least 2 bytes.");
  }
  return (((data[1]! & 0xff) << 8) | (data[0]! & 0xff)) as VehicleId;
}

export function getCharacterId(uid: Buffer | Uint8Array, encrypted: Buffer | Uint8Array): CharacterId {
  if (uid.length !== 7) {
    throw new Error("UID must be exactly 7 bytes long.");
  }
  if (encrypted.length < 8) {
    throw new Error("Encrypted character data must be at least 8 bytes.");
  }

  const key = generateKeys(uid);
  const values: [number, number] = [readUInt32LE(encrypted, 0), readUInt32LE(encrypted, 4)];
  const [v0, v1] = teaDecrypt(values, key);
  if (v0 !== v1) {
    return CharacterId.Unknown;
  }
  return (v0 & 0xffff) as CharacterId;
}

export function detectTagType(block26: Buffer | Uint8Array): TagType {
  if (isVehicle(block26)) {
    return TagType.Vehicle;
  }
  return TagType.Character;
}

function readUInt32LE(buffer: Buffer | Uint8Array, offset: number): number {
  return (
    (buffer[offset + 3]! << 24) |
    (buffer[offset + 2]! << 16) |
    (buffer[offset + 1]! << 8) |
    buffer[offset]!
  ) >>> 0;
}

function rotateRight(value: number, count: number): number {
  const normalized = count & 31;
  return ((value >>> normalized) | (value << (32 - normalized))) >>> 0;
}

function scramble(uid: Buffer | Uint8Array, count: number): number {
  const base = Buffer.from([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xb7, 0xd5, 0xd7, 0xe6, 0xe7,
    0xba, 0x3c, 0xa8, 0xd8, 0x75, 0x47, 0x68, 0xcf, 0x23, 0xe9, 0xfe, 0xaa
  ]);
  Buffer.from(uid).copy(base, 0, 0, Math.min(uid.length, 7));
  base[count * 4 - 1] = 0xaa;

  let v2 = 0;
  for (let i = 0; i < count; i++) {
    const b = base.readUInt32LE(i * 4);
    v2 = (b + rotateRight(v2, 25) + rotateRight(v2, 10) - v2) >>> 0;
  }
  return v2 >>> 0;
}

function generateKeys(uid: Buffer | Uint8Array): [number, number, number, number] {
  return [
    scramble(uid, 3),
    scramble(uid, 4),
    scramble(uid, 5),
    scramble(uid, 6)
  ];
}

function teaDecrypt(values: [number, number], key: [number, number, number, number]): [number, number] {
  let v0 = values[0] >>> 0;
  let v1 = values[1] >>> 0;
  let sum = TEA_SUM_INIT >>> 0;
  const k0 = key[0] >>> 0;
  const k1 = key[1] >>> 0;
  const k2 = key[2] >>> 0;
  const k3 = key[3] >>> 0;

  for (let i = 0; i < 32; i++) {
    v1 = (v1 - ((((v0 << 4) >>> 0) + k2) ^ (v0 + sum) ^ (((v0 >>> 5) + k3) >>> 0))) >>> 0;
    v0 = (v0 - ((((v1 << 4) >>> 0) + k0) ^ (v1 + sum) ^ (((v1 >>> 5) + k1) >>> 0))) >>> 0;
    sum = (sum - TEA_DELTA) >>> 0;
  }

  return [v0 >>> 0, v1 >>> 0];
}
