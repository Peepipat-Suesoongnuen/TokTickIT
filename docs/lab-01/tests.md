# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | Passed |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | Passed |
| 3 | Vitest | Heading renders | Passed |
| 4 | Vitest | Success state shows Online + category list | Passed |
| 5 | Vitest | Error state shows Offline + message | Passed |

## Server tests

### API-01: GET /api/health

![API-01 ภาพการรัน test GET /api/health จาก terminal output](screenshots/api-01-health.png)

### API-02: GET /api/categories

![API-02 ภาพการรัน test GET /api/categories ได้ 4 หมวดหมู่เรียงตาม id จาก terminal output](screenshots/api-02.png)

## Client tests

### UI-01: Heading renders

![UI-01 ภาพการรัน test heading render จาก terminal output](screenshots/ui-01-heading.png)

### UI-02/UI-03: Online + Offline states

![UI-02 ภาพการรัน test client ผ่าน 3 tests (heading, success, error) จาก terminal output](screenshots/ui-02.png)

## Live API evidence

### GET /api/categories ตอบจาก PostgreSQL

![api-db ภาพ API ตอบ JSON 4 หมวดหมู่ที่อ่านจากฐานข้อมูลจริง](screenshots/api-db.png)

## Issue 3 evidence

### Seed 4 categories (idempotent)

![prisma-seed ภาพการรัน seed แสดง Seeded 4 categories](screenshots/prisma-seed.png)

### Database มี 4 categories

![Category ตรวจข้อมูล Category ใน PostgreSQL มี 4 แถว](screenshots/Category.png)

## UI demo

### System status จาก localhost

![Demo หน้าเว็บ localhost แสดง System Status](screenshots/image.png)

### รายการหมวดหมู่จาก API

![demo หน้าเว็บแสดง System Status Online + รายการ 4 หมวดหมู่ที่ได้จาก API](screenshots/demo.png)

### Error state (Offline) หน้าเว็บจริง

![ui-offline หน้าเว็บแสดง System Status: Offline + ข้อความแจ้งเตือน ตอน API ไม่สามารถเชื่อมต่อได้](screenshots/ui-offline.png)