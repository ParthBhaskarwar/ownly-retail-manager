# Ownly – AI Retail Manager
### Frontend — Week 0 + Week 1 Foundation

> Modular, scalable retail-management PWA. Mobile-first, role-guarded, configurable across retail types.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18.x |
| npm | 9.x |

---

## Getting Started

```bash
# 1. Install dependencies
cd Frontend
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local as needed (defaults work for local dev — no backend required)

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Build production bundle |
| `npm start` | Serve production build |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |

---

## Folder Structure

```
Frontend/
├── __mocks__/            # Jest CSS mock
├── __tests__/            # Unit tests
│   ├── permissions.test.ts
│   └── retail-template.test.ts
├── app/                  # Next.js App Router pages
│   ├── (auth)/           # Auth route group (no app shell)
│   │   ├── login/
│   │   ├── signup/
│   │   └── verify/
│   ├── (app)/            # Protected route group (with sidebar)
│   │   ├── dashboard/
│   │   └── staff/
│   └── onboarding/       # Onboarding flow (no auth shell)
├── public/
│   ├── manifest.json     # PWA manifest
│   ├── sw.js             # Service Worker
│   └── icons/            # PWA app icons
└── src/
    ├── adapters/          # Storage adapter implementations
    │   ├── index.ts       # ⭐ Adapter registry — swap implementations here
    │   └── local/         # localStorage-based stub adapters
    ├── config/
    │   ├── env.ts         # ⭐ All env reads centralized here
    │   ├── permissions.ts # ⭐ Role-permission matrix
    │   └── retail-templates.ts  # ⭐ Retail type config
    ├── context/           # React Contexts
    │   ├── AuthContext.tsx
    │   └── StoreContext.tsx
    ├── modules/           # Domain modules (each has types, services, repository, components)
    │   ├── account/       # User, Session, Auth
    │   ├── retail-template/
    │   ├── staff/         # Staff, RolePermission
    │   └── store/         # Store, Onboarding
    ├── shared/            # Shared utilities, components, hooks
    │   ├── audit/         # AuditService stub
    │   ├── components/    # Button, FormField, Badge, Modal, Toast, PermissionGuard
    │   ├── hooks/         # useAuth, usePermission, useToast
    │   └── validation/    # Centralized validators
    ├── shell/             # App shell (Sidebar, Header, useNavigation)
    └── styles/            # Global CSS and design tokens
```

---

## Architecture Rules

### UI → Service → Repository → Adapter

**Never access storage directly from a component.** Every data access follows this chain:

```
Component → useXxx hook → XxxService → IXxxRepository → LocalXxxAdapter
                                                          ↑
                                             Swap this for ApiXxxAdapter
                                             when backend is ready
```

### Adding a New Retail Type

1. Open [`src/modules/retail-template/types.ts`](./src/modules/retail-template/types.ts)
2. Add the new value to the `RetailType` enum
3. Open [`src/config/retail-templates.ts`](./src/config/retail-templates.ts)
4. Add a new entry to `RETAIL_TEMPLATES` with `enabled: false` (or `true` when ready)
5. Done — no component changes needed

### Adding a New Permission

1. Open [`src/config/permissions.ts`](./src/config/permissions.ts)
2. Add the new key to the `PermissionKey` type
3. Set `true`/`false` for each role in `PERMISSION_MATRIX`
4. Done — `usePermission('new:key')` works everywhere automatically

### Swapping from Local Storage to API

1. Create `src/adapters/api/ApiUserAdapter.ts` implementing `IUserRepository`
2. Open [`src/adapters/index.ts`](./src/adapters/index.ts)
3. Replace `new LocalUserAdapter()` with `new ApiUserAdapter()`
4. Done — no service or component changes needed

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_APP_NAME` | No | `Ownly` | App display name |
| `NEXT_PUBLIC_API_BASE_URL` | No | `""` | Backend API URL (empty = use local adapters) |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | No | `10000` | API request timeout |
| `NEXT_PUBLIC_SESSION_DURATION_MS` | No | `604800000` | Session lifetime (7 days) |
| `BCRYPT_ROUNDS` | No | `10` | Password hashing rounds |
| `NEXT_PUBLIC_PWA_ENABLED` | No | `true` | Enable PWA service worker |
| `NEXT_PUBLIC_DEBUG_MODE` | No | `false` | Enable debug logging |

> ⚠️ Never commit `.env.local` to version control. Use `.env.example` as the template.

---

## PWA / Installability

The app is configured as an installable PWA:
- **manifest.json** — name, icons, theme color, display: standalone
- **sw.js** — service worker with cache-first static + network-first API strategy
- **Viewport meta** — `width=device-width, initial-scale=1`

To install on mobile: open in Chrome/Safari → Share → "Add to Home Screen".

---

## Testing

```bash
npm test                  # Run all tests
npm run test:coverage     # With coverage report
```

### Test files

| File | What it covers |
|------|---------------|
| `__tests__/permissions.test.ts` | All 6 roles × permission keys, edge cases |
| `__tests__/retail-template.test.ts` | Enabled/disabled retail type resolution |

---

## Roles & Permissions Quick Reference

| Permission | OWNER | MANAGER | CASHIER | INVENTORY | ACCOUNTANT | VIEWER |
|------------|:-----:|:-------:|:-------:|:---------:|:----------:|:------:|
| dashboard:view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| store:edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| staff:create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| inventory:edit | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| billing:create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| reports:view | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| audit:view | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| settings:edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

Full matrix in [`src/config/permissions.ts`](./src/config/permissions.ts).

---

## Week-by-Week Build Plan

| Week | Scope |
|------|-------|
| ✅ Week 0 | Project shell, config, design system, PWA |
| ✅ Week 1 | Auth, onboarding, retail-type selection, store setup, staff/roles |
| Week 2 | Product catalog & inventory management |
| Week 3 | Billing, invoicing, barcode scanning |
| Week 4 | Reports & analytics |
| Week 5 | AI features (demand forecasting, smart reorder) |
| Week 6 | Production hardening, real API adapter, deployment |
