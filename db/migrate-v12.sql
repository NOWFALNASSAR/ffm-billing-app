-- Fresh Control v12 — run ONCE in the Neon SQL Editor.
-- Stores the bank balance at each day close, so the next day opens with the
-- exact figures shown on screen instead of recalculating them.

ALTER TABLE closings ADD COLUMN IF NOT EXISTS bank_balance numeric(14,2) NOT NULL DEFAULT 0;

SELECT 'v12 migration done' AS result;
