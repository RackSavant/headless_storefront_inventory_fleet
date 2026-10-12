# Rack & Sole: 3D store + self-improving outfit recommender

A consumer shopping app for an inventory holder. Shoppers walk a 3D store, try pieces on a mannequin, and mix and match. The core is the recommender: pick anything and it builds complete outfits around it, using **your stock first** and filling the gaps with **items you don't sell** from a partner or pre-scraped catalog. In-store pieces become **discounted bundles** that move slow stock.

If you only sell shoes, a shopper who picks your Chelsea boots gets slim jeans, a knit, and a jacket from partners. Your own crossbody bag and belt are bundled at 20% off because they've been on the shelf 160 days.

## Self-improving stylist (the harness)

`/harness` shows an agent that rewrites how the store works, then has to prove each change on simulated shoppers before it goes live.

- **What it can change (the policy):**
  - stylist rules, scoring weights, and per-segment overrides for occasions, gender, and budget
  - discounts and the slow-mover push
  - store features (partner catalog, bundles)
  - its own harness: what context it sees, how much memory it keeps, which tools it may call
- **How a change ships:**
  1. Guardrail check.
  2. It must beat the current policy on 120 training shoppers.
  3. It must also beat it on 120 held-out shoppers, without lowering satisfaction or margin.
  4. It goes live (new version), or waits for your approval if it changes what the store offers.
- **Self-changes** (its context, memory, tools) go on a 5-generation trial and are reverted automatically unless its proposals get accepted more often.
- **Guardrails:** locked ones (margin floor, max discount, rule caps, satisfaction floor) can only be tightened, never loosened.
- **Simulator** (`lib/harness/simulator.ts`): shoppers with occasions, budgets and private taste respond to a hidden ground truth that differs from the hand-written rules, so the agent only improves by learning what shoppers actually respond to.
- **Proposers:** an offline heuristic (mines failures, dry-runs ideas once it grants itself the `what_if` tool), or Claude. Claude authenticates with, in order: `ANTHROPIC_API_KEY`, an `ant auth login` OAuth profile, or, with no API credentials at all, this machine's signed-in Claude Code (`claude -p`). Through Claude Code, it proposes up to 3 candidates and the harness dry-runs them if `what_if` is granted. Those calls count toward that Claude account's usage.

```bash
npm run harness:evolve -- 20 --reset   # 20 generations from the seed policy
npm run harness:evolve -- 3 --claude   # let Claude propose (API key, ant OAuth profile, or your Claude Code login)
```

A typical 30-generation offline run moves the held-out score from 85.0 to about 94 (+10%): profit per shopper goes from $58 to about $65, and satisfaction rises 3 points. The live store (`/api/looks`) always runs the active policy, adapted to the shopper's segment.

## 3D models, product images, try-on

- **3D products** (`components/store3d/meshes.ts`):
  - Shoes have a footprint-shaped sole that bends over the heel, a sculpted upper with a real foot opening and heel counter, and heels, shafts, laces, straps and gussets per style.
  - Garments are cut from sewing-pattern silhouettes, with collars, lapels, plackets, pockets and stitching.
  - Materials use procedural leather grain, suede, denim twill, knit rib and canvas weave.
  - The Nude Crisscross Stiletto uses the real scanned model from the spatialintelligence repo (FBX + texture in `public/models/`). Any product with a `model_url` (GLB or FBX) uses its file.
- **Product images:** every product has one. It's the real photo when the product has an `image_url`, otherwise a studio render of its 3D model. `/catalog` shows them all, with PNG download and transparent cut-outs.
- **Real photos for the sample catalog:** every item has a real photograph, openly licensed (CC0, public domain, CC BY or CC BY-SA), from [Openverse](https://openverse.org) and [Wikimedia Commons](https://commons.wikimedia.org). The sample partner catalog was rebuilt around the photos: each item's color and title come from what is actually in its photo, and item types with no usable photo were dropped. Each one was checked by eye: right item type and color, no people, no other brands' logos. The photographer and license are shown under each photo, as the licenses require. They are *representative* photos of each item type, not of these exact sample SKUs; for your real stock, use your own photos.
  - `npm run photos:fetch` searches and downloads, with `--redo <id>` to retry an item.
  - `npm run photos:candidates -- "<search>"` lists options to choose from.
  - Pin a choice, or `"none"` to keep the 3D render, in `data/photo-overrides.json`.
- **Try it on you:** "On me" on any item or look, or "See this outfit on you" in the fitting room.
  - Upload or take a photo, or use a model.
  - MediaPipe pose detection (in the browser) finds shoulders, hips, ankles and hands, and each garment cut-out is placed by its real size in meters. You can drag the body points if detection is off.
  - The photo never leaves the browser, unless you choose **Make it photoreal**. That sends it to Google's Gemini image model, needs `GEMINI_API_KEY`, and uses the same API as the spatialintelligence repo.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 30 engine + importer tests
```

No keys or database needed. Pages:

- `/` is the store: floor plan, sections, fitting room, photo try-on, bag
- `/owner` is the owner dashboard: slow movers, bundle sales, "stock this next"
- `/harness` is the self-improving stylist: evolution log, approvals, versions and rollback
- `/catalog` lists product images and cut-outs

## How the store works

1. **Floor plan (top view).** Sections are generated from your inventory: every category you stock gets one (Shoe Wall, Bags, Accessories, or Tops, Dresses, and so on). Categories you don't stock become **Partner Picks** sections. Click a section to fly into it.
2. **Inside a section.** Click any item on the shelf or rack, or in the list. The panel shows the item plus **Complete the look**: three full outfits and in-store bundle offers.
3. **Fitting room / mix & match.** "Try this look" dresses the mannequin. Arrows on each slot cycle through pieces ranked by how well they go with the rest, with a live outfit-match score and clash warnings.
4. **Taste memory.** Like or "Not for me" with a reason ("too formal", "not a fan of red"). The reason becomes a lasting preference, so later looks change.
5. **Occasion box.** "summer wedding under $400" sets formality, season, styles and budget.

## The recommender (`lib/reco/`)

| File | What it does |
|---|---|
| `compat.ts` | Scores any two items 0..1: color harmony (fashion neutrals, complementary, tonal, clashes), style affinity (minimal+classic, streetwear+athleisure...), formality distance, season overlap, and stylist pairing rules (chelsea boots + slim jeans, no socks with stilettos...) |
| `outfit.ts` | Beam search over outfit templates (top+bottom+shoes or dress+shoes, plus optional jacket, bag, accessory). Ranks by pairwise compatibility, occasion fit, personal taste, budget and merchandising boost, then picks 3 diverse looks |
| `merch.ts` | Stock pressure (days on shelf, units on hand) boosts slow movers. Bundle pricing by tier, plus an extra slow-mover discount, and never below cost + margin floor |
| `profile.ts` | Taste profile learned from likes and dislikes, including free-text reasons |

Business rules live in `data/store-config.json`:

- `protect_inventory_roles` + `protect_min_items`: in categories where you carry at least N items, shoppers are never sent to another retailer. In thinner categories your items compete with partner items on fit, carrying the inventory boost.
- `bundle_discounts`, `slow_mover_days`, `slow_mover_extra_pct`, `min_margin_pct`, `inventory_boost`.

`npm run reco:demo [product-id ...]` prints looks and bundles in the terminal.

## Your data

### Your inventory

```bash
npm run inventory:import -- my-stock.csv
```

Only `title`, `price` and `quantity` are required. `category`, `color`, `cost`, `received_at`, `sizes`, `gender`, `styles`, `formality`, `seasons` and `model_url` are used when present. Anything missing is inferred from the title by `lib/tagging.ts`. Add `cost` and `received_at` to enable margin floors and slow-mover pushes.

### Things you don't sell (the external catalog)

Three ways to fill `data/external-catalog.json`:

```bash
# 1. Partner Shopify stores (public /products.json feed). Use stores you have an affiliate/partner deal with.
npm run catalog:shopify -- partner-store.com --retailer "Partner Co"

# 2. Pre-scraped / open datasets: defaults match Kaggle's H&M articles.csv; --*-col flags map any feed
npm run catalog:csv -- articles.csv --limit-per-type 4
npm run catalog:csv -- feed.csv --title-col name --type-col category --color-col colour --price-col price --url-col link

# 3. The bundled generic sample (no real brands; links go to a shopping search)
npm run catalog:sample
```

Imports merge by id. Pass `--replace` to start over. Partner clicks are logged, so you can swap the links for affiliate URLs.

## Firebase inventory and Tripo 3D assets

- **Inventory from Firestore:** set `INVENTORY_SOURCE=firestore` plus `FIREBASE_*` (see `.env.example`). `lib/inventory-source.ts` pulls the collection into an in-memory snapshot (refreshed every `INVENTORY_REFRESH_SECONDS`), validates each doc with the same zod schema as the JSON files, skips invalid docs (listed in `/api/catalog` under `inventory_source`), and keeps the last good snapshot or `data/inventory.json` if Firestore fails. Doc id is used when `id` is missing; Timestamps become ISO strings.
- **Seed it:** `npm run firestore:seed -- [--dry-run] [--owner <id>]` copies `data/inventory.json` into Firestore.
- **Shopper profiles and events:** `STORE_BACKEND=firestore` stores them in `store_profiles` / `store_events` instead of Mongo or `./.data`.
- **Photo to 3D:** `npm run tripo:generate -- <product-id> [--image file]` uploads the photo to Tripo, polls the task, saves `public/models/<id>.glb` and sets `model_url` on the product (JSON file and, with Firestore on, the doc). Written against the documented Tripo v2 OpenAPI and tested with a mocked client only; it has not been run with a live key yet.

## Optional upgrades (env vars, see `.env.example`)

- **World Labs world as the store.** Set `NEXT_PUBLIC_STORE_WORLD_SPZ=/worlds/your-store.spz` (put the file in `public/worlds/`) to render a Marble scan of your real shop behind the fixtures, using Spark like the spatialintelligence repo. Set `NEXT_PUBLIC_STORE_WORLD_SCALE` / `NEXT_PUBLIC_STORE_WORLD_GROUND` from the world's `semantics_metadata`.
- **Real 3D products.** Give any product a `model_url` (GLB). It replaces the procedural model on the shelf.
- **Claude.** Set `ANTHROPIC_API_KEY` to parse free-text occasions and rewrite look descriptions (`lib/llm.ts`, `claude-opus-5-5`, structured outputs). Recommendations themselves stay deterministic, and everything falls back to the offline parser.
- **MongoDB Atlas.** Set `MONGODB_URI` to store shopper profiles and events in Atlas instead of `./.data` (`lib/store.ts`). This is the same Atlas setup as Mongostylingsystem.

## Layout

```
app/                  Next.js pages + API routes (looks, feedback, events, catalog, insights)
components/StoreApp   shopper UI: panels, bag, occasion, feedback
components/store3d/   R3F scene: floor plan, fixtures, procedural products, mannequin, splat backdrop
components/ui/        look cards, mix & match, product swatches
lib/reco/             the recommendation engine
lib/tagging.ts        raw product text -> role/subtype/color/style/formality/season
lib/importing.ts      shared importer core
data/                 inventory.json, external-catalog.json, store-config.json
scripts/              importers, sample generator, reco demo
tests/                engine + importer tests
```

## Not done yet

- Checkout is a demo (logs an order, takes no payment). Wire up Shopify / Stripe for real orders and stock decrements.
- Photo try-on is a 2D overlay (garments don't wrap around arms or follow folds). For a lifelike result use the Gemini option, or swap in a dedicated try-on model.
- Procedural models are stand-ins. Real product photos (`image_url`) and scans (`model_url`) always win when present.
- The harness simulator is only as good as its shopper model. Calibrate it against real conversion data (the `/owner` event log) before trusting its gains.
- No auth: shopper ids are anonymous browser ids, and `/owner` is open. Put the owner dashboard behind a login before deploying.
- Embedding similarity (Voyage via Atlas Vector Search, as planned in Mongostylingsystem) would help with large scraped catalogs. `pairScore` is the place to blend it in.
