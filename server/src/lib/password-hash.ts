import { hash, verify } from "@node-rs/argon2";

// Runtime fallback semantics: this module imports ONLY "@node-rs/argon2".
// That package tries its native binding first and falls back to the WASI
// build when native loading fails (e.g. hosts blocking unsigned binaries).
// The fallback package "@node-rs/argon2-wasm32-wasi" is therefore declared
// under optionalDependencies (see server/package.json + lockfile
// "optional": true) — present when installable, safely absent otherwise.
// No code in this repo imports the WASI package directly.

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
