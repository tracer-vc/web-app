# Open to-dos

Things that need doing outside the code (accounts, dashboards, keys) or a decision. Check this list before deploying. Tick items off when done.

## Before deploying to Vercel

- [ ] **Vercel project.** Import the repo, set the env vars from `.env.local.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`). Then run M2 test step 8 (sign-up, team, login on the Vercel URL).
- [ ] **Inngest account (free plan).** Create an account at inngest.com, install the Inngest Vercel integration (or add the app's `/api/inngest` URL), and copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Vercel. Locally no account is needed: set `INNGEST_DEV=1` in `.env.local` and run the dev server with `npx inngest-cli@latest dev`. **Do not set `INNGEST_DEV` on Vercel.** Free plan: 50k step executions/month, 5 concurrent steps, 24 h trace history; it pauses (no charge) when the quota runs out.
- [ ] **Supabase Auth URLs.** Authentication → URL Configuration: set the Site URL to the Vercel domain and add `https://<vercel-domain>/auth/confirm` to the redirect URLs (keep the localhost ones for development).

## Supabase settings

- [ ] **Leaked password protection.** Authentication → Providers → Email: enable "Prevent use of leaked passwords" (the security advisor warns about it; may need the Pro plan).

## Keys

- [ ] **Tavily API key on Vercel** (web search, M8). Already in `.env.local` (2026-10-02); add `TAVILY_API_KEY` to Vercel when deploying. Free plan: 1,000 credits/month, about 8 per deal with web search.

## Decisions

- [ ] **"Tracer Fund"** (seeded in M1) has no members and can't get any since self-service sign-up (decision 2). Keep it or delete it.

## Done

- [x] Custom SMTP for sign-up confirmation emails (2026-10-01).
- [x] OpenAI API key in `.env.local` (2026-10-02).
