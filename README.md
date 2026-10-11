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

## Week Progress

- ✅ Week 0–1: PWA shell, auth, onboarding, staff & roles
- ✅ Week 2–3: Product catalog, unique barcodes, inventory lifecycle (PostgreSQL)
- ✅ Week 4: Billing / POS, invoices, returns & exchanges
- ✅ Week 5: Manual restock, dashboard, reports, backup
- ✅ Week 6: Photo AI (CLIP embeddings, pgvector similarity), product performance
- ✅ Week 7: Offline AI scoring, AI-assisted restocking, prediction history & evaluation — see [docs/week-7-ai-scoring.md](docs/week-7-ai-scoring.md)
