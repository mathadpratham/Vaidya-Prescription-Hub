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

### Auth
- `doctors` DB table, phone + name (no password)
- `POST /api/auth/register` — register or login by phone
- `POST /api/auth/login` — login by phone (upsert)
- `GET /api/auth/me` — returns current doctor from session
- `POST /api/auth/logout` — clears session
- Sessions persisted in Postgres `session` table (connect-pg-simple, no `createTableIfMissing`)
- `AuthContext.tsx` + `AuthPage.tsx` — auth guard; AuthPage shown if not logged in

### Pages (wouter routing)
- `/` → `DoctorHome` — greeting card, today's patients list, FAB (+) → `/record`
- `/record` → `QuickRecord` — **voice-first new consultation**: mic auto-records, Gemini extracts patientPhone/patientName/patientAge + clinical fields, Save = phone-lookup-or-create patient + save note → navigate to patient detail
- `/patients/:id` → `PatientDetail` — patient info + clinical notes history
- `/patients/:id/voice` → `VoiceRecord` — Sarvam mic capture + Gemini auto-extract + save note (for existing patients)

### Backend routes (`artifacts/api-server/src/routes/`)
- `auth.ts` — `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `patients.ts` — `GET/POST /api/patients`, `GET /api/patients/:id`, `PATCH /api/patients/:id`, `POST /api/patients/lookup` (phone lookup/create), `POST /api/patients/:id/notes`
- `parseClinical.ts` — `POST /api/parse-clinical` (Gemini-extracted vitals/dx/rx/followup/admit + patientPhone/patientName/patientAge)
- `sarvam.ts` — `POST /api/sarvam/transcribe` (multer + Sarvam saarika:v2.5)

### DB Tables
- `patients` — id, phone, name, age, gender, department, complaint, tag, bed, color, createdAt
- `clinical_notes` — id, patientId, transcript, doctorName, bp, temp, spo2, diagnosis, diagnoses[], prescription, medications[], followup, admit, createdAt
- `doctors` — id, name, phone, createdAt
- `session` — sid, sess, expire (connect-pg-simple; created manually since esbuild drops table.sql)

### Theme
Teal `#0B9E7A`, bg `#F7F9F8`, border `#E2EAE7`, max-w-md mobile container.
All routes mounted via `app.use("/api", router)` — internal route paths must NOT include `/api/` prefix.

### Secrets
- `SARVAM_API_KEY` — Sarvam STT
- `AI_INTEGRATIONS_GEMINI_BASE_URL` / `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini via Replit AI Integrations
- `SESSION_SECRET` — express-session secret

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
