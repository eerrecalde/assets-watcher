# Stock Portfolio Intelligence App

This is the base Next.js application for the stock portfolio intelligence app.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- Supabase Auth and Postgres

## Prerequisites

- Node.js 20 or newer
- npm
- A hosted Supabase project for day-to-day browser testing
- Docker Desktop or another Docker-compatible runtime only when running the local Supabase stack for schema work
- Supabase CLI, run through `npx supabase`

## Local Setup

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.local.example .env.local
```

Fill `.env.local` with values from the hosted Supabase project dashboard:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SECRET_KEY=sb_secret_your_key
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used by browser and server Supabase clients. `SUPABASE_SECRET_KEY` is server-only and must never be exposed through a `NEXT_PUBLIC_*` variable.

Apply committed migrations to the hosted project when setting up or updating the shared dev backend:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --linked
npx supabase migration list --linked
```

Run a type check before starting development:

```bash
npm run typecheck
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

With the hosted backend configured, a developer should be able to sign up, log in, land on a default portfolio, and create, edit, and delete holdings without Docker running.

## Local Supabase Schema Work

Use the local Supabase stack for migration and schema iteration:

```bash
npx supabase start
```

If you need to point the app at the local stack temporarily, copy the local API URL, publishable key, and secret key from the `supabase start` output into `.env.local`:

```txt
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local anon key>
SUPABASE_SECRET_KEY=<local service_role key>
```

Apply local database migrations:

```bash
npx supabase db reset --local --no-seed
```

After applying migrations locally, regenerate database types with:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

## Hosted Supabase Checks

For hosted setup, confirm these tables are available through the Supabase Data API:

- `users`
- `portfolios`
- `portfolio_cash`
- `holdings`
- `stocks`
- `stock_prices`
- `user_rules`

The committed schema explicitly grants API access to `anon` and `authenticated` where needed, and RLS is enabled for all public app tables. User-owned tables should only return rows belonging to the signed-in user; shared market-data tables such as `stocks` and `stock_prices` are read-only for browser clients.

In the Supabase dashboard, add the local callback URL to the allowed redirect URLs when testing sign up locally:

```txt
http://localhost:3000/auth/callback
```

## Authentication

The initial authentication flow uses Supabase email/password auth:

- `/signup` creates a user account.
- `/login` signs an existing user in.
- `/dashboard` is protected, redirects anonymous users to `/login`, and shows a read-only holdings table for the user's default portfolio.
- `/holdings` is protected and lets signed-in users edit their default portfolio cash balance and create, read, update, and delete holdings.
- The dashboard logout action signs the current user out and returns them to `/login`.
- `/auth/callback` exchanges Supabase email-confirmation codes for a session.

## Useful Scripts

- `npm run dev` starts the Next.js development server.
- `npm run lint` runs ESLint across the project.
- `npm run test` runs unit tests.
- `npm run typecheck` runs TypeScript without emitting build output.
- `npm run build` creates a production Next.js build.
- `npm run start` starts the production server after `npm run build`.

Useful Supabase commands:

- `npx supabase start` starts the local Supabase services.
- `npx supabase status` prints the local API URL and keys.
- `npx supabase db reset --local --no-seed` reapplies local migrations.
- `npx supabase db push --linked` applies committed migrations to the linked hosted project.
- `npx supabase migration list --linked` compares local and hosted migration history.
- `npx supabase stop` stops the local Supabase services.

## Supabase Utilities

Supabase client helpers live in `src/lib/supabase`:

- `client.ts` creates a browser client for Client Components.
- `server.ts` creates a cookie-aware server client for Server Components, Server Actions, and Route Handlers.
- `admin.ts` creates a server-only client using `SUPABASE_SECRET_KEY` for trusted jobs or admin workflows.

Database migrations live in `supabase/migrations`. The schema baseline creates the core portfolio, holdings, watchlist, market-data cache, scoring snapshot, user-rule, and AI-take tables. Follow-up migrations enable row-level access policies so authenticated users can only access their own application data while shared market-data cache tables remain read-only. New auth users are also onboarded with an app user row, a default USD portfolio, a zero USD cash row, and default rule settings.

The dashboard and holdings page use the authenticated Supabase server client for portfolio cash and holdings reads, so RLS remains the ownership boundary. The dashboard displays a read-only holdings table with company names, manual quantity and cost basis, latest cached close prices, market values, unrealised gain/loss, allocation, and cached deterministic labels when available. Summary totals show cash balance, holdings value, and overall portfolio value; holdings value uses the latest cached close when present and falls back to manual cost basis until market data is connected. Cash balance edits are stored against the user's default portfolio in its base currency. When a user adds or edits a holding for a symbol that is not yet in `stocks`, a server action uses the server-only Supabase secret key to create a minimal US stock placeholder for that symbol. Cached market prices are displayed when present; otherwise the page still shows manual quantity and average cost data.
