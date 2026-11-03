import type { Store } from "../db/store.js";
import type { GadgetCodeRecord } from "../domain/types.js";
import { ApiError } from "../util/errors.js";
import { newToken, sha256 } from "../util/ids.js";
import { addSeconds } from "../util/time.js";

export interface IssuedGadgetCode {
  code: string;
  expiresAt: string;
}

export async function issueGadgetCode(
  store: Store,
  userId: string,
  origin: string,
  ttlSeconds: number,
): Promise<IssuedGadgetCode> {
  const code = newToken("pg", 32);
  const now = new Date();
  const expiresAt = addSeconds(now, ttlSeconds);
  const record: GadgetCodeRecord = {
    codeHash: sha256(code),
    userId,
    origin,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    redeemedAt: null,
  };
  await store.createGadgetCode(record);
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function redeemGadgetCode(
  store: Store,
  code: string,
  origin: string | undefined,
): Promise<GadgetCodeRecord> {
  if (!code || code.length > 200) {
    throw new ApiError(400, "INVALID_CODE", "A valid code is required.");
  }
  if (!origin) {
    throw new ApiError(400, "ORIGIN_REQUIRED", "The wiki origin is required.");
  }

  const record = await store.findGadgetCode(sha256(code));
  if (!record) {
    throw new ApiError(
      401,
      "INVALID_CODE",
      "This authorization code is invalid, expired, or already used.",
    );
  }

  if (record.origin !== origin) {
    throw new ApiError(
      401,
      "ORIGIN_MISMATCH",
      "This authorization code belongs to a different wiki.",
    );
  }

  const redeemed = await store.redeemGadgetCode(sha256(code));
  if (!redeemed) {
    throw new ApiError(
      401,
      "INVALID_CODE",
      "This authorization code is invalid, expired, or already used.",
    );
  }

  return redeemed;
}
