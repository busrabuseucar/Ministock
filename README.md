# MiniStock

**A small inventory system with a TypeScript API, an append-only stock ledger, and a React interface.**

MiniStock is a learning-focused MVP: add products, record incoming or outgoing stock, see low-stock warnings, inspect the movement history and export a filtered inventory CSV. Every stock change is validated on the server and stored in SQLite-compatible Cloudflare D1. It is not a browser-only simulation.

[![MiniStock checks](https://github.com/busrabuseucar/Ministock/actions/workflows/ci.yml/badge.svg)](https://github.com/busrabuseucar/Ministock/actions/workflows/ci.yml)

[Live demo](https://ministock-buse.sleek-brush-8818.chatgpt.site) · [Türkçe öğrenme deneyi](docs/LEARNING.md)

The hosted demo is public and can be opened by anyone with the link. Each browser starts with its own fictional workshop inventory and a separate demo workspace. The repository contains the full source for local use or your own deployment.

## Stack

- TypeScript, React and the Next.js-compatible Vinext App Router.
- Cloudflare Worker REST API and D1/SQLite persistence.
- Drizzle schema and checked-in SQL migrations; prepared statements for runtime queries.
- Zod request validation, Radix/Shadcn accessible controls, Tailwind and custom CSS.
- Node's test runner with a real SQLite adapter, plus compiled-Worker tests.

## Run locally

Use Node.js **24**, Python 3 and a Bash environment. Windows users can use WSL. No external account or API key is needed for the local demo.

```bash
git clone https://github.com/busrabuseucar/Ministock.git
cd Ministock
npm ci
npm run db:local
npm run source
npm run dev
```

Open the local address printed by Vite. The first visit creates a server-backed demo workspace and seeds eight fictional products. Subsequent visits with the same cookie resume it. Run `npm run db:local` after adding a schema migration; it records and skips already-applied local migrations. Local data lives in ignored `.wrangler/state/v3/d1/`.

If checking out source without a hosting manifest, copy `.openai/hosting.example.json` to `.openai/hosting.json` before starting. The downloadable ZIP already includes a sanitized manifest with the `DB` binding and no project identity.

## MVP behavior

- Products have a normalized, workspace-unique SKU, name, category, initial quantity and low-stock threshold.
- Quantities are whole inventory units. A named set or pack counts as one unit; fractional units and mixed-unit conversions are unsupported.
- Every positive opening quantity creates an opening ledger entry. Zero does not create a zero-valued movement.
- Stock is calculated from the sum of immutable movement deltas. There is no separate editable stock counter to drift out of sync.
- Incoming and outgoing quantities must be integers from 1 to 999,999. Balances stay between 0 and 999,999.
- **Low stock means balance ≤ threshold.** Zero is also low, and receives a separate “Tükendi” label.
- The API checks stock and appends the movement in **one conditional SQL write**. Two competing withdrawals cannot both spend the same last units.
- A request UUID makes a retry idempotent. The same UUID and payload return the existing result; a changed payload is rejected. The UI keeps the same UUID when retrying an unchanged form after a timeout.
- New product + opening movement are one D1 batch transaction: both succeed, or both roll back.
- Products and their history are filtered together. CSV export includes the currently visible products and protects spreadsheet formula-like cells.
- Refresh reads current server state. No automatic polling or real-time collaboration is claimed.

## Example inventory

| Metric | Initial value |
|---|---:|
| Products | 8 |
| Total inventory units | 181 |
| Low-stock products, including empty | 3 |
| Empty products | 1 |
| Opening ledger entries | 7 |

For **ESP32 geliştirme kartı / ELE-001**, the initial stock is 24 and the threshold is 10. Record an outgoing quantity of 14: stock becomes 10 and receives a low-stock warning. An attempted outgoing quantity of 11 is rejected. Record 5 incoming units: stock becomes 15.

## API

All JSON responses use `Cache-Control: no-store, private`. Mutations require JSON and `X-MiniStock-Request: 1`. Browser origins are checked; requests carry an HttpOnly SameSite=Strict cookie, with Secure enabled over HTTPS.

| Method / path | Purpose |
|---|---|
| `POST /api/workspace` | Start or resume the browser's demo workspace; body `{}` |
| `GET /api/inventory` | Transactionally consistent product balances and movement history |
| `POST /api/products` | Create a product and its opening movement |
| `POST /api/movements` | Record an incoming/outgoing movement |

Example movement body:

```json
{
  "requestId": "92b5b385-412e-4eb0-8c3f-4a4daef7b8e0",
  "productId": "replace-with-an-existing-product-uuid",
  "direction": "out",
  "quantity": 3,
  "reason": "Robot prototipi için kullanıldı"
}
```

Reuse `requestId` only to retry the same operation. A new legitimate movement must use a new UUID. The example `productId` is descriptive and must be replaced with a real UUID from the inventory response.

Validation errors return 400, missing sessions 401, rejected write origins 403, a foreign or missing product 404, business-rule conflicts 409, oversized payloads 413, non-JSON writes 415, and storage failures 503. JSON bodies are limited to 8 KiB.

## Data model and isolation

`workspaces → products → movements`. Unique indexes cover `(workspace, SKU)` and request UUIDs. A composite foreign key prevents a ledger entry from referring to another workspace's product. Indexed `(workspace, product)` queries support balance calculations.

Each browser receives a random 256-bit session token; only its SHA-256 digest is stored as the workspace key. Every data query is scoped using that server-resolved key, never an arbitrary client-supplied workspace ID. This is anonymous demo isolation, **not account authentication**. Cookies expire after 30 days; clearing cookies or changing browsers loses access to that workspace. Data is not automatically deleted when the cookie expires. No recovery, team sharing or account ownership workflow is implemented.

For bounded demo use, each workspace supports at most 100 products and 1,000 movements. There is no global anti-abuse quota or production rate limiter. This MVP should not be used to hold real business inventory. Before business use, add authenticated accounts, authorization, recovery/deletion/retention policies, abuse controls, backups and operational monitoring.

## Tests

```bash
npm run check
npm test
npm run source
npm run build
npm run test:build
```

API tests exercise the real request handler and checked-in schema against SQLite; they do not replace SQL outcomes with hard-coded mocks. They cover balances, negative-stock prevention, overlapping requests, retries, SKU uniqueness, transactions, invalid input, session isolation, cookie resumption, CSRF checks, payload limits and CSV escaping. Built-Worker tests check rendering and API dispatch. They are not a browser automation or production load test.

GitHub Actions is configured to run these commands on push and pull requests. A local pass does not establish a GitHub Actions pass; inspect the actual run after uploading the repository.

## Source and hosting

- `components/inventory.tsx`: working interface, forms, filters and history.
- `lib/ministock/api.ts`: HTTP boundary, session isolation and request validation.
- `lib/ministock/store.ts`: prepared SQL, atomic writes, ledger queries.
- `lib/ministock/domain.ts`: validation, limits, sample data and stock status.
- `db/schema.ts`, `drizzle/`: schema and migrations.
- `worker/index.ts`: API dispatch and Vinext application handler.
- `tests/`: behavior and built-Worker checks.
- `docs/LEARNING.md`: a concrete hands-on learning exercise.

The app requires a Worker and D1 binding. **GitHub Pages alone cannot run this backend.** The Sites manifest declares `d1: "DB"`; the host provisions the actual database and applies migrations before publishing. Local migrations are applied by the dedicated development script, never by production request handlers.

`npm run source` creates `public/ministock-source.zip`. It omits credentials, database files, ignored build state and the Site identity. Run it before a build to include the download in the demo. Deploy the exact validated source using your host's normal workflow.

Technical references: [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/). These are implementation references, not copied project demos.

## Attribution and scope

Prepared for Büşra Buse Uçar with AI-assisted implementation, on the supplied Sites/Vinext starter. The inventory API, business rules, interface composition and tests were authored for this project. Understand and extend the code before claiming personal mastery. This is an MVP, not an ERP or accounting application: no purchases/sales accounting, prices, barcode scanning, multiple warehouses, real-time sync, product deletion or movement editing.

MIT licensed for original project code; dependencies and bundled UI components retain their own licenses.
