# Project overview

A single-page site (`index.html`) that sells one product via Stripe Checkout. Currently a minimal "hello world" demo, but the intended direction (see `docs/requirements.html`) is a larger platform: customers pay a contractor to message a specified person on Instagram and deliver screenshots of the exchange back to the customer.

# Current state (implemented)

- `index.html` — single page: heading, product line ($10 USD), a "Buy now" button, and a "Legal Disclaimer" link (bottom-right) that opens a modal with generic boilerplate disclaimer text.
- `api/create-checkout-session.js` — Vercel serverless function that creates a one-off Stripe Checkout session (fixed price, no accounts, no order records yet).
- `.env.example` — documents `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`; real values go in Vercel project env vars (production) or `.env.local` (local `vercel dev`).
- `docs/requirements.html` — draft software requirements spec for the full platform (accounts/auth, per-order payments, contractor fulfillment workflow, private screenshot storage, data model). Nothing in it is built yet; treat it as the plan, not the current state.

# Not yet built

Everything past the single Stripe Checkout button: user accounts, login/password reset, per-order payment records, the contractor assignment/fulfillment workflow, and private per-customer screenshot storage. See `docs/requirements.html` for the itemized list (requirement IDs like `ACC-01`, `SEC-02`, etc., each tagged Must/Should/Could).

# Open risk to flag before building the outreach feature

Instagram's platform policy restricts automated/paid outreach messaging through third-party accounts. Before building the contractor-messaging workflow for real, get a legal read on this — it affects whether contractors use their own accounts or customer-provided accounts, and what the Terms of Service needs to disclaim.

# Deployment

Built for Vercel. Every branch and PR gets its own auto-built preview URL (pattern: `project-git-<branch-name>-<user>.vercel.app`) independent of GitHub merge/approval state — production only updates once a PR is merged into `main`.

# Git workflow

- Each Claude Code session works on one dedicated branch (auto-named from the session's opening task) and opens a PR into `main`. Never push to `main` directly without explicit permission.
- If a branch's PR has already been merged and there's follow-up work, that follow-up needs a *new* PR — a merged PR can't be reopened or reused.
