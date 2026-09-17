// Lab 3 E2E fixture helper (Issue #45, Task 7).
//
// Run ONLY via the server tsx CLI so server TS path aliases (`.js` -> `.ts`)
// resolve, mirroring e2e/lab-02/global-setup.ts:
//   node server/node_modules/tsx/dist/cli.mjs e2e/lab-03/e2e-user.ts <setup|cleanup> <email> [password] [name]
//
// Creates a run-unique mustChangePassword user (serial-friendly, no fixed
// state assumptions: the seed never resets passwords, so E2E owns its
// fixtures). Cleanup deletes by email (sessions cascade per schema).
import { getPrisma } from "../../server/src/prisma.js";
import { hashPassword } from "../../server/src/lib/password-hash.js";

async function main(): Promise<void> {
  const [cmd, email, password, name] = process.argv.slice(2);
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
      await prisma.user.create({
        data: {
          name: name || `E2E Auth ${email}`,
          email,
          passwordHash: await hashPassword(password),
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
      });
      console.log(`e2e-user setup ok: ${email}`);
    } else {
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
