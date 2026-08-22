-- Fresh Control — run this ONCE in the Neon SQL Editor, then never again.
-- Seed PINs: Owner 1111, Manager 2222, Cashier 3333 — change them after first login.

CREATE TABLE IF NOT EXISTS users (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  role       text NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER')),
  pin_hash   text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS parties (
  id         serial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('supplier','customer')),
  name       text NOT NULL,
  phone      text,
  opening    numeric(14,2) NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

CREATE TABLE IF NOT EXISTS entries (
  id         serial PRIMARY KEY,
  type       text NOT NULL CHECK (type IN
             ('sale','purchase','supplier_payment','customer_collection','expense','cash_in','cash_out')),
  biz_date   date NOT NULL,
  party_id   integer REFERENCES parties(id),
  amount     numeric(14,2) NOT NULL CHECK (amount > 0),
  mode       text NOT NULL CHECK (mode IN ('cash','upi','card','bank','credit')),
  category   text,
  ref_no     text,
  remarks    text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entries_date_idx ON entries (biz_date);
CREATE INDEX IF NOT EXISTS entries_party_idx ON entries (party_id);

CREATE TABLE IF NOT EXISTS closings (
  id         serial PRIMARY KEY,
  biz_date   date NOT NULL UNIQUE,
  opening    numeric(14,2) NOT NULL DEFAULT 0,
  expected   numeric(14,2) NOT NULL DEFAULT 0,
  actual     numeric(14,2) NOT NULL DEFAULT 0,
  denoms     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('CLOSED','REOPENED')),
  closed_by  text,
  closed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit (
  id         bigserial PRIMARY KEY,
  who        text NOT NULL,
  what       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_time_idx ON audit (created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name  text NOT NULL DEFAULT 'Family Fresh Mart',
  gp_method  text NOT NULL DEFAULT 'markup',
  gp_rate    numeric(5,2) NOT NULL DEFAULT 12,
  cash_alert numeric(14,2) NOT NULL DEFAULT 1000
);

-- A closed day cannot be written to, whatever the screen allows.
CREATE OR REPLACE FUNCTION block_closed_day() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM closings WHERE biz_date = NEW.biz_date;
  IF st = 'CLOSED' THEN
    RAISE EXCEPTION 'Day % is closed. Reopen it before entering or editing.', NEW.biz_date;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entries_closed_day ON entries;
CREATE TRIGGER entries_closed_day BEFORE INSERT OR UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION block_closed_day();

-- ---- seed -----------------------------------------------------------------
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO parties (kind, name) VALUES ('customer', 'Walk-in customer')
  ON CONFLICT DO NOTHING;

INSERT INTO users (name, role, pin_hash) VALUES
  ('Nowfal',  'OWNER',   '4896c6387dc4ce5047ce7c3ab04b1c3c:44c345ec013cf037af96883ce401d42ee9ed10dfe56ff50b2352ab3df79692a6'),
  ('Manager', 'MANAGER', 'ec6f0da4b142ab8a10568b996cbcbdc7:b75b49ef2876c121d8792ffc4fed19a76b6106e8d87a282619c21efd49691098'),
  ('Cashier', 'CASHIER', 'bb9eb2f558a24e506493b98efd800239:e4836c7bed5367bf095a589b3c967f6457f0a8aef1202cf01b7cab0d020da2a6')
ON CONFLICT DO NOTHING;
