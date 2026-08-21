-- Fresh Control v8 — run ONCE in the Neon SQL Editor.
-- Adds purchase returns. Safe to run even if v7 was already applied.

ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_type_check;
ALTER TABLE entries ADD CONSTRAINT entries_type_check CHECK (type IN (
  'sale','purchase','purchase_return','supplier_payment','customer_collection','expense',
  'cash_in','cash_out','bank_deposit','bank_withdraw','wastage',
  'opening_purchase','investment','renovation','loan_in','loan_repay'));

ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_mode_check;
ALTER TABLE entries ADD CONSTRAINT entries_mode_check
  CHECK (mode IN ('cash','upi','card','bank','credit','none'));

SELECT 'v8 migration done' AS result;
