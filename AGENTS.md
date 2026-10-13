<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local development and data

- Verify with `npm test`, `npm run typecheck`, and `npm run build`. Use Node 22+ to satisfy the installed camera-controls engine requirement.
- `npm run dev -- --hostname 127.0.0.1 --port 3000` starts a local-only preview. Owner and harness routes are not authenticated; do not expose this server publicly.
- `npm run inventory:firebase -- <service-account-path>` performs a read-only inventory audit. Add `--write` to create `.data/firebase-inventory.json`; existing snapshots are never overwritten. Credentials stay outside the repository and are never printed or included in the snapshot.
- Outside tests, the catalog prefers the local Firebase snapshot when present. Vitest uses the bundled catalog for deterministic fixtures. The local snapshot is not a live inventory sync and is not committed.
- Firebase listing prices stay in USDC. Do not combine USD and USDC amounts, label USDC as dollars, or assume an exchange rate. USD budget scoring excludes mixed-currency and USDC looks.
- Product photos feed AI try-on only after shopper action. Licensed sample photos are representative references, not verified SKU images. Procedural rack models and 2D overlays are approximations, not physical fit predictions.
- Firebase imports do not infer stock-received dates from listing creation dates and do not invent costs. Unsupported or non-fashion listings are reported rather than converted into arbitrary garments.
