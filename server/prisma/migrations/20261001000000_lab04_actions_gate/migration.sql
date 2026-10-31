-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionEventType" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'STATUS_CHANGED', 'COMPLETED', 'CANCELLED', 'FOLLOW_UP_CHANGED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolutionCycle" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "result" VARCHAR(2000),
    "performedById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" VARCHAR(500),
    "attachmentNotes" VARCHAR(500),
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "cycle" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "clientRequestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTakenEvent" (
    "id" SERIAL NOT NULL,
    "actionTakenId" INTEGER NOT NULL,
    "eventType" "ActionEventType" NOT NULL,
    "actorId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "ActionTakenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_idx" ON "ActionTaken"("ticketId");

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_status_cycle_idx" ON "ActionTaken"("ticketId", "status", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_ticketId_clientRequestId_key" ON "ActionTaken"("ticketId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ActionTakenEvent_actionTakenId_idx" ON "ActionTakenEvent"("actionTakenId");

-- CreateIndex
CREATE INDEX "ActionTakenEvent_actionTakenId_occurredAt_id_idx" ON "ActionTakenEvent"("actionTakenId", "occurredAt", "id");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenEvent" ADD CONSTRAINT "ActionTakenEvent_actionTakenId_fkey" FOREIGN KEY ("actionTakenId") REFERENCES "ActionTaken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenEvent" ADD CONSTRAINT "ActionTakenEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

