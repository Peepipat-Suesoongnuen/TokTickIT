-- Fix-review PR #83 (Refs #77): rename ActionTaken.performedById to
-- ActionTaken.recordedById. The field is the immutable recorder/creator
-- (the authenticated user who created the Action), never the performer,
-- assignee, or completer. Data-preserving forward-only rename: no rows
-- touched, RESTRICT delete rule unchanged.
ALTER TABLE "ActionTaken" RENAME COLUMN "performedById" TO "recordedById";
ALTER TABLE "ActionTaken" RENAME CONSTRAINT "ActionTaken_performedById_fkey" TO "ActionTaken_recordedById_fkey";
