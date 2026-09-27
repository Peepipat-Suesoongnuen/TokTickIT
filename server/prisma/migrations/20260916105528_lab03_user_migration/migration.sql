-- MIG-02b: collision abort FIRST — before any mutation, no partial FK rewrite.
-- NOTE: implemented as a data-dependent division-by-zero (not DO/RAISE) because the
-- locked-down local Postgres host blocks plpgsql library loads (58P01), and a
-- constant failing CAST — or even a constant 1/0 inside a CASE branch — is
-- constant-folded at plan time, erroring even when no collision exists.
-- The divisor below is data-dependent: 0 colliding groups -> SELECT 1/1 = 1
-- (no-op); >=1 colliding group -> SELECT 1/0 raises division by zero and aborts
-- the migration with no prior writes.
-- Host restriction: plpgsql (DO $$ RAISE) is blocked by Application Control on this
-- host — the cryptic 'division by zero' below is the intentional MIG-02b abort signal.
SELECT 1 / (CASE WHEN EXISTS(SELECT 1 FROM "DevelopmentRequester" GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1) THEN 0 ELSE 1 END);

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "ItPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_requesterId_fkey";

-- AlterTable: add itPriority nullable first so non-empty Ticket tables migrate,
-- backfill from requestedPriority (MIG-03), then enforce NOT NULL.
ALTER TABLE "Ticket" ADD COLUMN     "itPriority" "ItPriority",
ADD COLUMN     "requesterResolutionIndicatedAt" TIMESTAMP(3),
ADD COLUMN     "ticketOwnerId" INTEGER;

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "PublicComment_ticketId_idx" ON "PublicComment"("ticketId");

-- CreateIndex
CREATE INDEX "InternalNote_ticketId_idx" ON "InternalNote"("ticketId");

-- CreateIndex
CREATE INDEX "Ticket_ticketOwnerId_idx" ON "Ticket"("ticketOwnerId");

-- MIG-01/MIG-04: data move with preserved IDs, canonical email, a backfill
-- MARKER as passwordHash (pure SQL cannot Argon2, so no real hash is inlined
-- here), mustChangePassword=true. The backfill step
-- (prisma/backfill-migrated-passwords.ts -> backfillMigratedCredentials())
-- replaces the marker with a unique per-row Argon2id hash of the approved
-- local-only initial credential 'Requester#2026-local' (BR-52; local/testing
-- credential only, never a real secret). The marker is not a valid PHC
-- string, so logins fail closed until the backfill runs.
INSERT INTO "User" (id, name, email, "passwordHash", role, "isActive", "mustChangePassword", "failedLoginAttempts", "createdAt", "updatedAt") SELECT id, name, LOWER(TRIM(email)), 'MIGRATED_NEEDS_BACKFILL', 'REQUESTER', "isActive", true, 0, NOW(), NOW() FROM "DevelopmentRequester";
SELECT setval(pg_get_serial_sequence('"User"','id'), (SELECT MAX(id) FROM "User"));

-- MIG-02b backstop (BR-40/BR-46): case-insensitive email uniqueness at DB level,
-- so no write path can persist Alice@x + alice@x even bypassing helpers.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_ci_unique" ON "User" (LOWER("email"));

-- MIG-03: initialize itPriority from requestedPriority; ticketOwnerId stays NULL.
UPDATE "Ticket" SET "itPriority" = "requestedPriority"::text::"ItPriority";
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketOwnerId_fkey" FOREIGN KEY ("ticketOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy "DevelopmentRequester" table is intentionally KEPT (frozen until the
-- #45/#46 auth cutover removes the requester-selector routes).
