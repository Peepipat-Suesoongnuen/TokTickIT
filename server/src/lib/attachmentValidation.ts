export const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const ALLOWED_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
]);

export function isAllowedMime(mime: string, ext: string): boolean {
  const m = mime.toLowerCase();
  const e = ext.toLowerCase();
  const pairs: Record<string, Set<string>> = {
    "image/jpeg": new Set([".jpg", ".jpeg"]),
    "image/png": new Set([".png"]),
    "image/webp": new Set([".webp"]),
    "application/pdf": new Set([".pdf"]),
  };
  return pairs[m]?.has(e) ?? false;
}

export function isAllowedSize(size: number): boolean {
  return size <= 5 * 1024 * 1024;
}

export function isAllowedSignature(buffer: Buffer, mime: string): boolean {
  if (!buffer || buffer.length < 4) return false;
  const m = mime.toLowerCase();
  if (m === "application/pdf") return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  if (m === "image/png") return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (m === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (m === "image/webp") return buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x62 && buffer[11] === 0x50;
  return false;
}

export const MAX_ACTIVE = 5;

export const MULTER_LIMITS = { fileSize: 5 * 1024 * 1024 };
