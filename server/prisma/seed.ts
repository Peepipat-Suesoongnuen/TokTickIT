import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/lib/password-hash.js";
import { LOCAL_INITIAL_PASSWORD } from "../src/lib/migrated-credentials.js";
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

// Local/testing-only initial credential (BR-52) lives in
// src/lib/migrated-credentials.ts (single source of truth, shared with the
// migration backfill) — never commit real secrets.

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
  status: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ownerEmail: string | null;
  summary: string;
  description: string;
  // Lab 4: REOPENED seed ticket demonstrates a second resolution cycle.
  resolutionCycle?: number;
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
  {
    // Lab 4: CLOSED ticket with completed-action history (BR-028 coverage).
    ticketNumber: "SEED-0007",
    requesterEmail: "chaiwat.p@toktick.it",
    status: "CLOSED",
    priority: "MEDIUM",
    ownerEmail: "staff2@toktick.it",
    summary: "Monitor replacement request",
    description: "Request to replace a flickering department monitor, resolved last week.",
  },
  {
    // Lab 4: REOPENED ticket on its second resolution cycle (BR-028 coverage).
    ticketNumber: "SEED-0008",
    requesterEmail: "darika.s@toktick.it",
    status: "REOPENED",
    priority: "HIGH",
    ownerEmail: "staff3@toktick.it",
    summary: "Printer jam recurring after fix",
    description: "The printer jam returned two days after the previous resolution.",
    resolutionCycle: 2,
  },
];

// Explicit-id inserts never advance Postgres sequences, so after seeding rows
// with explicit ids (migrated-DB User path below, legacy step 3b) the next
// autoincrement create() would reuse a live id (P2002 on fresh DBs). Advance
// BOTH sequences past the greatest id in EITHER table: fixtures mirror
// DevelopmentRequester ids as same-id Users, so the two id spaces must not
// overlap. pg_get_serial_sequence resolves the real sequence names (nothing
// hardcoded); COALESCE keeps empty tables at 0 so the next nextval() is 1.
async function resyncIdentitySequences(prisma: ReturnType<typeof getPrisma>): Promise<void> {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"DevelopmentRequester"', 'id'), ` +
      `(SELECT GREATEST(COALESCE(MAX(id), 0), COALESCE((SELECT MAX(id) FROM "User"), 0)) FROM "DevelopmentRequester"))`
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), ` +
      `(SELECT GREATEST(COALESCE(MAX(id), 0), COALESCE((SELECT MAX(id) FROM "DevelopmentRequester"), 0)) FROM "User"))`
  );
}

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
  let usersCreated = 0;
  for (const f of USER_FIXTURES) {
    const email = canonicalizeEmail(f.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) continue;
    // Unique Argon2id salt per credential (api-spec.md:37): hash INSIDE the
    // loop so every row gets its own hashPassword() call.
    const passwordHash = await hashPassword(LOCAL_INITIAL_PASSWORD);
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
  await resyncIdentitySequences(prisma);

  // -------------------------------------------------------------------------
  // 3b. Legacy DevelopmentRequester rows — create-if-missing for the frozen
  //    legacy routes (/api/requesters). A fresh DB (migrate deploy + seed)
  //    has zero legacy rows, so create them here with the matching User id
  //    (legacy row id == User row id for the same fixture). Create-only:
  //    existing rows are never updated (BR-75 spirit). The upsert-by-id is
  //    atomic: a concurrent fixture insert racing this seed surfaces as P2002
  //    only, which is swallowed (row already exists); any other error rethrows.
  // -------------------------------------------------------------------------
  let legacyCreated = 0;
  for (const f of USER_FIXTURES.filter((u) => u.role === "REQUESTER")) {
    const email = canonicalizeEmail(f.email);
    const already = await prisma.developmentRequester.findUnique({ where: { email } }).catch(() => null);
    if (already) continue;
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    try {
      await prisma.developmentRequester.upsert({
        where: { id: user.id },
        update: {},
        create: {
          id: user.id,
          name: f.name,
          email,
          isActive: f.isActive,
        },
      });
    } catch (e) {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    }
    const created = await prisma.developmentRequester.findUnique({ where: { email } }).catch(() => null);
    if (created) legacyCreated++;
  }
  const legacyCount = await prisma.developmentRequester.count();
  console.log(`Seeded ${legacyCount} legacy requesters (${legacyCreated} created).`);
  await resyncIdentitySequences(prisma);

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
        resolutionCycle: t.resolutionCycle ?? 1,
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

  // -------------------------------------------------------------------------
  // 6. Lab 4 — ActionTaken + ActionTakenEvent fixtures (create-if-missing,
  //    keyed by ticketNumber + description; fixed clientRequestId per fixture
  //    so reruns skip. SEED-0001/0006 intentionally keep ZERO actions
  //    (legacy). CLOSED/REOPENED ticket statuses are covered by transient
  //    test fixtures instead of seed rows to avoid disturbing Lab 2/3
  //    list-count assertions. Reruns MUST NOT reset mutable action state.
  // -------------------------------------------------------------------------
  const staff1 = await prisma.user.findUniqueOrThrow({ where: { email: canonicalizeEmail("staff1@toktick.it") } });
  const staff2 = await prisma.user.findUniqueOrThrow({ where: { email: canonicalizeEmail("staff2@toktick.it") } });
  const staff3 = await prisma.user.findUniqueOrThrow({ where: { email: canonicalizeEmail("staff3@toktick.it") } });
  const hour = 36e5;
  const actionFixtures = [
    { ticket: "SEED-0002", description: "Seed: diagnosed login failure on staff workstation", status: "PLANNED" as const, performer: staff1, assignee: staff2, result: null, followUpRequired: false, followUpNote: null, attachmentNotes: null, key: "05686a15-792b-59bd-937d-6fedffd102ba", ageH: 5 },
    { ticket: "SEED-0003", description: "Seed: restarted application service cluster", status: "COMPLETED" as const, performer: staff1, assignee: staff2, result: "Service cluster restarted; errors cleared.", followUpRequired: false, followUpNote: null, attachmentNotes: null, key: "078acaf4-2852-5c11-9c4f-946a9d173310", ageH: 26 },
    { ticket: "SEED-0003", description: "Seed: monitoring follow-up observation window", status: "IN_PROGRESS" as const, performer: staff2, assignee: staff3, result: null, followUpRequired: true, followUpNote: "Recheck error rate tomorrow morning.", attachmentNotes: null, key: "515a4b99-9fc0-579b-be71-a998983b9583", ageH: 4 },
    { ticket: "SEED-0003", description: "Seed: obsolete rollback plan draft", status: "CANCELLED" as const, performer: staff3, assignee: null, result: null, followUpRequired: false, followUpNote: null, attachmentNotes: null, key: "260309c2-1311-5859-9a5e-fb3e254895fc", ageH: 30 },
    { ticket: "SEED-0004", description: "Seed: awaiting requester log files", status: "PLANNED" as const, performer: staff3, assignee: null, result: null, followUpRequired: false, followUpNote: null, attachmentNotes: "See ticket attachment server-log-01.txt", key: "d53706af-d9ee-513f-bb28-875a39825cc8", ageH: 3 },
    { ticket: "SEED-0005", description: "Seed: verified fix with requester on call", status: "COMPLETED" as const, performer: staff1, assignee: staff1, result: "Confirmed resolved with requester.", followUpRequired: false, followUpNote: null, attachmentNotes: null, key: "3beece21-75fd-5d26-baf7-efae9a704e37", ageH: 50 },
    { ticket: "SEED-0007", description: "Seed: replaced monitor and verified display", status: "COMPLETED" as const, performer: staff2, assignee: staff2, result: "Monitor replaced; display verified.", followUpRequired: false, followUpNote: null, attachmentNotes: null, key: "bda27928-7dde-507c-8a7f-25ba0a7aafa1", ageH: 100 },
    { ticket: "SEED-0008", description: "Seed: re-inspect printer after reopen", status: "PLANNED" as const, performer: staff3, assignee: staff3, result: null, followUpRequired: false, followUpNote: null, attachmentNotes: null, key: "4cd1d641-4b1a-5aa8-aeba-49d7b7274855", ageH: 2 },
  ];
  for (const f of actionFixtures) {
    const t = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: f.ticket } });
    const existing = await prisma.actionTaken.findFirst({
      where: { ticketId: t.id, description: f.description },
    });
    if (existing != null) continue;
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: t.id,
        description: f.description,
        result: f.result,
        performedById: f.performer.id,
        assignedToId: f.assignee?.id ?? null,
        actionDate: new Date(Date.now() - f.ageH * hour),
        followUpRequired: f.followUpRequired,
        followUpNote: f.followUpNote,
        attachmentNotes: f.attachmentNotes,
        status: f.status,
        cycle: t.resolutionCycle,
        version: 1,
        clientRequestId: f.key,
      },
    });
    await prisma.actionTakenEvent.create({
      data: {
        actionTakenId: action.id,
        eventType: "CREATED",
        actorId: f.performer.id,
        payload: { description: f.description },
        requestId: f.key,
      },
    });
    if (f.status === "COMPLETED" || f.status === "CANCELLED") {
      await prisma.actionTakenEvent.create({
        data: {
          actionTakenId: action.id,
          eventType: f.status,
          actorId: f.performer.id,
          payload: { status: f.status },
          requestId: f.key,
        },
      });
    }
  }
  const actionCount = await prisma.actionTaken.count();
  const eventCount = await prisma.actionTakenEvent.count();
  console.log(`Seeded ${actionCount} actions taken, ${eventCount} action events.`);
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
