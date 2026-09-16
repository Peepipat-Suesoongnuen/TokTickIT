import { hash, verify } from "@node-rs/argon2";

// BR-10 baseline: m=19456 KiB, t=2, p=1. May be raised after perf verification, never weakened.
const MEMORY_COST = 19456;
const TIME_COST = 2;
const PARALLELISM = 1;

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, { memoryCost: MEMORY_COST, timeCost: TIME_COST, parallelism: PARALLELISM });
}

export async function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(hashValue, plaintext);
  } catch {
    return false;
  }
}
