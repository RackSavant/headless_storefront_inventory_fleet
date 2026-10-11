# Rack & Sole: 3D store + outfit recommender

A consumer shopping app for an inventory holder. Shoppers walk a 3D store, try pieces on a mannequin, and mix and match. The core is the recommender: pick anything and it builds complete outfits around it, using **your stock first** and filling the gaps with **items you don't sell** from a partner or pre-scraped catalog. In-store pieces become **discounted bundles** that move slow stock.

If you only sell shoes, a shopper who picks your Chelsea boots gets slim jeans, a knit, and a jacket from partners. Your own crossbody bag and belt are bundled at 20% off because they've been on the shelf 160 days.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 30 engine + importer tests
```

No keys or database needed. Pages:

- `/` is the store: floor plan, sections, fitting room, bag
- `/owner` is the owner dashboard: slow movers, bundle sales, "stock this next"

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
- Try-on is a 3D mannequin with procedural garments. The Gemini photo try-on in racksavant-android could consume each look's items (they carry `image_url` once imported from a real feed).
- No auth: shopper ids are anonymous browser ids, and `/owner` is open. Put the owner dashboard behind a login before deploying.
- Embedding similarity (Voyage via Atlas Vector Search, as planned in Mongostylingsystem) would help with large scraped catalogs. `pairScore` is the place to blend it in.
