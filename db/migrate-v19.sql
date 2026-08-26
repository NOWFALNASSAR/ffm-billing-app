-- Fresh Control v19 — item-wise billing. Run ONCE in the Neon SQL Editor.
-- Everything here is additional. The cash book, day closing and reserve are untouched.

-- items get a section and their current rates
ALTER TABLE items ADD COLUMN IF NOT EXISTS category  text NOT NULL DEFAULT 'vegetables';
ALTER TABLE items ADD COLUMN IF NOT EXISTS sale_rate numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS cost_rate numeric(12,2) NOT NULL DEFAULT 0;

-- where the UPI QR comes from
ALTER TABLE settings ADD COLUMN IF NOT EXISTS upi_id   text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS upi_name text NOT NULL DEFAULT '';

-- one row per bill, sale or purchase
CREATE TABLE IF NOT EXISTS docs (
  id          serial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('sale','purchase')),
  biz_date    date NOT NULL,
  party_id    integer REFERENCES parties(id),
  cust_name   text,
  phone       text,
  total       numeric(14,2) NOT NULL,
  entry_id    integer REFERENCES entries(id) ON DELETE SET NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docs_date_idx ON docs (biz_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS doc_lines (
  id       serial PRIMARY KEY,
  doc_id   integer NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  item_id  integer NOT NULL REFERENCES items(id),
  qty      numeric(12,3) NOT NULL CHECK (qty > 0),
  rate     numeric(12,2) NOT NULL CHECK (rate >= 0),
  amount   numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS doc_lines_item_idx ON doc_lines (item_id);

SELECT 'v19 migration done' AS result;
