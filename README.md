# Ownly — AI Retail Manager

A full-stack offline-first retail management PWA for small clothing stores.

## Project Structure

```
Project/
├── Frontend/    — Next.js 14 PWA (offline-first, IndexedDB via Dexie)
└── Backend/     — Express + PostgreSQL REST API
```

## Quick Start

### Frontend
```bash
cd Frontend
npm install
npm run dev
# → http://localhost:3000
```

### Backend
```bash
cd Backend
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL (Neon), JWT_SECRET
npm run db:migrate
npm run dev
# → http://localhost:4000
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Dexie (IndexedDB) |
| Backend | Express 5, TypeScript, Knex, PostgreSQL (Neon) |
| Auth | JWT + bcryptjs |
| Validation | Zod |

## Documentation & Guides (D14–D16)

- 📖 **[End-User Manual](docs/USER_MANUAL.md)** — Step-by-step cashier and floor staff workflow guide for POS checkout, barcode scanning, returns, exchanges, and stock receiving.
- 🛠️ **[Administrator & Operations Guide](docs/ADMIN_GUIDE.md)** — Store owner and general manager manual for onboarding, RBAC permission matrices, AI restocking, backups, storage health diagnostics, and audit trail investigations.
- 🧪 **[Test Plan](TEST_PLAN.md)** & **[Test Results](TEST_RESULTS.md)** — Comprehensive unit & integration testing specifications, verification suites, and coverage reports (D15).
- 📋 **[Defect Log](DEFECT_LOG.md)** — Active and resolved defect register tracking resolutions for DEF-001 through DEF-009.

## Week Progress

- ✅ Week 0–1: PWA shell, auth, onboarding, staff & roles
- ✅ Week 2–3: Product catalog, unique barcodes, inventory lifecycle (PostgreSQL)
- ✅ Week 4: Billing / POS, invoices, returns & exchanges
- ✅ Week 5: Manual restock, dashboard, reports, backup
- ✅ Week 6: Photo AI (CLIP embeddings, pgvector similarity), product performance
- ✅ Week 7: Offline AI scoring, AI-assisted restocking, prediction history & evaluation — see [docs/week-7-ai-scoring.md](docs/week-7-ai-scoring.md)
- ✅ Week 8: Storage Health, Audit Logs, Defect Hardening & Production User Documentation (D14, D15, D16)
