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

- ✅ Week 0: PWA shell, auth, onboarding
- ✅ Week 1: Staff & roles, permissions
- 🔄 Week 2: Product catalog & inventory (in progress)
- ⏳ Week 3: Billing / POS
- ⏳ Week 4: Reports & analytics
- ⏳ Week 5: Product images
- ⏳ Week 6: Backend API (replace local adapters)
