# AGENTS.md

## Project overview

This repository contains the unofficial "食のみやこ熊本券" store map. It is a
Next.js 16 / React 19 application built with vinext and Vite, then deployed as a
Cloudflare Worker.

## Local workflow

- Use Node.js 22.13 or newer.
- Install dependencies with `npm ci`; `package-lock.json` is the source of truth.
- Start the local server with `npm run dev`.
- Before handing off a change, run `npm run lint` and `npm run build`.
- Do not deploy unless the user explicitly asks. Deployment uses `npm run deploy`
  and requires an authenticated Cloudflare account.

## Code and data conventions

- Keep user-facing copy in Japanese.
- Preserve the prominent disclaimer that this is an unofficial service.
- The link in the top-right corner of the page must always point only to the
  official website homepage (`https://kumamoto-tabeteouen.com/`). Never link it
  directly to a store-list PDF, another PDF, or an individual announcement.
- Store records live in `app/data/stores.json`; keep the existing JSON shape and
  validate map/search behavior after data edits.
- Treat `app/data/stores.json` as the cumulative store history, not as a snapshot
  that should be replaced by the newest official list. When importing a new
  official store list, compare it with the preceding list and retain stores that
  disappeared from the newest list. Update the availability data and logic so
  every disappeared store is classified and displayed as
  `過去の一覧に掲載`; do not silently delete or leave it classified as current.
- After every official-list update, verify both directions of the diff: newly
  listed stores appear as current/upcoming as appropriate, and stores absent
  from the latest list appear under the `過去の一覧に掲載` filter.
- Map UI behavior is primarily implemented in `app/store-map.tsx`.
- Avoid adding secrets to the repository. Put local secrets in ignored `.env*`
  files and document any newly required variable in `.env.example`.
- Keep Cloudflare/Vite state under the existing ignored project-local paths.

## Deployment context

- Production URL: https://shoku-no-miyako-map.makoragi.workers.dev/
- Build output and generated Wrangler config are under `dist/`.
- The production deploy command is `wrangler deploy --config dist/server/wrangler.json`.
