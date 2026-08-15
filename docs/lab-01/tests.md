# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | Passed |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | |
| 3 | Vitest | Heading renders | Passed |
| 4 | Vitest | Success state shows Online + category list | |
| 5 | Vitest | Error state shows Offline + message | |

## Evidence — API-01 (server): GET /api/health

![API-01 ภาพการรัน test GET /api/health จาก terminal output](screenshots/api-01-health.png)

## Evidence — UI-01 (client): Heading renders

![UI-01 ภาพการรัน test heading render จาก terminal output](screenshots/ui-01-heading.png)

## Evidence — Issue 3: Seed 4 categories (idempotent)

![prisma-seed ภาพการรัน seed แสดง Seeded 4 categories](screenshots/prisma-seed.png)

## Evidence — Issue 3: Database มี 4 categories

![Category ตรวจข้อมูล Category ใน PostgreSQL มี 4 แถว](screenshots/Category.png)

## Evidence — Demo: System status จาก localhost

![Demo หน้าเว็บ localhost แสดง System Status](screenshots/image.png)