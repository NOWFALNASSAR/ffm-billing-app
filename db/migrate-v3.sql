-- Fresh Control v3 — run ONCE in the Neon SQL Editor, after v1 is already installed.
-- Renames the three roles and logins to ADMIN / MANAGER / BILLING.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'ADMIN'   WHERE role = 'OWNER';
UPDATE users SET role = 'BILLING' WHERE role = 'CASHIER';

UPDATE users SET name = 'Admin'   WHERE role = 'ADMIN'   AND name = 'Nowfal';
UPDATE users SET name = 'Billing' WHERE role = 'BILLING' AND name = 'Cashier';

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','MANAGER','BILLING'));

SELECT id, name, role FROM users ORDER BY id;
