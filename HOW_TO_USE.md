# How to use Assets Watcher

## Prerequisites

- Node.js 20 or later
- npm
- A hosted Supabase project for normal browser development
- Docker-compatible runtime and the Supabase CLI only for local schema work

## Configure the application

Install dependencies and create a local environment file:

```bash
npm install
cp .env.local.example .env.local
```

Set these values in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SECRET_KEY=sb_secret_your_key
FMP_API_KEY=your_financial_modeling_prep_api_key
MARKET_DATA_REFRESH_SECRET=replace_with_a_long_random_secret
```

Only the first two values are browser-safe. The remaining values are server-only. `CRON_SECRET` is also accepted for the scheduled refresh endpoint when using the conventional Vercel Cron name.

Add `http://localhost:3000/auth/callback` to Supabase's allowed redirect URLs.

## Run locally

```bash
npm run typecheck
npm run dev
```

Open `http://localhost:3000`. With the hosted backend configured, a user can sign up, sign in, receive a default portfolio, and manage holdings without Docker.

## Run checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The live market-data test is opt-in because it makes a provider request:

```bash
npm run test:market-data:live
```

## Local Supabase schema work

Start the local stack:

```bash
npx supabase start
npx supabase status
```

To point the app at it, copy the local API URL, publishable key, and service-role key from the startup output into `.env.local`. Apply the committed migrations and regenerate database types as needed:

```bash
npx supabase db reset --local --no-seed
npx supabase gen types typescript --local > src/types/supabase.ts
```

For a hosted project, use the linked-project commands deliberately:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --linked
npx supabase migration list --linked
```

Never expose `SUPABASE_SECRET_KEY`, `FMP_API_KEY`, or the refresh secret to browser code.
