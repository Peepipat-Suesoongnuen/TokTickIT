import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/lib/password-hash.js";
import { canonicalizeEmail } from "../src/lib/identity.js";

// Lab 3 — non-destructive idempotent seed (BR-75, MIG-05/MIG-06).
// Users/Tickets/comments/notes upserts use `update: {}` (create-missing-only):
// reruns MUST NEVER reset mutable columns (passwordHash, role, isActive,
// mustChangePassword, failedLoginAttempts, lockedUntil, ticketOwnerId,
// itPriority, currentStatus, requesterResolutionIndicatedAt).
// Reference-data upserts (categories/related-systems) may update name/isActive.
//
// Seeded credentials are local/testing-only (BR-52). The initial password below
// reuses the Task 4 local-only literal — never commit real secrets.

// Local/testing-only initial credential (BR-52), same literal as the Task 4 migration.
const LOCAL_INITIAL_PASSWORD = "Requester#2026-local";

export const SEED_PUBLIC_COMMENT = "Thanks for looking into this. The issue still happens after restarting the app.";
export const SEED_INTERNAL_NOTE = "Checked the logs with the team. Likely a configuration issue; will follow up.";

type UserFixture = { name: string; email: string; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; isActive: boolean };

const USER_FIXTURES: UserFixture[] = [
  // 5 Lab 2 requester names/emails (role REQUESTER)
  { name: "Anucha Wongprecha", email: "anucha.w@toktick.it", role: "REQUESTER", isActive: true },
  { name: "Busaba Srisawat", email: "busaba.s@toktick.it", role: "REQUESTER", isActive: true },
  { name: "Chaiwat Pongchai", email: "chaiwat.p@toktick.it", role: "REQUESTER", isActive: true },
  { name: "Darika Suwan", email: "darika.s@toktick.it", role: "REQUESTER", isActive: true },
  { name: "Somchai Jaidee", email: "somchai.j@toktick.it", role: "REQUESTER", isActive: false },
  // Staff: 3 active + 1 inactive
  { name: "IT Staff One", email: "staff1@toktick.it", role: "IT_STAFF", isActive: true },
  { name: "IT Staff Two", email: "staff2@toktick.it", role: "IT_STAFF", isActive: true },
  { name: "IT Staff Three", email: "staff3@toktick.it", role: "IT_STAFF", isActive: true },
  { name: "IT Staff Offboarded", email: "staff-off@toktick.it", role: "IT_STAFF", isActive: false },
  // Admin
  { name: "System Administrator", email: "admin@toktick.it", role: "ADMINISTRATOR", isActive: true },
];

type TicketFixture = {
  ticketNumber: string;
  requesterEmail: string;
  status: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ownerEmail: string | null;
  summary: string;
  description: string;
};

const TICKET_FIXTURES: TicketFixture[] = [
  {
    ticketNumber: "SEED-0001",
    requesterEmail: "anucha.w@toktick.it",
    status: "NEW",
    priority: "MEDIUM",
    ownerEmail: null,
    summary: "Cannot connect to campus Wi-Fi",
    description: "Laptop drops the campus Wi-Fi connection every few minutes in the library building.",
  },
  {
    ticketNumber: "SEED-0002",
    requesterEmail: "busaba.s@toktick.it",
    status: "OPEN",
    priority: "HIGH",
    ownerEmail: "staff1@toktick.it",
    summary: "Email client fails to sync",
    description: "Desktop email client stopped syncing new messages since yesterday morning.",
  },
  {
    ticketNumber: "SEED-0003",
    requesterEmail: "chaiwat.p@toktick.it",
    status: "IN_PROGRESS",
    priority: "CRITICAL",
    ownerEmail: "staff2@toktick.it",
    summary: "Grade submission app error",
    description: "Submitting final grades returns a server error for one course section.",
  },
  {
    ticketNumber: "SEED-0004",
    requesterEmail: "darika.s@toktick.it",
    status: "WAITING_FOR_REQUESTER",
    priority: "LOW",
    ownerEmail: "staff3@toktick.it",
    summary: "Printer shows paper jam error",
    description: "Department printer reports a paper jam but no paper is stuck inside.",
  },
  {
    ticketNumber: "SEED-0005",
    requesterEmail: "anucha.w@toktick.it",
    status: "RESOLVED",
    priority: "HIGH",
    ownerEmail: "staff1@toktick.it",
    summary: "VPN connection timeout",
    description: "VPN connection fails with a timeout error when working from home.",
  },
  {
    ticketNumber: "SEED-0006",
    requesterEmail: "busaba.s@toktick.it",
    status: "NEW",
    priority: "LOW",
    ownerEmail: null,
    summary: "Request new keyboard",
    description: "Several keys on the office keyboard no longer respond to presses.",
  },
];

export async function runSeed(): Promise<void> {
  const prisma = getPrisma();

  // -------------------------------------------------------------------------
  // 1. Categories — 4 required (Lab 2 reference data, kept as-is)
  // -------------------------------------------------------------------------
  const categories = ["Account and Access", "Hardware", "Software", "Network"];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }
  const categoryCount = await prisma.category.count();
  console.log(`Seeded ${categoryCount} categories.`);

  // -------------------------------------------------------------------------
  // 2. Related Systems — at least 6 (Lab 2 reference data, kept as-is)
  // -------------------------------------------------------------------------
  const relatedSystems = [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ];
  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }
  const systemCount = await prisma.relatedSystem.count();
  console.log(`Seeded ${systemCount} related systems.`);

  // -------------------------------------------------------------------------
  // 3. Users — create-missing-only (BR-75: update {} never touches mutables)
  // -------------------------------------------------------------------------
  const passwordHash = await hashPassword(LOCAL_INITIAL_PASSWORD);
  let usersCreated = 0;
  for (const f of USER_FIXTURES) {
    const email = canonicalizeEmail(f.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) continue;
    // Preserve the legacy DevelopmentRequester id where possible so old
    // references still join: reuse the id only when that User id is free.
    const legacy = await prisma.developmentRequester.findUnique({ where: { email: f.email } }).catch(() => null);
    const idFree =
      legacy != null ? (await prisma.user.findUnique({ where: { id: legacy.id } })) == null : false;
    await prisma.user.create({
      data: {
        ...(idFree && legacy != null ? { id: legacy.id } : {}),
        name: f.name,
        email,
        passwordHash,
        role: f.role,
        isActive: f.isActive,
        mustChangePassword: true,
        failedLoginAttempts: 0,
      },
    });
    usersCreated++;
  }
  const userCount = await prisma.user.count();
  console.log(`Seeded ${userCount} users (${usersCreated} created).`);

  // -------------------------------------------------------------------------
  // 3b. Legacy DevelopmentRequester rows — create-if-missing for the frozen
  //    legacy routes (/api/requesters). A fresh DB (migrate deploy + seed)
  //    has zero legacy rows, so create them here with the matching User id
  //    (legacy row id == User row id for the same fixture). Create-only:
  //    existing rows are never updated (BR-75 spirit).
  // -------------------------------------------------------------------------
  let legacyCreated = 0;
  for (const f of USER_FIXTURES.filter((u) => u.role === "REQUESTER")) {
    const email = canonicalizeEmail(f.email);
    const already = await prisma.developmentRequester.findUnique({ where: { email } }).catch(() => null);
    if (already) continue;
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const idTaken = (await prisma.developmentRequester.findUnique({ where: { id: user.id } }).catch(() => null)) != null;
    await prisma.developmentRequester.create({
      data: {
        ...(idTaken ? {} : { id: user.id }),
        name: f.name,
        email,
        isActive: f.isActive,
      },
    });
    legacyCreated++;
  }
  const legacyCount = await prisma.developmentRequester.count();
  console.log(`Seeded ${legacyCount} legacy requesters (${legacyCreated} created).`);

  // -------------------------------------------------------------------------
  // 4. Tickets — upsert by ticketNumber with update {} (BR-75)
  // -------------------------------------------------------------------------
  const category = await prisma.category.findFirstOrThrow({ where: { name: "Hardware" } });
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Email" } });
  let ticketsCreated = 0;
  for (const t of TICKET_FIXTURES) {
    const existing = await prisma.ticket.findUnique({ where: { ticketNumber: t.ticketNumber } });
    if (existing) continue;
    const requester = await prisma.user.findUniqueOrThrow({ where: { email: canonicalizeEmail(t.requesterEmail) } });
    const owner = t.ownerEmail
      ? await prisma.user.findUniqueOrThrow({ where: { email: canonicalizeEmail(t.ownerEmail) } })
      : null;
    await prisma.ticket.create({
      data: {
        ticketNumber: t.ticketNumber,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        ticketOwnerId: owner?.id ?? null,
        summary: t.summary,
        description: t.description,
        requestedPriority: t.priority,
        itPriority: t.priority,
        currentStatus: t.status,
      },
    });
    ticketsCreated++;
  }
  const ticketCount = await prisma.ticket.count();
  console.log(`Seeded ${ticketCount} tickets (${ticketsCreated} created).`);

  // -------------------------------------------------------------------------
  // 5. Example PublicComment + InternalNote rows (create-if-missing, fixed
  //    non-sensitive strings keyed by ticketId + authorId + content)
  // -------------------------------------------------------------------------
  const commentTicket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "SEED-0002" } });
  const commentAuthor = await prisma.user.findUniqueOrThrow({
    where: { email: canonicalizeEmail("busaba.s@toktick.it") },
  });
  if (
    (await prisma.publicComment.findFirst({
      where: { ticketId: commentTicket.id, authorId: commentAuthor.id, content: SEED_PUBLIC_COMMENT },
    })) == null
  ) {
    await prisma.publicComment.create({
      data: { ticketId: commentTicket.id, authorId: commentAuthor.id, content: SEED_PUBLIC_COMMENT },
    });
  }
  const noteTicket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "SEED-0003" } });
  const noteAuthor = await prisma.user.findUniqueOrThrow({
    where: { email: canonicalizeEmail("staff2@toktick.it") },
  });
  if (
    (await prisma.internalNote.findFirst({
      where: { ticketId: noteTicket.id, authorId: noteAuthor.id, content: SEED_INTERNAL_NOTE },
    })) == null
  ) {
    await prisma.internalNote.create({
      data: { ticketId: noteTicket.id, authorId: noteAuthor.id, content: SEED_INTERNAL_NOTE },
    });
  }
  const commentCount = await prisma.publicComment.count();
  const noteCount = await prisma.internalNote.count();
  console.log(`Seeded ${commentCount} public comments, ${noteCount} internal notes.`);
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (invokedDirectly) {
  runSeed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
