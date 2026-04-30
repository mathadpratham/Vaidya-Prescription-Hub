# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## VaidyaOS — Doctor Dashboard

Mobile-friendly voice-to-prescription web app for Indian doctors.

### Pages (wouter routing)
- `/` → `DoctorHome` — greeting card, today's patients list, FAB to add
- `/patients/new` → `AddPatient` — registration form + QR
- `/patients/:id` → `PatientDetail` — patient info + clinical notes history
- `/patients/:id/voice` → `VoiceRecord` — Sarvam mic capture + Gemini auto-extract + save note

### Backend
- DB tables in `lib/db/src/schema/patients.ts`: `patients`, `clinical_notes`
- Routes in `artifacts/api-server/src/routes/`:
  - `patients.ts` — `GET/POST /api/patients`, `GET /api/patients/:id`, `POST /api/patients/:id/notes`
  - `parseClinical.ts` — `POST /api/parse-clinical` (Gemini-extracted vitals/dx/rx/followup/admit)
  - `parsePrescription.ts` — `POST /api/parse-prescription` (Gemini medicine list, legacy)
  - `sarvam.ts` — `POST /api/sarvam/transcribe` (multer + Sarvam saarika:v2.5)

### Theme
Teal `#0B9E7A` (mockup-derived). All routes mounted via `app.use("/api", router)` — internal route paths must NOT include `/api/` prefix.

### Secrets
- `SARVAM_API_KEY` — Sarvam STT
- `AI_INTEGRATIONS_GEMINI_BASE_URL` / `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini via Replit AI Integrations

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
