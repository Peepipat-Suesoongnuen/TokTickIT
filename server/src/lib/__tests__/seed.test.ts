import { describe, it, expect, afterAll } from "vitest";
import { getPrisma } from "../../../src/prisma.js";
import { runSeed, SEED_PUBLIC_COMMENT, SEED_INTERNAL_NOTE } from "../../../prisma/seed.js";

// MIG-05 (idempotent rerun), MIG-06 (baseline fixtures), BR-75 (rerun never
// resets mutable columns). Runs against the test DB (NODE_ENV=test +
// TEST_DATABASE_URL); cleans only its own SEED-* fixtures afterwards.
describe("seed (MIG-05, MIG-06, BR-75)", () => {
  const prisma = getPrisma();
  const SEED_TICKETS = ["SEED-0001", "SEED-0002", "SEED-0003", "SEED-0004", "SEED-0005", "SEED-0006"];

  const SEED_EMAILS = [
    "anucha.w@toktick.it",
    "busaba.s@toktick.it",
    "chaiwat.p@toktick.it",
    "darika.s@toktick.it",
    "somchai.j@toktick.it",
    "staff1@toktick.it",
    "staff2@toktick.it",
    "staff3@toktick.it",
    "staff-off@toktick.it",
    "admin@toktick.it",
  ];

  // Seed-scoped counts: other suites run in parallel workers against the same
  // test DB, so global totals are racy — scope to the fixed seed email set.
  async function roleActivationCounts() {
    const [reqActive, reqInactive, staffActive, staffInactive, adminActive] = await Promise.all([
      prisma.user.count({ where: { email: { in: SEED_EMAILS }, role: "REQUESTER", isActive: true } }),
      prisma.user.count({ where: { email: { in: SEED_EMAILS }, role: "REQUESTER", isActive: false } }),
      prisma.user.count({ where: { email: { in: SEED_EMAILS }, role: "IT_STAFF", isActive: true } }),
      prisma.user.count({ where: { email: { in: SEED_EMAILS }, role: "IT_STAFF", isActive: false } }),
      prisma.user.count({ where: { email: { in: SEED_EMAILS }, role: "ADMINISTRATOR", isActive: true } }),
    ]);
    return { reqActive, reqInactive, staffActive, staffInactive, adminActive };
  }

  afterAll(async () => {
    await prisma.publicComment.deleteMany({ where: { content: SEED_PUBLIC_COMMENT } });
    await prisma.internalNote.deleteMany({ where: { content: SEED_INTERNAL_NOTE } });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: SEED_TICKETS } } });
  });

  it("clean seed creates baseline counts without duplicates on double-run", async () => {
    await runSeed();
    const countsAfterFirst = await roleActivationCounts();
    const ticketsAfterFirst = await prisma.ticket.count({ where: { ticketNumber: { in: SEED_TICKETS } } });
    const commentsAfterFirst = await prisma.publicComment.count({ where: { content: SEED_PUBLIC_COMMENT } });
    const notesAfterFirst = await prisma.internalNote.count({ where: { content: SEED_INTERNAL_NOTE } });

    // Baseline: exactly 4 active + 1 inactive requesters, 3 active + 1
    // inactive staff, 1 active admin (seed-scoped; other suites share this DB)
    expect(countsAfterFirst.reqActive).toBe(4);
    expect(countsAfterFirst.reqInactive).toBe(1);
    expect(countsAfterFirst.staffActive).toBe(3);
    expect(countsAfterFirst.staffInactive).toBe(1);
    expect(countsAfterFirst.adminActive).toBe(1);
    expect(ticketsAfterFirst).toBe(SEED_TICKETS.length);
    expect(commentsAfterFirst).toBe(1);
    expect(notesAfterFirst).toBe(1);

    // Second run creates nothing new (MIG-05 idempotency)
    await runSeed();
    expect(await roleActivationCounts()).toEqual(countsAfterFirst);
    expect(await prisma.ticket.count({ where: { ticketNumber: { in: SEED_TICKETS } } })).toBe(ticketsAfterFirst);
    expect(await prisma.publicComment.count({ where: { content: SEED_PUBLIC_COMMENT } })).toBe(commentsAfterFirst);
    expect(await prisma.internalNote.count({ where: { content: SEED_INTERNAL_NOTE } })).toBe(notesAfterFirst);
  });

  it("rerun preserves mutations (password/role/activation/owner/priority/status/resolution)", async () => {
    await runSeed();
    const victim = await prisma.user.findUniqueOrThrow({ where: { email: "anucha.w@toktick.it" } });
    const originalPasswordHash = victim.passwordHash;
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "SEED-0001" } });

    const mutatedPassword = "mutated-hash-BR75-proof";
    const newOwner = await prisma.user.findUniqueOrThrow({ where: { email: "staff3@toktick.it" } });
    const resolutionAt = new Date("2026-09-01T10:00:00Z");
    await prisma.user.update({
      where: { id: victim.id },
      data: { passwordHash: mutatedPassword, role: "IT_STAFF", isActive: false },
    });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ticketOwnerId: newOwner.id,
        itPriority: "CRITICAL",
        currentStatus: "RESOLVED",
        requesterResolutionIndicatedAt: resolutionAt,
      },
    });

    await runSeed();

    const afterUser = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(afterUser.passwordHash).toBe(mutatedPassword);
    expect(afterUser.role).toBe("IT_STAFF");
    expect(afterUser.isActive).toBe(false);
    const afterTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(afterTicket.ticketOwnerId).toBe(newOwner.id);
    expect(afterTicket.itPriority).toBe("CRITICAL");
    expect(afterTicket.currentStatus).toBe("RESOLVED");
    expect(afterTicket.requesterResolutionIndicatedAt).toEqual(resolutionAt);

    // Restore the mutated fixtures so the suite stays order-independent
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { ticketOwnerId: null, itPriority: "MEDIUM", currentStatus: "NEW", requesterResolutionIndicatedAt: null },
    });
    await prisma.user.update({
      where: { id: victim.id },
      data: { passwordHash: originalPasswordHash, role: "REQUESTER", isActive: true },
    });
    await runSeed();
  });

  it("seeded tickets cover statuses/priorities/assigned-unassigned with non-sensitive content", async () => {
    await runSeed();
    const tickets = await prisma.ticket.findMany({ where: { ticketNumber: { in: SEED_TICKETS } } });
    const statuses = new Set(tickets.map((t) => t.currentStatus));
    const priorities = new Set(tickets.map((t) => t.itPriority));
    for (const s of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED"]) {
      expect(statuses.has(s as (typeof tickets)[number]["currentStatus"])).toBe(true);
    }
    for (const p of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      expect(priorities.has(p as (typeof tickets)[number]["itPriority"])).toBe(true);
    }
    expect(tickets.some((t) => t.ticketOwnerId != null)).toBe(true);
    expect(tickets.some((t) => t.ticketOwnerId == null)).toBe(true);

    // Fixed non-sensitive fixture strings, byte-equal — no secrets or personal data
    const comment = await prisma.publicComment.findFirstOrThrow({ where: { content: SEED_PUBLIC_COMMENT } });
    const note = await prisma.internalNote.findFirstOrThrow({ where: { content: SEED_INTERNAL_NOTE } });
    expect(comment.content).toBe(SEED_PUBLIC_COMMENT);
    expect(note.content).toBe(SEED_INTERNAL_NOTE);
    for (const text of [comment.content, note.content]) {
      expect(text.toLowerCase()).not.toContain("password");
      expect(text).not.toMatch(/@toktick\.it/);
    }
  });

});
