# Plover Time

Rostering and timesheet web app for **Plover Security Services** (family-owned security company in Ballarat / Western Victoria, about 100 guards). Built by Liam Fagan as a cheaper, tailored alternative to Employment Hero. Liam is not a professional developer: explain things in plain language, confirm before anything costly or hard to undo, and keep the task list and wrap-ups clear.

- **Live:** https://plover-time.vercel.app (Vercel, auto-deploys on every push to `main`)
- **Code:** https://github.com/liamfagan2506-coder/Plover-Time (private)
- **Database:** Neon Postgres, Sydney region. **Local dev and the live site use the same database**, so local testing changes live data.
- **Status (20 Oct 2026):** demo sent to Christine Plover (accounts) for feedback. All data is fake demo data. No real staff yet.

## People
- **Christine Plover**: accounts, main contact (emails from glenn@ploversecurity.com.au). The demo manager account is named after her.
- **Glenn Plover**: director.

## What it does (scope agreed with Liam)
First version = **rostering + timesheets only**. Payroll stays in **Xero** (tax, super, STP); this app exports hours. Leave, onboarding and HR docs are not built yet.

- Roles: ADMIN (everything incl. pay rates, employees, holidays), MANAGER (roster, approvals, sites, export), EMPLOYEE (own shifts).
- Roster: week grid by staff or by site, day view (auto on phones), site filter, draft → publish (notifies staff), copy last week (skips duplicates, asks first), clear drafts, drag-and-drop (desktop only), print/PDF (landscape, hides costs), clash checks, public-holiday highlighting, estimated cost.
- Open shifts (claim → manager approves), shift swaps (colleague accepts → manager approves).
- Clock in/out (opens 60 min before shift), timesheet approval with select-all, >15 min variance flagged, missed clock-ins (add hours / no-show).
- Availability rules: one-off date range, or weekly / fortnightly on chosen weekdays; all day or a time window (overnight ok); optional end date + reason. Bookings are blocked if the shift overlaps, with a "Book anyway" override. Managers can edit anyone's rules and get notified on clashes. No approval step. "Unavailable only" (no "available" windows) by Liam's choice.
- Pay: **flat hourly rates** per employee (weekday / Sat / Sun / public holiday), editable by admins. Shifts crossing midnight split by local day. Real Security Services Industry Award rates not done yet (Liam will supply).
- Xero export: CSV per employee/day/earnings rate + pay summary; marks timesheets EXPORTED. Xero AU has no confirmed native timesheet CSV import; earnings rate names in `src/lib/pay.ts` (`XERO_EARNINGS_RATES`). A direct Xero Payroll API integration is a likely future task.
- Guards: home shows next shift, clock in, "This pay fortnight" hours/estimated pay (`PAY_PERIOD_START` env sets the fortnight anchor, default 2026-01-05 placeholder), calendar subscription feed (`/calendar/<token>.ics`), availability page.
- Installable as a phone app (manifest + Plover logo icons), notification bell with unread badge, in-app + email (SMTP, not configured yet, so emails print to the server log) + SMS (Twilio, not configured).

## Tech
Next.js 15 (App Router, server components + server actions), React 19, TypeScript, Tailwind v4, Prisma 6 + Postgres (Neon), jose (signed session cookie), bcryptjs, nodemailer. Timezone: `APP_TIMEZONE` = Australia/Melbourne; all dates are stored in UTC and converted with helpers in `src/lib/time.ts`. Never use the server's local time.

Key files:
- `prisma/schema.prisma`: data model. `prisma/seed.ts`: initial users, sites, VIC public holidays 2026–27, demo data.
- `src/lib/`: `time.ts` (timezone), `pay.ts` (rates, day splitting, pay period), `availability.ts` (rule expansion), `auth.ts` / `session.ts`, `notify.ts`, `export.ts`, `forms.ts` (`back()` redirect-with-message helper).
- `src/actions/`: server actions (`shifts.ts`, `timesheets.ts`, `admin.ts`, `auth.ts`, `me.ts`).
- `src/app/(app)/`: signed-in pages. `src/app/login`, `src/app/calendar/[file]` (public, token-protected), `src/middleware.ts` (redirects signed-out users; matcher excludes login, calendar and files with a dot).
- `scripts/reset-demo.ts`: rebuilds demo data around the current week.

## Commands
- `npm run dev`: dev server (preview config "plover-time" on port 3010).
- `npm run build && npm start`: production build (preview config "plover-time-prod", port 3011). Prefer this for testing; see OneDrive below.
- `npm run demo:reset`: refresh demo shifts/timesheets/requests around this week. **Refuses to run if any non-demo user exists.** Wipes demo shifts, timesheets, swaps, claims, availability and notifications; keeps users, sites and holidays. Ask before running if Christine might be mid-review.
- `npx prisma db push`: apply schema changes to Neon (stop the dev server first on Windows or the Prisma engine file is locked). For destructive changes, copy data first and drop old tables only after the new code is deployed.
- Deploy = commit and `git push` to `main`; Vercel builds in about a minute. `postinstall` runs `prisma generate`.

## Environment / secrets
- `.env` (git-ignored): `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct), `AUTH_SECRET`, `APP_URL`, `APP_TIMEZONE`, optional `SMTP_*`, `TWILIO_*`, `PAY_PERIOD_START`.
- `.env.vercel` (git-ignored) holds the values pasted into Vercel's Environment Variables. Remove `channel_binding=require` from Neon URLs; add `connect_timeout=15`.
- Vercel functions are pinned to Sydney (`vercel.json` regions `syd1`) to sit next to the database.
- Never print secrets or connection strings in chat. The Neon password was once pasted in chat; Liam was advised to reset it.
- Demo accounts all use the password in the README (`PloverDemo2026!`): admin@, manager@ (Christine Plover), sam@, jordan@, alex@, riley@, casey@ploversecurity.com.au. Don't type passwords into the live site from an automated browser; test on localhost.

## Gotchas
- **OneDrive:** the project lives in OneDrive, which locks `.next` files and breaks `next dev` with EBUSY errors. Fix: stop the server, delete `.next`, restart, or test with a production build. A junction for `.next` does NOT work (module resolution breaks). Long-term fix: move the folder out of OneDrive (e.g. `C:\Projects\plover-time`).
- Windows: use Git Bash or PowerShell; `gh` CLI is not installed (pushes go through Git Credential Manager).
- Neon free tier sleeps after ~5 min idle; the first request after that is slow.
- In middleware matchers, regex backslashes must be doubled inside the JS string.
- Demo data goes stale as the weeks pass (the roster looks empty). Run `npm run demo:reset` before anyone reviews it.

## Costs (told to Liam, Oct 2026)
Demo: free. Going live: Vercel Pro about US$20/month (Hobby is non-commercial only), Neon Launch about US$5–20/month usage-based, email free tier, SMS optional per text. Suggested the accounts end up owned or paid by Plover, and that Liam prices in his own time.

## Likely next steps
1. Christine's feedback → changes.
2. Real data: import employees from a spreadsheet (CSV upload, not built yet), real pay rates / award rules, real sites, set `PAY_PERIOD_START`.
3. Go-live checklist: fresh database (`SEED_DEMO=false`), change admin password, Vercel Pro, Neon paid plan, configure email (e.g. Resend SMTP), optional custom domain (e.g. time.ploversecurity.com.au), reset the Neon password.
4. Possible features: Xero API integration, leave requests, onboarding / documents, licence expiry tracking (security licence, first aid), search / filters for 100 staff, admin setup checklist.
