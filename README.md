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
FMP_API_KEY=your_financial_modeling_prep_api_key
MARKET_DATA_REFRESH_SECRET=replace_with_a_long_random_secret
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used by browser and server Supabase clients. `SUPABASE_SECRET_KEY` is server-only and must never be exposed through a `NEXT_PUBLIC_*` variable.
`FMP_API_KEY` is also server-only and is used by market-data refresh code when calling Financial Modeling Prep.
`MARKET_DATA_REFRESH_SECRET` is server-only and authorizes trusted scheduler calls to the refresh endpoint. If you deploy on Vercel Cron and prefer its conventional name, `CRON_SECRET` is also accepted.

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
- `stock_fundamentals`
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
- `/watchlist` is protected and shows signed-in users their default-portfolio watchlist with target prices, notes, linked stock symbols, cached company names, latest cached close prices when available, and Graham scoring placeholders until deterministic scoring ships.
- Watchlist server actions are available for signed-in users to create, update, and delete default-portfolio watchlist items with normalized symbols, optional positive target prices, and optional notes.
- `/stocks/[symbol]` is protected and shows a normalized stock detail route for symbols such as `/stocks/AAPL`, including the signed-in user's holding summary when they own the cached stock. Stock detail pages currently assume the prototype's US-listed stock scope and render only locally cached market-data snapshots; they do not fetch live provider data during page render. Cached price-derived sections show fresh, stale, or unavailable status from the latest cached close date.
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

The dashboard, holdings page, stock detail page, and watchlist page/helpers use the authenticated Supabase server client for portfolio-scoped reads and writes, so RLS remains the ownership boundary. The dashboard displays a read-only holdings table with linked stock symbols, company names, manual quantity and cost basis, latest cached close prices, market values, unrealised gain/loss, allocation, and cached deterministic labels when available. Summary totals show cash balance, holdings value, and overall portfolio value; holdings value uses the latest cached close when present and falls back to manual cost basis until market data is connected. The holdings page also links each holding symbol to its normalized stock detail route while keeping the row editable. The watchlist page links each watched symbol to its normalized stock detail route and shows cached company names, latest cached close prices, target prices, Graham label and margin-of-safety placeholders, notes, and a clear empty state when the user's default portfolio has no watched stocks. Stock detail pages show a neutral not-owned state for cached stocks outside the user's default portfolio, render a cached daily close price chart when at least two historical price rows exist, show recent cached price movement and moving averages when enough history exists, display latest cached fundamentals when a `stock_fundamentals` row exists, and show quantity, average cost, holding currency, latest cached close, market value, unrealised gain/loss, and portfolio percentage for owned stocks when cached price data supports those calculations. Stock detail price sections use a deterministic 3-calendar-day freshness window for the latest cached close, show the as-of date used by the chart, recent movement, moving averages, and cached range, and mark those sections stale or unavailable rather than presenting old data as current. Stale movement and moving-average values remain framed as as-of cached context. Stock detail sections keep partial cached data visible and show targeted insufficient-data states for missing profile rows, latest close prices, historical prices, fundamentals, and dependent holding calculations instead of inventing zero values. Server-side stock detail load failures render section-level fallback messages and are logged for observability. Cash balance edits are stored against the user's default portfolio in its base currency. When a user adds or edits a holding for a symbol that is not yet in `stocks`, a server action uses the server-only Supabase secret key to fetch and cache the company profile when `FMP_API_KEY` is configured. Watchlist create and symbol-change update actions use the same server-only market-data cache path before writing the watched symbol, while notes-only and target-price-only updates keep the existing cached stock reference. If the stock reference cannot be verified or cached, the action shows a snackbar error instead of creating placeholder market data. If the stock reference is saved but the latest price is unavailable, incomplete, or rate-limited, the holding or watchlist save can still complete and the page shows a snackbar warning while continuing to display manual quantity, average cost, target price, and notes data. Each holdings row also has a manual Refresh action that resolves the symbol from the authenticated user's holding, calls Financial Modeling Prep server-side, and updates the shared `stocks` and `stock_prices` cache rows. Stock detail pages expose the same controlled refresh path for stale or unavailable symbols that are present in the user's holdings or watchlist. Manual refresh failures are surfaced as snackbar errors without changing cached prices.

## Market Data Provider Interface

The market-data provider contract lives in `src/lib/market-data`. Providers must return normalized company profile, latest price, historical price, and fundamentals data through explicit success or failure results. The interface is provider-agnostic so future adapters can plug in external services server-side without leaking API keys or provider-specific response shapes into UI code.

The Financial Modeling Prep adapter is available through `createFinancialModelingPrepProvider`. It reads `FMP_API_KEY` by default, calls FMP's stable server-side endpoints, normalizes provider-specific response fields into the shared contract, and maps provider failures such as missing symbols, rate limits, unavailable service responses, and invalid payloads into explicit market-data failure results.

Market data cache helpers live in `src/lib/market-data/cache.ts`. They map normalized provider profiles into the shared `stocks` table and upsert by `symbol`, so repeated fetches refresh the cached company name, exchange, sector, industry, country, and currency without exposing provider credentials to browser clients. They also map the latest normalized provider quote and daily historical price batches into `stock_prices` and upsert by `symbol,price_date`, so refreshing a tracked symbol stores cached open, high, low, close, and volume rows for dashboard, holdings, and chart calculations.

The scheduled refresh endpoint is available at `/api/market-data/refresh` for `GET` or `POST` requests from a trusted scheduler. Calls must include `Authorization: Bearer <MARKET_DATA_REFRESH_SECRET>` or, when using Vercel Cron naming, `Authorization: Bearer <CRON_SECRET>`. The job uses the server-only Supabase secret key, collects distinct symbols from holdings and watchlist items, refreshes the company profile and latest price for each symbol through Financial Modeling Prep, and returns a JSON summary with requested, refreshed, and failed counts. Per-symbol provider failures are reported in the JSON response without exposing provider keys to the browser.

To run a live FMP smoke test, create or sign in to a Financial Modeling Prep account, copy an API key from the FMP dashboard, add `FMP_API_KEY` to `.env.local`, and run:

```bash
npm run test:market-data:live
```

You can also pass the key only for a single command with `FMP_API_KEY=your_financial_modeling_prep_api_key npm run test:market-data:live`.
The live test fetches an AAPL company profile, latest quote, and a small historical price sample. It is skipped unless `FMP_API_KEY` is present so normal test runs do not call the external provider.
