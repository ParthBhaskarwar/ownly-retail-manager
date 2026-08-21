# Ownly – Backend

> REST API server for Ownly AI Retail Manager. Connects to the same PostgreSQL database described in the Gate 1 schema.

---

## Prerequisites

| Tool       | Minimum version |
|------------|----------------|
| Node.js    | 20.x            |
| npm        | 10.x            |
| PostgreSQL  | 15.x           |

---

## Getting Started

```bash
# 1. Install dependencies
cd Backend
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, etc.

# 3. Run database migrations
npm run db:migrate

# 4. Seed initial data
npm run db:seed

# 5. Start the dev server
npm run dev
```

Server starts at `http://localhost:4000`

---

## Scripts

| Command              | What it does                          |
|----------------------|---------------------------------------|
| `npm run dev`        | Start dev server with hot-reload      |
| `npm run build`      | Compile TypeScript to dist/           |
| `npm start`          | Run compiled production server        |
| `npm test`           | Run unit + integration tests          |
| `npm run db:migrate` | Run pending database migrations       |
| `npm run db:seed`    | Seed reference data (retail templates)|
| `npm run lint`       | Run ESLint                            |

---

## Folder Structure

```
Backend/
├── src/
│   ├── api/              # Route handlers (controllers)
│   │   ├── auth/         # POST /auth/signup, /auth/login, /auth/verify
│   │   ├── store/        # GET/PUT /store
│   │   ├── staff/        # CRUD /staff
│   │   ├── products/     # CRUD /products, /products/:id/variants
│   │   ├── inventory/    # GET/POST /inventory, barcode lookup
│   │   └── billing/      # CRUD /invoices, /transactions
│   ├── services/         # Business logic (mirrors Frontend modules)
│   ├── repositories/     # Database access (implements Gate 1 schema)
│   ├── db/
│   │   ├── migrations/   # Numbered SQL migration files
│   │   ├── seeds/        # Reference data seeds
│   │   └── client.ts     # PostgreSQL connection pool
│   ├── middleware/        # Auth, permission, validation middleware
│   ├── config/            # Env config, constants
│   └── app.ts             # Express app setup
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Environment Variables

| Variable             | Required | Description                        |
|----------------------|----------|------------------------------------|
| `DATABASE_URL`       | Yes      | PostgreSQL connection string       |
| `JWT_SECRET`         | Yes      | Secret for signing auth tokens     |
| `JWT_EXPIRES_IN`     | No       | Token lifetime (default: `7d`)     |
| `PORT`               | No       | Server port (default: `4000`)      |
| `BCRYPT_ROUNDS`      | No       | Password hash rounds (default: 10) |
| `NODE_ENV`           | No       | `development` / `production`       |

---

## Architecture

```
Request → Middleware (auth + permission) → Route Handler → Service → Repository → PostgreSQL
```

The Repository layer implements the exact same interfaces as the Frontend's adapter layer — swapping from Dexie (local) to PostgreSQL (API) requires only updating `Frontend/src/adapters/index.ts`.

---

## Tech Stack (Planned)

| Layer        | Technology                    |
|--------------|-------------------------------|
| Runtime      | Node.js 20                    |
| Framework    | Express 5                     |
| Language     | TypeScript 5                  |
| Database     | PostgreSQL 15                 |
| Query builder| Knex.js (migration + queries) |
| Auth         | JWT + bcryptjs                |
| Validation   | Zod                           |
| Testing      | Jest + Supertest              |

---

## API Endpoints (Planned — Week 6)

### Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/verify`
- `POST /api/auth/logout`

### Store
- `GET  /api/store`
- `PUT  /api/store`

### Products
- `GET  /api/products?query=&categoryId=&status=&page=`
- `POST /api/products`
- `GET  /api/products/:id`
- `PUT  /api/products/:id`
- `POST /api/products/:id/variants`
- `PUT  /api/products/:id/variants/:variantId`

### Inventory
- `GET  /api/inventory?status=&variantId=&page=`
- `POST /api/inventory/stock` ← Add stock batch
- `GET  /api/inventory/barcode/:barcode` ← Billing hook
- `PUT  /api/inventory/:itemId/status`

### Billing
- `GET  /api/invoices`
- `POST /api/invoices`
- `GET  /api/invoices/:id`

---

> **Status**: Backend scaffolded — active development begins in Week 6 once the Frontend is feature-complete with local adapters.
