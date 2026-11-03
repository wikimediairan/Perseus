import { createHash, randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function newToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function newWorkerId(): string {
  return `worker-${randomBytes(6).toString("hex")}`;
}
