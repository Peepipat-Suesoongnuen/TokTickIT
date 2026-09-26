# Lab 3 AI Use — TokTickIT

How LLM assistance was used for the Lab 3 increment: specification support
(spec agent) and implementation support (coding agent), with human review at
every approval gate (plan approval, push/PR approval, merge approval —
never self-merged, never auto-pushed).

## Models and tools

- Coding agent: **Muse Spark** (via the OpenCode session), operating under a
  local-only operating manual (`agent_rule/agent.md`, never committed) that
  enforces Labsheet > Contract > Issue/AC precedence, TDD, approval gates,
  and evidence-before-claims.
- Hosted CI (server/client/e2e/migration-proof jobs) as the independent
  verifier of every claim; peer reviewers as the final authority — an AI
  "ready" verdict never substitutes for human approval or green CI.

## Selected key prompts (coding agent)

All prompts below are quoted **verbatim** (including original typos) from the
owner's messages in the working sessions — no paraphrasing, no invented
prompts. Source: shared session chat history, confirmed by the owner.

| # | User Prompt (exact) | Purpose | Outcome / Evidence |
|---|---|---|---|
| 1 | `frontend ได้มี mockup ที่ได้สร้างไว้แล้วเป็นต้นแบบภายในโฟลเดอร์ artifacts\lab-03 โดยแยกเป็นแต่ละ role ให้ทำการใส่เข้าไปในแผนด้วยล` | สั่งให้รวม mockup ตาม role เข้าแผน #48 | เกิด mockup-mapping supplement ในแผน (tabs/queue/detail) ก่อน implement |
| 2 | `Q1) A` / `Q2) อนุมัติ` / `Q3) board ตอนนี้` พร้อม pipeline `PLAN MODE → Draft #48 Implementation Plan → Human Approval → BUILD MODE → ... → STOP → ขออนุมัติ Push / PR / Kanban ตามแต่ละ gate` | ตอบคำถาม Q1–Q3 และวาง approval gates | เข้า BUILD ตาม gate ทีละขั้น ไม่ข้าม |
| 3 | `ผมต้องทำการตรวจสอบก่อน ขอ email ของทุก role ที่คุณได้ทำการแก้ไข UX-Ui` | ขอ account ทดสอบก่อนตรวจงาน (verify-first) | ตาราง email ทุก role + วิธี login ส่งให้ก่อนตรวจจริง |
| 4 | `1) IT staff และ admin ในหน้า ticket-queue นั้น ไม่ตรงตาม mockup - เรื่องการใช้คำำย่อข้อหัว column - ขนาดฟอนที่ไม่เท่ากัน [Image 1] ไฮไลน์ - นั้น status ห้ามมีจุด 2) IT staff และ admin ในหน้า ticket-detail นั้น ไม่ตรงตาม mockup -ทวน agent.md -DoD -ทำการเปรียบเทียบระหว่าง ui ของ ปัจจุบัน และ mockup -วางแผนการแก้ -เลือกใช้ skills -สรุปว่ามีจุไหนที่ต้องแก้ -stop รออรุมัติั` | รายงาน UI mismatch พร้อมสั่งกระบวนการเทียบ mockup | แผนแก้ 10 จุด (headers/dot/breadcrumb/grid) แล้ว implement + screenshot verify |
| 5 | `อนุมัติ เมื่อแก้เสร็จแล้วรอผมตรวจสอบ` | อนุมัติแบบ hold-for-inspection | ไม่เลื่อน gate จนกว่าเจ้าของตรวจด้วยตา |
| 6 | `ช่วยสรุปมาว่ามีจุดไหนบ้างที่คุรแก้ ui บ้าง` | ขอสรุปงาน UI ตาม Issue | รายงานสรุปแยก #48/#49/#50/polish พร้อมไฟล์ที่แตะ |
| 7 | `ผ่านต่อไป commit + push เปิด PR ได้` | อนุมัติ gate ทีละขั้น | commit/push/PR เกิดเฉพาะหลังประโยคนี้ ไม่ก่อน |

What the agent verifiably did with such prompts (repository evidence, not
testimony): translated approved plans into TDD implementation on feature
branches; ran unit/API/UI/E2E suites plus typecheck/build locally and
reported exact results; refused to push, open PRs, merge, or move Kanban
items without explicit per-instance approval; audited reviewer comments
against the contract with explicit classifications instead of blindly
applying them; reverted out-of-contract scope (admin-list extras, PR #62
Path C) rather than rewriting the contract to justify code.

## My Reflection

งานหลักของผมใน Lab 3 คือคุม Agent โดยตรง งานสำคัญที่สุดคือเทส UI ให้ตรงตามที่ต้องการและไม่หลุดธีมที่ Lab 3 sheet กำหนดไว้ สเปกเลยกลายเป็นแหล่งอ้างอิงขอบเขตของงาน ทำให้ผมมีหลักให้ชี้เวลาสั่ง Agent และกันไม่ให้มันทำเกิน scope ตั้งแต่ต้น

สิ่งที่ต้องแก้ให้ Agent บ่อยที่สุดคือความเข้าใจผิด มันทำงานไม่ตรงสเปกที่ต้องการอยู่เรื่อย และบางทีก็ลืมขั้นตอนที่ผมกำหนดไว้ใน workflow เช่น เรื่อง Kernel Map วิธีแก้ของผมมีสองอย่างคือสั่งให้ทำใหม่พร้อมชี้สเปกให้ชัด กับเขียน prompt ให้ละเอียดกว่าเดิมตั้งแต่ต้น ซึ่งก็ลดงานแก้ซ้ำได้เยอะ

ตัวอย่างที่ชัดที่สุดคือเรื่องเวลากับเรื่อง UI coding agent ประหยัดเวลาเขียนโค้ดไปแทบ 100% แต่ส่วนที่ต้องกลับมาแก้บ่อยที่สุดกลับเป็นเรื่อง UI กับการวางแผน คือเครื่องมือเร็วมากแต่สายตายังต้องเป็นของคน โดยเฉพาะเวลาต้องเทียบกับ mockup และธีมที่ sheet กำหนด

บทเรียนหลักคือลำดับการเริ่มงานสำคัญกว่าที่คิด ถ้าย้อนกลับไปทำใหม่ ผมจะศึกษาภาพรวมของ Lab ทั้งหมดก่อน แทนที่จะเริ่มจากการให้เขียน DoD เลย เพราะพอเห็นภาพใหญ่ก่อน การคุม scope กับสั่งงาน Agent ทีหลังมันง่ายกว่าเยอะ

## Agent-use limits observed

- The agent never invents requirements: ambiguities stop and ask.
- The agent never treats mockups, prior-session memory, or another
  student's work as correctness baselines.
- Test counts, SHAs, and CI states in working notes are treated as stale
  snapshots until refreshed from live repository/GitHub state.
