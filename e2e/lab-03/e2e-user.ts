// Lab 3 E2E fixture helper (Issue #45, Task 7; extended Issue #48).
//
// Run ONLY via the server tsx CLI so server TS path aliases (`.js` -> `.ts`)
// resolve, mirroring e2e/lab-02/global-setup.ts:
//   node server/node_modules/tsx/dist/cli.mjs e2e/lab-03/e2e-user.ts <setup|cleanup> <email> [password] [name] [role] [mustChange]
//
// Creates or RESETS a dedicated e2e-owned user (serial-friendly, no fixed
// state assumptions: the seed never resets passwords, so E2E owns its
// fixtures). Setup UPSERTS with a FRESH hashPassword(password) EVERY run
// (deterministic pristine state regardless of prior runs — prior password
// changes are wiped). Scoped to e2e-owned emails only; seed semantics
// (BR-75) untouched. Cleanup deletes by email (sessions cascade per schema).
//
// Optional [role] defaults to REQUESTER (backward compatible with the #45
// auth-flow caller); #48 passes IT_STAFF. Optional [mustChange] defaults to
// "true"; pass "false" to skip the mandatory-change gate in staff flows
// that do not test the gate itself.
import { getPrisma } from "../../server/src/prisma.js";
import { hashPassword } from "../../server/src/lib/password-hash.js";

const ALLOWED_ROLES = new Set(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);

async function main(): Promise<void> {
  const [cmd, email, password, name, roleArg, mustChangeArg] = process.argv.slice(2);
  if ((cmd !== "setup" && cmd !== "cleanup") || !email) {
    console.error("usage: e2e-user.ts <setup|cleanup> <email> [password] [name]");
    process.exit(2);
  }
  const prisma = getPrisma();
  try {
    if (cmd === "setup") {
      if (!password) {
        console.error("setup requires a password argument");
        process.exit(2);
      }
      const role = roleArg ?? "REQUESTER";
      if (!ALLOWED_ROLES.has(role)) {
        console.error(`setup role must be one of ${[...ALLOWED_ROLES].join(", ")}`);
        process.exit(2);
      }
      const mustChangePassword = mustChangeArg === undefined ? true : mustChangeArg === "true";
      await prisma.user.upsert({
        where: { email },
        update: {
          name: name || `E2E Auth ${email}`,
          passwordHash: await hashPassword(password),
          role,
          isActive: true,
          mustChangePassword,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        create: {
          name: name || `E2E Auth ${email}`,
          email,
          passwordHash: await hashPassword(password),
          role,
          isActive: true,
          mustChangePassword,
          failedLoginAttempts: 0,
        },
      });
      console.log(`e2e-user setup ok: ${email}`);
    } else {
      // FK-safe cleanup: tickets that reference this user as requester or
      // operational owner go first (attachments/comments/notes cascade via
      // the ticket); sessions cascade via the user row (schema onDelete).
      const owned = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (owned) {
        await prisma.ticket.deleteMany({
          where: { OR: [{ requesterId: owned.id }, { ticketOwnerId: owned.id }] },
        });
      }
      await prisma.user.deleteMany({ where: { email } });
      console.log(`e2e-user cleanup ok: ${email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
