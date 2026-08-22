# Fresh Control

Daily sales, purchases, supplier and customer balances, cash and day-end closing.
Next.js + Neon PostgreSQL. No item-wise stock — that is v2.

## Go live in four steps

### 1. Create the database (5 min)
neon.com → new project, region **Singapore**. Open **SQL Editor**, paste the whole of
`db/schema.sql`, press **Run**. It creates the tables and three sign-in users.

Then go to **Dashboard → Connection string** and copy it. It looks like:
`postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

### 2. Run it on your laptop (10 min)
Install Node.js from nodejs.org first (LTS version). Then in this folder:

```bash
cp .env.example .env.local     # Windows: copy .env.example .env.local
```

Open `.env.local` and put in your real connection string, plus any long random text as
`SESSION_SECRET`. Then:

```bash
npm install
npm run dev
```

Open http://localhost:3000 — sign in as Nowfal, PIN **1111**.
If this works, deployment will work.

### 3. Put it online (10 min)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Accept the defaults; when it asks about the directory, press Enter.
Then in the Vercel dashboard → your project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Neon connection string |
| `SESSION_SECRET` | the same long random text |

Then run `vercel --prod` once more. Open the link it prints.

### 4. Before real money goes in
- Sign in as each of the three users and change every PIN (Reports → Settings → Change my PIN).
- Add your suppliers with true opening balances.
- Enter the actual cash in hand: Entry → Cash in, on your start date.
- On the shop phone: open the link in Chrome → menu → **Add to Home screen**.

## Sign-in
| User | Role | PIN |
|---|---|---|
| Admin | ADMIN | 1111 |
| Manager | MANAGER | 2222 |
| Billing | BILLING | 3333 |

Admin can do everything including managing staff. Manager can back-date, delete and reopen days.
Billing can only enter and close today.

**Change all three on day one.** Owner can add more staff later.

## Version 8 — what changed
- **Cash only.** No separate bank balance. Everything is one cash position.
- **Day end** has a line called **Bank** sitting under the notes: type what you sent to the bank.
  Notes + bank must equal the expected figure. Tomorrow opens with the notes only.
- **Purchase return** entry — goods sent back. Reduces the supplier's balance on credit,
  or comes back as cash on a refund.
- Reports and the Investment panel fixed.

## Version 7 — what changed
- Today screen shows **cash in hand** and **bank balance** separately. Tap any total to see the entries behind it.
- Day end has a **cash to bank** box: enter what you deposit, count what remains, difference is judged against that.
- **Expenses are cash only.** Supplier payments default to cash, UPI still available.
- **GP is 12% of sales** (adjustable in Settings). Nothing to do with purchase value.
- Supplier and customer pickers have a **search box**.
- **Wastage** entry — value thrown, shown against GP.
- **Opening & investment** entries dated before the start date: opening purchases, own investment,
  renovation, loans in and out. They never touch the daily drawer.
- **Stock value** — one figure from a physical count, weekly is enough.
- **Items and shortage orders**: keep a list of items, pass an order to a supplier, send it on WhatsApp,
  track ordered versus received.
- **Purchase bills**: photo, shrunk in the phone before saving.

## Roles
| | Billing | Manager | Admin |
|---|---|---|---|
| Enter today's money | yes | yes | yes |
| Close the day | yes | yes | yes |
| Back-date an entry | no | yes | yes |
| Delete, reopen, bulk upload | no | yes | yes |
| Opening figures, stock value | no | yes | yes |
| Settings and staff | no | no | yes |

## Updating an existing installation

Run these once in the Neon SQL Editor, in order, whichever you have not run yet:
1. `db/migrate-v3.sql` — renames roles to admin / manager / billing.
2. `db/migrate-v7.sql` — bank, setup entries, items, orders, bills, wastage, stock value.
Then upload the code. Run the SQL **before** uploading, or the app will error on load.

## Bulk upload
Entry → Bulk upload. CSV columns: date, type, party, amount, mode, category, reference.
See `db/sample-bulk.csv`. Supplier and customer names must already exist in the app.

## Installing on a phone
Android (Chrome): open the site, menu ⋮ → **Install app** (or Add to Home screen).
iPhone (Safari only): open the site, Share button → **Add to Home Screen**.
It then opens full screen with its own icon, no browser bar. Sessions last 12 hours,
so staff sign in about once a day.

## What it enforces
- A closed day cannot be written to — the database itself refuses, not just the screen.
- Billing staff cannot back-date, delete entries, reopen days, or change settings.
- Nobody can enter a future date.
- Every entry, deletion, closing and reopening is written to the activity log with who and when.
- Counted cash at closing becomes the next day's opening cash automatically.

## If something goes wrong
- **404 on Vercel** — Settings → Build and Deployment: Framework must be Next.js, Root Directory must be the folder holding `package.json`.
- **"Tables missing"** — `db/schema.sql` has not been run in Neon yet.
- **"Cannot reach the database"** — `DATABASE_URL` is missing or wrong in Vercel; redeploy after adding it.
- Anything else: copy the exact error text into Claude Code in this folder.
