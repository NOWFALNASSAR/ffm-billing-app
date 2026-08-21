-- Fresh Control v7 — run ONCE in the Neon SQL Editor, before uploading the new code.
-- Adds: bank side of the cash book, opening/setup entries, items, shortage orders,
-- purchase bills, wastage and stock value.

-- ---- settings -------------------------------------------------------------
ALTER TABLE settings ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT DATE '2026-08-17';
UPDATE settings SET gp_method = 'sales', gp_rate = 12 WHERE id = 1;

-- ---- new entry types + setup flag -----------------------------------------
ALTER TABLE entries ADD COLUMN IF NOT EXISTS is_setup boolean NOT NULL DEFAULT false;
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_type_check;
ALTER TABLE entries ADD CONSTRAINT entries_type_check CHECK (type IN (
  'sale','purchase','supplier_payment','customer_collection','expense','cash_in','cash_out',
  'bank_deposit','bank_withdraw','wastage',
  'opening_purchase','investment','renovation','loan_in','loan_repay'));

-- Wastage carries no payment; allow a blank-style mode without breaking the check.
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_mode_check;
ALTER TABLE entries ADD CONSTRAINT entries_mode_check
  CHECK (mode IN ('cash','upi','card','bank','credit','none'));

-- ---- items you regularly stock --------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id           serial PRIMARY KEY,
  name         text NOT NULL UNIQUE,
  unit         text NOT NULL DEFAULT 'kg',
  supplier_id  integer REFERENCES parties(id),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- shortage orders passed to a supplier ---------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id           serial PRIMARY KEY,
  biz_date     date NOT NULL,
  supplier_id  integer NOT NULL REFERENCES parties(id),
  item_id      integer NOT NULL REFERENCES items(id),
  qty_ordered  numeric(12,2) NOT NULL CHECK (qty_ordered > 0),
  qty_received numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','CLOSED','CANCELLED')),
  remarks      text,
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, biz_date);

-- ---- purchase bill photos --------------------------------------------------
CREATE TABLE IF NOT EXISTS bills (
  id           serial PRIMARY KEY,
  biz_date     date NOT NULL,
  supplier_id  integer REFERENCES parties(id),
  amount       numeric(14,2),
  ref_no       text,
  image        text NOT NULL,          -- compressed JPEG, stored as data URL
  uploaded_by  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bills_date_idx ON bills (biz_date DESC);

-- ---- physical stock value, counted now and then ----------------------------
CREATE TABLE IF NOT EXISTS stock_counts (
  id         serial PRIMARY KEY,
  biz_date   date NOT NULL UNIQUE,
  value      numeric(14,2) NOT NULL CHECK (value >= 0),
  remarks    text,
  counted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Setup entries sit before the start date and must not disturb daily cash.
CREATE INDEX IF NOT EXISTS entries_setup_idx ON entries (is_setup, biz_date);

SELECT 'v7 migration done' AS result;
