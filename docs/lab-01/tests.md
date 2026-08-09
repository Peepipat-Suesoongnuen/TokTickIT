# Lab 1 — Test Plan and Evidence  (fill this in)

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | Pass |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | |
| 3 | Vitest | Heading renders | |
| 4 | Vitest | Success state shows Online + category list | |
| 5 | Vitest | Error state shows Offline + message | |

Paste your passing terminal output / screenshot below.
___________________________________________________________________________________________________________________________________
PS C:\PPP\Lab1_Starter_Scaffold\toktickit\server> npm test

> toktickit-server@1.0.0 test
> vitest run


 RUN  v2.1.9 C:/PPP/Lab1_Starter_Scaffold/toktickit/server

 ↓ tests/lab-01/categories.test.ts (1) [skipped]
 ✓ tests/lab-01/health.test.ts (1)

 Test Files  1 passed | 1 skipped (2)
      Tests  1 passed | 1 todo (2)
   Start at  18:50:50
   Duration  646ms (transform 57ms, setup 0ms, collect 460ms, tests 18ms, environment 0ms, prepare 284ms)

PS C:\PPP\Lab1_Starter_Scaffold\toktickit\client> npm test

> toktickit-client@1.0.0 test
> vitest run


 RUN  v2.1.9 C:/PPP/Lab1_Starter_Scaffold/toktickit/client

 ✓ tests/lab-01/App.test.tsx (3)
   ✓ App (3)
     ✓ renders the TokTickIT heading
     ↓ shows Online and the seeded categories on success [skipped]
     ↓ shows an Offline error message when the API is unavailable [skipped]

 Test Files  1 passed (1)
      Tests  1 passed | 2 todo (3)
   Start at  18:51:32
   Duration  1.18s (transform 45ms, setup 98ms, collect 122ms, tests 22ms, environment 533ms, prepare 143ms)
___________________________________________________________________________________________________________________________________