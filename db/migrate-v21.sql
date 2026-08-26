-- Fresh Control v21 — printed bill, customer history, offers. Run ONCE in Neon.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS shop_phone   text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shop_address text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shop_tagline text NOT NULL DEFAULT 'Fresher choices, happier tomorrows';

CREATE INDEX IF NOT EXISTS docs_phone_idx ON docs (phone) WHERE phone IS NOT NULL;

SELECT 'v21 migration done' AS result;
