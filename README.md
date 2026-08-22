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
| Nowfal | OWNER | 1111 |
| Manager | MANAGER | 2222 |
| Cashier | CASHIER | 3333 |

**Change all three on day one.** Owner can add more staff later.

## What it enforces
- A closed day cannot be written to — the database itself refuses, not just the screen.
- Cashiers cannot delete entries, reopen days, or change settings.
- Every entry, deletion, closing and reopening is written to the activity log with who and when.
- Counted cash at closing becomes the next day's opening cash automatically.

## If something goes wrong
- **404 on Vercel** — Settings → Build and Deployment: Framework must be Next.js, Root Directory must be the folder holding `package.json`.
- **"Tables missing"** — `db/schema.sql` has not been run in Neon yet.
- **"Cannot reach the database"** — `DATABASE_URL` is missing or wrong in Vercel; redeploy after adding it.
- Anything else: copy the exact error text into Claude Code in this folder.
