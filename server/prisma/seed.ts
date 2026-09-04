import { getPrisma } from "../src/prisma.js";

// Lab 2 — idempotent seed for Categories, Related Systems, and Development Requesters.
// Retains Lab 1 Category entity; Lab 2 migration adds isActive and backfills existing rows.
// This seed ensures required data/state via upsert (safe to run repeatedly).

async function main() {
  const prisma = getPrisma();

  // -------------------------------------------------------------------------
  // 1. Categories — 4 required (evolved from Lab 1, now with isActive)
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
  // 2. Related Systems — at least 6
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
  // 3. Development Requesters — at least 4 active + 1 inactive
  // -------------------------------------------------------------------------
  const requesters: Array<{ name: string; email: string; isActive: boolean }> = [
    { name: "Anucha Wongprecha", email: "anucha.w@toktick.it", isActive: true },
    { name: "Busaba Srisawat", email: "busaba.s@toktick.it", isActive: true },
    { name: "Chaiwat Pongchai", email: "chaiwat.p@toktick.it", isActive: true },
    { name: "Darika Suwan", email: "darika.s@toktick.it", isActive: true },
    { name: "Somchai Jaidee", email: "somchai.j@toktick.it", isActive: false },
  ];
  for (const r of requesters) {
    await prisma.developmentRequester.upsert({
      where: { email: r.email },
      update: { name: r.name, isActive: r.isActive },
      create: { name: r.name, email: r.email, isActive: r.isActive },
    });
  }
  const activeCount = await prisma.developmentRequester.count({ where: { isActive: true } });
  const totalCount = await prisma.developmentRequester.count();
  console.log(`Seeded ${totalCount} development requesters (${activeCount} active).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
