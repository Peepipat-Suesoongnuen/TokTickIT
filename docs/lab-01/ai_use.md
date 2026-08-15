# Lab 1 — AI Use and Reflection  (fill this in)

**LLM/agent used:** opencode (deepseek-v4-flash-free)

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | "ทำ Issue 3 ให้ครบตาม acceptance criteria" — เพิ่ม Category model, สร้าง migration และเขียน seed idempotent 4 หมวดหมู่ | เพิ่ม model, สร้าง migration `add_category`, เขียน seed แบบ upsert, ตรวจ idempotent โดยรัน seed 2 รอบ ได้ 4 แถวเท่าเดิม |
| 2 | "ตรวจว่า Issue 3 ตรงกับเงื่อนไขหรือยัง พร้อม push + สร้าง PR" | ตรวจครบ 5 ข้อ criteria (model/migration/seed/idempotent/credentials), commit, push, สร้าง PR#7 |
| 3 | "วิเคราะห์คำแนะนำของเพื่อนเรื่องไฟล์ .js ที่ compile ว่าควรทำตามหรือไม่" | เห็นด้วยกับแผน แต่แย้งเพิ่ม: ต้อง regenerate .js ด้วย `npx tsc` เพราะ test/app import ไฟล์ `.js` ไม่ใช่ `.tsx` ไม่งั้น test จะเทสต์โค้ดเก่า |
| 4 | "วางแผนทำ Issue 4 + แนะนำการเก็บหลักฐาน" | ได้แผนครบ (server route + test, client api + UI + test) + แนวทางแคปหลักฐาน 4 แบบสำหรับ tests.md |
| 5 | "ทำ Issue 4 — GET /api/categories + แสดงหมวดหมู่ + tests" | เพิ่ม route อ่านผ่าน Prisma เรียงตาม id, เขียน Supertest + Vitest, regenerate .js, test ผ่านทั้ง 2 ฝั่ง, push, สร้าง PR#8 |
| 6 | "ตรวจสอบ PR feature/4 ของเพื่อนแบบทีละบรรทัดตาม criteria" | ผ่าน criteria ครบ 6 ข้อ, ให้ comment minor 3 จุด (เช็ค health.status, error ถูกกลืน, test id ตายตัว) |
| 7 | "แก้ไข tests.md ตามที่เพื่อนแนะนำ (เพิ่มหลักฐาน Offline)" | จัดเรียง tests.md เป็นหมวด + เพิ่ม ui-offline.png, commit, push, ตอบเพื่อนขอ merge |
| 8 | "รีวิว PR ของเพื่อน (Issue 3) และสรุป comment" | ตรวจ criteria ผ่านครบ + หลักฐานใน tests.md ครบ, ร่าง comment ภาษาไทยกันเองให้โพสต์ |
| 9 | "อ่านและทำความเข้าใจไฟล์ lab ที่ส่งให้ และวาง plan ที่จะทำออกมาเป็นไฟล์ .md" | ได้แผนเป้าหมายของ Lab 1 + เทคโนโลยีที่ต้องใช้ + Git/GitHub Workflow + งานทั้งหมด (issues) เป็นไฟล์ .md |

## Reflection
Two or three sentences: what made your prompts better, and one place you had to
correct or reject what the agent produced.
ผมได้เรียนรู้ว่าผลลัพธ์จาก prompt ไม่ได้ถูกต้องเสมอไป ต้องให้มันวางแผนก่อนเริ่มลงมือจริงเสมอ และค่อยทำทีละขั้นตอนจึงดีที่สุด ตัวอย่างที่ต้องแย้งคือตอนทำ Issue 4 ที่ agent เสนอว่าแก้แค่ไฟล์ .tsx/.ts ก็พอ แต่ผมต้องให้ regenerate ไฟล์ .js ด้วย เพราะ test และแอป import ไฟล์ .js ไม่ใช่ .tsx ไม่งั้น test จะไปเทสโค้ดเก่าและล้มเหลว

