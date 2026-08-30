# TokTickIT

TokTickIT is an IT Service Desk web application built as a full-stack vertical slice.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Bootstrap |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| API | REST-style API |
| Testing | Vitest + Supertest |

## Project Structure

```text
toktickit/
├── client/                 # React + TypeScript + Vite frontend
│   ├── src/                # React components
│   ├── tests/              # Frontend tests (Vitest)
│   └── index.html
├── server/                 # Node.js + Express + TypeScript backend
│   ├── prisma/             # Prisma schema and seed
│   ├── src/                # Express app
│   ├── tests/              # Backend tests (Supertest)
│   └── vitest.config.ts
├── docs/
│   └── lab-01/             # Lab 1 documentation (tests, review, AI use)
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js (>= 18)
- PostgreSQL (running locally with a `toktickit` database, or update credentials in `.env`)

## Setup

### 1. Install dependencies

```bash
cd client
npm install

cd ../server
npm install
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
