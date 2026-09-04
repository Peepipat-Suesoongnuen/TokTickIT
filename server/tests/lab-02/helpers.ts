import fs from "fs";
import path from "path";

export const UPLOAD_DIR = path.resolve("uploads");

export function pngBuffer(size = 1024): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (size <= header.length) return header.subarray(0, size);
  const buf = Buffer.alloc(size);
  header.copy(buf);
  return buf;
}

export function jpegBuffer(size = 1024): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  if (size <= header.length) return header.subarray(0, size);
  const buf = Buffer.alloc(size);
  header.copy(buf);
  return buf;
}

export function pdfBuffer(size = 1024): Buffer {
  const header = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (size <= header.length) return header.subarray(0, size);
  const buf = Buffer.alloc(size);
  header.copy(buf);
  return buf;
}

export async function cleanupTicket(prisma: any, ticketNumber: string): Promise<void> {
  await prisma.ticket.deleteMany({ where: { ticketNumber } });
}

export async function cleanupTickets(prisma: any, ticketNumbers: string[]): Promise<void> {
  if (ticketNumbers.length === 0) return;
  await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ticketNumbers } } });
}

export function removeUploadedFile(storedFilename: string): void {
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, storedFilename));
  } catch {}
}
