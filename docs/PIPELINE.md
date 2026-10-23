# CI/CD Pipeline and Development Setup Guide

What runs in CI, how to run the same checks locally, and what is (and isn't)
automated around deployment.

_Last verified against `.github/workflows/`: 2026-10-20. An earlier version of
this page described a "Next.js CI/CD Pipeline" workflow with Cypress, Snyk,
TruffleHog, Lighthouse, OWASP ZAP and environment-specific Vercel deploys.
None of those exist in this repository. If you add a workflow, add it to the
table below._

This repo is a Yarn 4 workspaces monorepo (`apps/frontend`, `apps/backend`,
plus the Rust `contracts/` workspace). Use `yarn`, not `npm`. For where each
workspace gets deployed, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `frontend-ci.yml` | PRs touching `apps/frontend/**` or root Yarn files | Wiring-TODO lint (each `// TODO: Replace with actual API call` must reference an issue), lint, typecheck, test, build, bundle-size budget |
| `frontend-ci.yml` → `secret-scan` | Every PR | gitleaks over the PR's commits (see [`SECRET_SCANNING.md`](./SECRET_SCANNING.md)) |
| `backend-ci.yml` | PRs touching `apps/backend/**` or root Yarn files | Against a PostGIS service container: apply migrations, roll every migration back and check the schema is back where it started, re-apply, then typecheck, build, test |
| `contracts-ci.yml` | Push/PRs touching `contracts/**` | fmt check, clippy (`-D warnings`), `cargo test`, `cargo build --target wasm32-unknown-unknown --release`; respects committed `Cargo.lock` (see `contracts/README.md`) |
| `security-and-deploy-checks.yml` | Push to `main`, PRs, daily 06:00 UTC, manual | Production-mode backend leaks no stack traces; frontend bundle contains no backend-only secrets; backend Docker image builds and starts |
| `chromatic.yml` | PRs touching frontend components / Storybook / styles | Visual regression via Chromatic |
| `migration-collision-check.yml` | PRs | Comments when another open PR adds a migration with the same sequence number |
| `basename-collision.yml` | PRs | Comments on newly added files whose basename duplicates an existing one (see [`DUPLICATE_BASENAMES.md`](./DUPLICATE_BASENAMES.md)) |
| `backend-uptime.yml` | Every 15 min, manual | Pings `vars.BACKEND_HEALTH_URL` (skips when unset) and triggers escrow-status reconciliation |
| `refund-smoke-test.yml` | Daily 06:00 UTC, manual | Real refund against Trustless Work **testnet** to catch API contract changes |
| `todo-summary.yml` | Mondays 06:00 UTC, manual | Posts a TODO/FIXME summary issue |
| `verify-issue-on-close.yml` | Merged PRs that close issues | Runs the issue's `verify` block and reopens the issue if it fails |

There is no deploy workflow. The frontend deploys through Vercel's Git
integration. The backend has no deploy target configured in this repo.

## Running the checks locally

```bash
# Frontend
yarn workspace @truestub/frontend lint
yarn workspace @truestub/frontend typecheck
yarn workspace @truestub/frontend test

# Backend (needs DATABASE_URL pointing at a PostGIS-enabled Postgres)
yarn workspace @truestub/backend migrate:up
yarn workspace @truestub/backend typecheck
yarn workspace @truestub/backend test

# Contracts
yarn test:contracts

# Formatting (whole repo)
yarn format:check
yarn format
```

## Git hooks

Husky runs two hooks (details in
[`CONTRIBUTORS_GUIDELINE.md`](./CONTRIBUTORS_GUIDELINE.md)):

- `pre-commit`: gitleaks on staged files, and a duplicate migration-number
  check.
- `commit-msg`: commitlint with the rules in [`GIT_GUIDELINE.md`](./GIT_GUIDELINE.md).

## Environment variables

- `.env.example` at the root, plus `apps/backend/.env.example`: templates
  with no real values.
- **GitHub Secrets / Variables**: values CI needs, e.g. Trustless Work
  testnet credentials for the refund smoke test, and `BACKEND_HEALTH_URL`.
- **Vercel**: runtime variables for the frontend.

## Release management

`semantic-release` (`release.config.js`, `yarn release`) derives versions
from conventional commits. The commit types are listed in
[`GIT_GUIDELINE.md`](./GIT_GUIDELINE.md).

## Responding to alerts

- **Backend Uptime failing**: check the backend host and its logs. For
  refund-specific problems, see [`RUNBOOKS.md`](./RUNBOOKS.md).
- **Refund smoke test failing**: Trustless Work's testnet API or contract
  behavior has probably changed. Compare against
  `apps/backend/src/lib/trustless-work.ts`.
- **Frontend**: check the Vercel dashboard. Roll back there if needed.
