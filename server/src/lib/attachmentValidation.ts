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
  return (
    ALLOWED_MIMES.has(mime.toLowerCase()) &&
    ALLOWED_EXTS.has(ext.toLowerCase())
  );
}

export function isAllowedSize(size: number): boolean {
  return size <= 5 * 1024 * 1024;
}

export const MAX_ACTIVE = 5;

export const MULTER_LIMITS = { fileSize: 5 * 1024 * 1024 };
