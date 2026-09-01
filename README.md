# TokTickIT

TokTickIT is an IT Service Desk web application built as a full-stack vertical slice.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Bootstrap |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| API | REST-style API |
| Testing | Vitest + Testing Library + Supertest + Playwright |

## Project Structure

```text
toktickit/
├── client/                         # React + TypeScript + Vite frontend
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── pages/
│       ├── styles/                  # Lab 2 Zen Green theme
│       └── features/lab-02/tests/   # UI/component/style tests
├── server/
│   ├── prisma/                      # Prisma schema, migrations, seed
│   ├── src/                         # Express app + helpers
│   ├── tests/lab-02/                # API/integration tests
│   └── uploads/                     # Runtime attachment storage (ignored)
├── e2e/lab-02/                      # Playwright requester flow + visual states
├── artifacts/lab-02/screenshots/    # Responsive/visual evidence
├── docs/
│   ├── lab-01/
│   └── lab-02/                      # specification/api/ui/tests/reviewer/ai-use
├── playwright.config.ts
├── package.json                     # Root Playwright scripts
└── README.md
```

## Prerequisites

- Node.js 20 recommended (hosted CI uses Node 20)
- PostgreSQL (running locally with a `toktickit` database, or update credentials in `.env`)

## Setup

### 1. Install dependencies

Install all three package scopes. The root package contains the Playwright dependency used by Lab 2 E2E tests.

```bash
npm install

cd client
npm install

cd ../server
npm install
```

Install the Chromium browser used by Playwright once per machine:

```bash
cd ..
npx playwright install chromium
```

### 2. Configure environment variables

Copy each `.env.example` to `.env` and fill in your own values. Never commit real `.env` files.

```bash
# client/.env
cp client/.env.example client/.env

# server/.env
cp server/.env.example server/.env
```

`server/.env` needs a PostgreSQL `DATABASE_URL`, e.g.:

```text
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public"
PORT=3000
```

### 3. Initialize the database with Prisma

```bash
cd server
npx prisma migrate dev   # creates tables from schema.prisma
npm run prisma:seed      # seeds initial data
```

### 4. Run the backend (Express + TypeScript)

```bash
cd server
npm run dev
```

The API runs at `http://localhost:3000`.

### 5. Run the frontend (Vite)

In a second terminal:

```bash
cd client
npm run dev
```

Open the URL shown by Vite (default `http://localhost:5173`) in your browser.

## Running Tests

Backend integration tests require a separate `toktickit_test` database. Never point
`TEST_DATABASE_URL` at the development database because integration tests create and
remove fixture records.

Create the test database once in PostgreSQL:

```sql
CREATE DATABASE toktickit_test;
```

Prepare and test it from Bash:

```bash
cd server
export TEST_DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db seed
NODE_ENV=test npm test
```

Or from PowerShell:

```powershell
cd server
$env:TEST_DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx prisma migrate deploy
npx prisma db seed
$env:NODE_ENV="test"
npm test
```

Frontend tests do not require PostgreSQL:

```bash
cd client
npm test
```

### Playwright E2E and responsive/visual evidence

The E2E suite uses the same isolated `toktickit_test` database. `playwright.config.ts` starts dedicated Lab 2 API/UI servers on ports `3100` and `5174`; do not run E2E against the normal development database.

From the repository root, set both database variables to the dedicated test database and run:

```bash
export TEST_DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
export DATABASE_URL="$TEST_DATABASE_URL"
npm run test:e2e
```

PowerShell:

```powershell
$env:TEST_DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm run test:e2e
```

The Playwright global setup applies migrations/seeding to the isolated test database. Responsive and visual screenshots are written under `artifacts/lab-02/screenshots/`.

### Typecheck/build checks used before PR handoff

```bash
cd client
npx tsc --noEmit
npm run build

cd ../server
npx tsc --noEmit
npm run build
```

Hosted CI runs server, client, and E2E jobs on push/pull-request. The E2E job also uploads `artifacts/lab-02/screenshots/` as a workflow artifact.

## Other Scripts

| Package | Command | Description |
|---|---|---|
| client | `npm run dev` | Start Vite dev server |
| client | `npm run build` | Type-check and build frontend |
| client | `npm test` | Run Vitest |
| server | `npm run dev` | Start backend with hot reload |
| server | `npm run build` | Compile TypeScript to `dist/` |
| server | `npm start` | Run compiled backend |
| server | `npm run prisma:migrate` | Run Prisma migrations |
| server | `npm run prisma:seed` | Seed the database |
| server | `npm test` | Run Vitest + Supertest |
| root | `npm run test:e2e` | Run Playwright Lab 2 E2E + responsive/visual tests |
| root | `npm run test:e2e:headed` | Run Playwright with a visible browser |
