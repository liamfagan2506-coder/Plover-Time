# Plover Time

Rostering and timesheets for Plover Security Services. Guards see their shifts, clock in and out on their phone,
pick up open shifts and swap shifts. Managers build the roster, approve timesheets and export approved hours for Xero Payroll.

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then set AUTH_SECRET and the Neon DATABASE_URL / DIRECT_URL
npm run setup             # creates the database and loads demo data
npm run dev
```

Open http://localhost:3000.

### Demo accounts

All demo accounts use the password in `SEED_PASSWORD` (default `PloverDemo2026!`, see `prisma/seed.ts`).

| Email | Access |
| --- | --- |
| admin@ploversecurity.com.au | Admin: everything, including pay rates |
| manager@ploversecurity.com.au | Manager: roster, approvals, sites, Xero export |
| sam@ploversecurity.com.au (also jordan, alex, riley, casey) | Employee |

To start with real data only (just the admin account and public holidays), point `.env` at an empty Neon
database (or branch) and run `SEED_DEMO=false npm run setup`. Then sign in as admin and change the password straight away.

## What's in it

- **Roster**: weekly grid by employee, with draft shifts, publish-and-notify, copy last week, double-booking checks,
  public holiday highlighting and estimated weekly hours and cost.
- **Open shifts**: leave the employee blank to make a shift open. Staff request it and a manager approves.
- **Shift swaps**: a guard offers a shift to a colleague, the colleague accepts, a manager approves.
- **Clock in/out**: from the home screen, opening 60 minutes before the shift starts. The guard records their break when clocking out.
- **Timesheets**: managers approve in bulk. Timesheets more than 15 minutes off the roster are flagged. Missed clock-ins
  can be filled in or marked as no-shows.
- **Pay rates**: flat hourly weekday, Saturday, Sunday and public holiday rates per employee (Admin > Employees & rates).
  Shifts that cross midnight are split by day.
- **Xero export**: CSV of approved hours per employee, per day and per earnings rate, plus a pay summary. Exported timesheets are
  locked so they aren't paid twice. Earnings rate names are set in `src/lib/pay.ts`.
- **Notifications**: in-app, email (set `SMTP_*`) and SMS (set `TWILIO_*`). Without settings, emails print to the server console.

## Hosting

1. The database is Postgres on Neon (Sydney region). Data lives there, not on your computer.
2. Deploy to Vercel (or any Node host) with the environment variables from `.env.example`, then (if it's a new database) run `npx prisma db push`
   and `SEED_DEMO=false npx prisma db seed` once against the production database.

## Things to check before going live

- The flat rates are placeholders. Have your accountant confirm them against the Security Services Industry Award 2020.
- Check the preloaded Victorian public holidays each year, and add AFL Grand Final Friday when it's announced.
- Make sure the earnings rate names in `src/lib/pay.ts` match the pay items in your Xero Payroll.
- All times use `APP_TIMEZONE` (Australia/Melbourne).
