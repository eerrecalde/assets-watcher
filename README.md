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
- Docker Desktop or another Docker-compatible runtime for the local Supabase stack
- Supabase CLI, run through `npx supabase`

## Local Setup

Install dependencies:

```bash
npm install
```

Copy the local environment template:

```bash
cp .env.local.example .env.local
```

Start the local Supabase stack:

```bash
npx supabase start
```

Copy the local API URL, anon key, and service role key from the `supabase start` output into `.env.local`:

```txt
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local anon key>
SUPABASE_SECRET_KEY=<local service_role key>
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used by browser and server Supabase clients. `SUPABASE_SECRET_KEY` is server-only and must never be exposed through a `NEXT_PUBLIC_*` variable.

Apply local database migrations:

```bash
npx supabase db reset --local --no-seed
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

## Hosted Supabase Setup

For a hosted Supabase project, use the same `.env.local` keys with values from the Supabase project dashboard:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SECRET_KEY=sb_secret_your_key
```

Keep the secret key in server-only environments. Do not commit `.env.local`.

## Authentication

The initial authentication flow uses Supabase email/password auth:

- `/signup` creates a user account.
- `/login` signs an existing user in.
- `/dashboard` is protected and redirects anonymous users to `/login`.
- The dashboard logout action signs the current user out and returns them to `/login`.
- `/auth/callback` exchanges Supabase email-confirmation codes for a session.

In the Supabase dashboard, add the local callback URL to the allowed redirect URLs when testing sign up locally:

```txt
http://localhost:3000/auth/callback
```

## Useful Scripts

- `npm run dev` starts the Next.js development server.
- `npm run lint` runs ESLint across the project.
- `npm run typecheck` runs TypeScript without emitting build output.
- `npm run build` creates a production Next.js build.
- `npm run start` starts the production server after `npm run build`.

Useful Supabase commands:

- `npx supabase start` starts the local Supabase services.
- `npx supabase status` prints the local API URL and keys.
- `npx supabase db reset --local --no-seed` reapplies local migrations.
- `npx supabase stop` stops the local Supabase services.

## Supabase Utilities

Supabase client helpers live in `src/lib/supabase`:

- `client.ts` creates a browser client for Client Components.
- `server.ts` creates a cookie-aware server client for Server Components, Server Actions, and Route Handlers.
- `admin.ts` creates a server-only client using `SUPABASE_SECRET_KEY` for trusted jobs or admin workflows.

Database migrations live in `supabase/migrations`. The schema baseline creates the core portfolio, holdings, watchlist, market-data cache, scoring snapshot, user-rule, and AI-take tables. Follow-up migrations enable row-level access policies so authenticated users can only access their own application data while shared market-data cache tables remain read-only.

After applying migrations locally, regenerate database types with:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```
