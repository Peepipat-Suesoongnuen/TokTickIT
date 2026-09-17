import { PrismaClient } from "@prisma/client";

// Migration-proof fixtures (Lab-2-like, CLEARLY fake: example.com / MIGPROOF-).
// Inserted AFTER the BASELINE-only deploy (pre-User table) via RAW SQL ONLY:
// the generated Prisma client targets the post-migration schema, so model
// queries would select columns (itPriority, ...) that do not exist yet.
//
// Rows:
// - 2 categories + 2 systems (MIGPROOF- prefix)
// - 4 DevelopmentRequesters: a colliding pair `migproof-alice@example.com` /
//   `MIGPROOF-ALICE@example.com` (canonicalize equal -> the real `migrate
//   deploy` MUST abort with the MIG-02b division-by-zero) plus two clean rows
//   (bob, carol). The colliding pair owns NO tickets so the CI job can delete
//   it (Ticket.requesterId is RESTRICT) and re-run deploy to success.
// - 4 tickets across the clean requesters + 1 attachment row.
//
// Runnable: DATABASE_URL=<scratch> npx tsx prisma/migration-proof-fixtures.ts
// (also used locally against scratch `toktickit_issue44`). Idempotent: prior
// MIGPROOF rows are deleted first (FK order).
const prisma = new PrismaClient();

const COLLIDING_EMAILS = ["migproof-alice@example.com", "MIGPROOF-ALICE@example.com"];
const CLEAN_REQUESTERS = [
  { name: "Migproof Bob", email: "migproof-bob@example.com", isActive: true },
  { name: "Migproof Carol", email: "migproof-carol@example.com", isActive: true },
];

async function main(): Promise<void> {
  // Cleanup first (local reruns): FK order attachment -> ticket -> requester.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Attachment" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "ticketNumber" LIKE 'MIGPROOF-%')`
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "Ticket" WHERE "ticketNumber" LIKE 'MIGPROOF-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "DevelopmentRequester" WHERE email LIKE '%@example.com'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Category" WHERE name LIKE 'MIGPROOF%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "RelatedSystem" WHERE name LIKE 'MIGPROOF%'`);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Category" (name, "isActive") VALUES ('MIGPROOF Hardware', true), ('MIGPROOF Software', true)`
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RelatedSystem" (name, "isActive") VALUES ('MIGPROOF Email', true), ('MIGPROOF VPN', true)`
  );
  // Colliding pair first (MIG-02b abort proof); case-sensitive UNIQUE allows both.
  for (const email of [...COLLIDING_EMAILS, ...CLEAN_REQUESTERS.map((r) => r.email)]) {
    const name = email.toLowerCase().includes("alice") ? "Migproof Alice" : CLEAN_REQUESTERS.find((r) => r.email === email)!.name;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DevelopmentRequester" (name, email, "isActive") VALUES ('${name}', '${email}', true)`
    );
  }
  // Baseline Ticket columns only (no itPriority yet — added by the migration).
  const tickets = [
    { n: "MIGPROOF-0001", who: "migproof-bob@example.com", pri: "MEDIUM", cat: "MIGPROOF Hardware", sys: "MIGPROOF Email" },
    { n: "MIGPROOF-0002", who: "migproof-bob@example.com", pri: "HIGH", cat: "MIGPROOF Software", sys: "MIGPROOF VPN" },
    { n: "MIGPROOF-0003", who: "migproof-carol@example.com", pri: "CRITICAL", cat: "MIGPROOF Hardware", sys: "MIGPROOF VPN" },
    { n: "MIGPROOF-0004", who: "migproof-carol@example.com", pri: "LOW", cat: "MIGPROOF Software", sys: "MIGPROOF Email" },
  ];
  for (const t of tickets) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", summary, description, "requestedPriority", "updatedAt") ` +
        `SELECT '${t.n}', r.id, c.id, s.id, 'MIGPROOF summary ${t.n}', 'MIGPROOF description ${t.n}', '${t.pri}'::"RequestedPriority", NOW() ` +
        `FROM "DevelopmentRequester" r, "Category" c, "RelatedSystem" s ` +
        `WHERE r.email = '${t.who}' AND c.name = '${t.cat}' AND s.name = '${t.sys}'`
    );
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes") ` +
      `SELECT id, 'migproof.txt', 'migproof-stored-1.txt', 'text/plain', 42 FROM "Ticket" WHERE "ticketNumber" = 'MIGPROOF-0001'`
  );
  const counts = await prisma.$queryRawUnsafe<Array<{ k: string; c: bigint }>>(
    `SELECT 'requesters' k, COUNT(*) c FROM "DevelopmentRequester" WHERE email LIKE '%@example.com' ` +
      `UNION ALL SELECT 'tickets', COUNT(*) FROM "Ticket" WHERE "ticketNumber" LIKE 'MIGPROOF-%' ` +
      `UNION ALL SELECT 'attachments', COUNT(*) FROM "Attachment" WHERE "storedFilename" LIKE 'migproof-%'`
  );
  console.log(`migration-proof fixtures inserted: ${counts.map((r) => `${r.k}=${r.c}`).join(" ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
