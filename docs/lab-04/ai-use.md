# Lab 4 AI Use — TokTickIT

This record describes how LLM assistance was used for the Lab 4 release work for Issue #82. The owner reviewed the plan and approved rev14 before BUILD. Human approval remained required at the plan and GitHub side-effect gates.

## Models and tools

- LLM tools reported by the owner: **OpenCode** and **Codex**.
- Models reported by the owner: **luna 6**, **deepseek 4.1**, and **GLM 5.3**.
- The available record does not map a specific model to each prompt.
- Local terminal, repository and test tools, GitHub CLI, and the GitHub connector were used to inspect state and verify evidence. Tool output was treated as evidence; the LLM was not allowed to invent test, CI, review, or GitHub results.

## Selected key prompts (8)

| # | Prompt (summarised) | What I did with the result |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | "อ่านและทำความเข้าใจไฟล์ Lab ที่ส่งให้ และวางแผนงานทั้งหมดออกมาเป็นไฟล์ `.md`" — วิเคราะห์ข้อกำหนดของ Lab และแบ่งงานออกเป็น Issues พร้อมกำหนดเทคโนโลยีและ Git/GitHub workflow | ใช้แผนเป็นแนวทางจัดโครงสร้างงานของ Lab และติดตามการพัฒนาผ่าน Issues โดยอ้างอิงข้อกำหนดของ Lab เป็นหลัก |
| 2 | "วางแผนทำ Issue โดยตรวจ Acceptance Criteria, Definition of Done และวิธีเก็บหลักฐานก่อนเริ่มเขียนโค้ด" — วางแผนการทำงานโดยเชื่อม requirement กับ implementation, tests และ evidence | ใช้แผนกำหนดขอบเขตงานและวิธีพิสูจน์ว่าแต่ละ Acceptance Criterion ผ่านจริง รวมถึงแนวทางบันทึกผลใน `docs/lab-04/tests.md` |
| 3 | "ทำ Issue ตาม Acceptance Criteria และ contract ของ Lab โดยตรวจสอบทั้ง backend, frontend และ tests ที่เกี่ยวข้อง" — ดำเนินงานตามขอบเขต Issue และตรวจสอบการทำงานที่เชื่อมโยงกัน | ใช้ผลลัพธ์ในการพัฒนาและตรวจสอบส่วนที่เกี่ยวข้องกับ Issue โดยพิจารณา contract และ regression tests ไม่ใช่ดูเฉพาะว่าโค้ดทำงานได้ |
| 4 | "วิเคราะห์คำแนะนำจาก reviewer หรือเพื่อนว่าควรทำตามหรือไม่ โดยเทียบกับ specification, Acceptance Criteria และ tests" — ประเมินข้อเสนอแนะด้วยหลักฐานและข้อกำหนดของโครงการ | ใช้ผลวิเคราะห์ตัดสินใจว่าจะยอมรับหรือโต้แย้งข้อเสนอแนะ พร้อมเหตุผลทางเทคนิคที่ตรวจสอบย้อนกลับได้ |
| 5 | "รีวิว PR ของเพื่อนอย่างละเอียด โดยเทียบ Issue, Definition of Done, contract, source diff และ test evidence" — ตรวจสอบความครบถ้วนของงานและหาจุดบกพร่องที่ test อาจตรวจไม่พบ | ใช้ผลรีวิวระบุ blocker และข้อเสนอแนะที่มีหลักฐานรองรับ เพื่อให้ผู้พัฒนาแก้ไขก่อนอนุมัติ PR |
| 6 | "FIX-REVIEW PR โดยแก้ blocker แบบ RED-first แล้วรัน tests และตรวจสอบผลใหม่" — ให้แก้ตามข้อค้นพบจาก reviewer พร้อมพิสูจน์ว่า regression test ตรวจจับปัญหาได้ | ใช้ feedback จาก review เป็นรายการแก้ไข ตรวจสอบ test results และแยกหลักฐานที่รันใหม่ออกจากหลักฐานเก่าก่อนพิจารณา re-review |
| 7 | "AUDIT Issue/PR แบบ adversarial โดยตรวจ false-pass, stale evidence, exact HEAD และความสอดคล้องระหว่าง tests.md กับ PR body" — ตรวจว่าหลักฐานพิสูจน์ acceptance claims ได้จริงหรือไม่ | ใช้ผล Audit แยกสิ่งที่พิสูจน์แล้วออกจากสิ่งที่ยังไม่ยืนยัน และกำหนด gate ถัดไปก่อน commit, push, re-review หรือ merge |
| 8 | "ออกแบบ Agent OS ให้ใช้คำสั่งสั้น ๆ เช่น PLAN, BUILD, AUDIT และ FIX-REVIEW โดย resolve context, เลือก skills และตรวจ preconditions อัตโนมัติ" — ลด prompt ที่ยาวและการต้องป้อน context ซ้ำ พร้อมกำหนด checkpoint, evidence ledger และ side-effect gates | ปรับปรุงแนวทางการทำงานของ AI Agent ใน `agent_rule/` ให้มีขั้นตอนชัดเจน ใช้ live Git/GitHub/CI เป็น source of truth และกำหนดให้ต้องขออนุมัติก่อนดำเนินการสำคัญ เช่น push, merge หรือเปลี่ยนสถานะ Issue |

## Reflection

การมีแผนงานที่ชัดเจนและกำหนดขั้นตอนการทำงานไว้ก่อน ช่วยให้ผมทำงานต่อได้ง่ายขึ้นและไม่หลงทาง อีกทั้งยังช่วยป้องกันการแก้ไขหรือเปลี่ยนแปลงงานโดยที่ยังไม่ได้รับอนุญาต ผมยังได้เรียนรู้ว่าก่อนจะทำงานต่อ ควรตรวจสอบข้อมูลล่าสุดจาก repository และ GitHub ก่อนเสมอ เพราะข้อมูลจากครั้งก่อนอาจไม่ตรงกับสถานะปัจจุบันแล้ว

นอกจากนี้ ผมได้เรียนรู้ว่าการใช้ AI ช่วยทำงานไม่ได้หมายความว่าจะเชื่อทุกอย่างที่ AI บอกได้ทันที โดยเฉพาะลำดับขั้นตอนการทำงาน และผลลัพธ์ และถึงแม้ AI จะช่วยวางแผน เขียนโค้ด และตรวจสอบงานได้ แต่ก็ยังต้องเป็นคนตรวจสอบผลลัพธ์และอนุมัติขั้นตอนสำคัญด้วยตัวเอง
