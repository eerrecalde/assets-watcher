# Stock Portfolio Intelligence App

This is the base Next.js application for the stock portfolio intelligence app.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- Supabase Auth and Postgres

## Getting Started

Install dependencies:

```bash
npm install
```

Copy the local environment template:

```bash
cp .env.local.example .env.local
```

Populate the Supabase values from the Supabase project dashboard:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SECRET_KEY=sb_secret_your_key
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used by browser and server Supabase clients. `SUPABASE_SECRET_KEY` is server-only and must never be exposed through a `NEXT_PUBLIC_*` variable.

Run a type check:

```bash
npm run typecheck
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

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

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Supabase Utilities

Supabase client helpers live in `src/lib/supabase`:

- `client.ts` creates a browser client for Client Components.
- `server.ts` creates a cookie-aware server client for Server Components, Server Actions, and Route Handlers.
- `admin.ts` creates a server-only client using `SUPABASE_SECRET_KEY` for trusted jobs or admin workflows.

Database types are currently a placeholder in `src/types/supabase.ts` and should be replaced with generated Supabase types once the schema baseline exists.
