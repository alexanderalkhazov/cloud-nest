# Cloud Nest — Progress Tracker

Tracks progress against the day-by-day roadmap in [solution.md](solution.md) (§12).
Legend: `[x]` done · `[ ]` not started · `[~]` partially done.

**Overall: Days 1–4 complete (+ architecture hardening). ~35% of the build. Next up: Day 5 — folder mutations.**

---

## ✅ What's done so far

### Day 1 — Foundation
- [x] Docker Compose: Postgres 17, Redis 7, MinIO (+ one-shot bucket creation), pgAdmin
- [x] Dependencies installed (drizzle, zod, auth, aws-sdk, bullmq, bcryptjs, tsx)
- [x] `.env.local` + Zod-validated `src/lib/env.ts` (fails fast at boot)
- [x] Drizzle wired: `src/db/index.ts` (HMR-safe client), `drizzle.config.ts`
- [x] Project restructured under `src/` with `@/*` alias; production build passes

### Day 2 — Authentication
- [x] `src/lib/auth.ts` — Auth.js v5, Credentials provider, JWT sessions (userId in token)
- [x] `src/app/api/auth/[...nextauth]/route.ts` catch-all
- [x] Register flow: zod → `userService.register` (bcrypt + atomic user/quota transaction) → auto-login
- [x] Login action with generic invalid-credentials error; logout via `signOut`
- [x] `src/proxy.ts` — optimistic route protection both ways (dashboard ↔ auth pages)
- [x] Real `auth()` check in dashboard layout; session email in header
- [x] E2E verified: redirects, good/bad login, session payload, protected routes

### Day 3 — Schema & data
- [x] Full schema migrated: users, folders, files, shares, activity_logs, storage_usage (+ Auth.js tables)
- [x] All constraints/indexes: NULLS NOT DISTINCT sibling names, partial indexes, pg_trgm GIN, text_pattern_ops path index, CHECKs
- [x] Materialized-path helpers `src/db/path.ts` (childPath, pathIds, isDescendantPath)
- [x] Idempotent seed: 2 users, 5-folder tree, 9 files, 1 share, activity rows, true quota counters
- [x] `db:generate` / `db:migrate` / `db:seed` scripts
- [x] Repositories — created just-in-time starting Day 4 (deferral was by design)

### Day 4 — Folder browser (read path)
- [x] `src/repositories/folder.repo.ts` — findById, listChildren, findByIds (breadcrumb ancestors)
- [x] `src/repositories/file.repo.ts` — listByFolder (live, ready only)
- [x] Route decision: kept id-based `dashboard/folder/[folderId]` instead of name catch-all `drive/[[...folderPath]]` (one-query resolution, no name-encoding issues) — deliberate deviation from solution.md
- [x] Folder page as Server Component: resolve folder → access check → render children
- [x] Breadcrumbs from materialized path (single IN query, re-sorted into path order)
- [x] FolderBrowser (async RSC in `<Suspense>`, parallel queries), empty state, skeleton
- [x] Quota widget in sidebar (usage bar, red > 90%)
- [x] Exit check passed: E2E click-through Documents → Reports with correct breadcrumbs; foreign folder id → 404

### Architecture hardening (post-Day 4 refactors)
- [x] Strict layering enforced: features/pages/lib → services → repositories → db (zero repo imports outside services; saved as standing rule)
- [x] Services layer started early: `user`, `folder`, `file`, `quota` services (`getAccessibleFolder`, `getBreadcrumbTrail`, `verifyCredentials`, `register`)
- [x] One-table-per-repo: split user/quota creation; `userService.register` owns the atomic transaction
- [x] Bug fixed: Drizzle 1.0 RC wraps PG errors — unique-violation (23505) detection now walks `error.cause` chain (duplicate email was 500ing)
- [x] `DbOrTx` type so all repo functions accept a transaction handle

---

## 📋 What's left — step-by-step to-do

### Day 5 — Folder mutations
- [ ] Extend `src/services/folder.service.ts` — create (path computation), rename, trash (subtree UPDATE); `NameTakenError` on duplicate sibling
- [ ] `src/services/permission.service.ts` — owner-only version
- [ ] `src/repositories/activity.repo.ts` — log helper
- [ ] `features/folders/actions.ts` + `schemas.ts` (auth → zod → service → revalidatePath)
- [ ] Create/rename dialogs + context menu (client components)
- [ ] Friendly error on duplicate sibling name
- [ ] Exit check: full folder CRUD from the UI

### Day 6 — Upload
- [ ] `src/lib/s3.ts` — SDK client (endpoint switch for MinIO/AWS)
- [ ] Extend `src/services/quota.service.ts` — atomic reserve/release (getUsage exists)
- [ ] `src/services/upload.service.ts` — requestUpload (pending row + presigned PUT), confirmUpload (HeadObject verify → ready)
- [ ] Multipart branch for files > 100 MB
- [ ] UploadButton + UploadDropzone (XHR progress, parallel uploads)
- [ ] Exit check: drag-drop upload → appears in folder; quota updates; over-quota rejected

### Day 7 — Download, preview, file mutations
- [ ] `app/api/files/[id]/download/route.ts` — permission check → 302 to presigned GET
- [ ] PreviewModal (image / video / PDF / text by MIME)
- [ ] File rename + trash actions
- [ ] Exit check: download restores original filename; previews render

### Day 8 — Move + Trash
- [ ] `src/services/move.service.ts` — cycle check, folder_id/parent_id update, descendant path rewrite
- [ ] MoveDialog with folder tree picker
- [ ] Trash page: list, restore, purge (hard delete + quota release + S3 delete job)
- [ ] Exit check: move nested folder (children follow); trash → restore → purge round-trip

### Day 9 — Sharing & permissions
- [ ] Complete `permission.service.ts`: owner → direct share → ancestor-folder share (via path), Redis-cached
- [ ] ShareDialog: share with user (viewer/editor), create/revoke public link
- [ ] "Shared with me" page; public `s/[token]` page (no auth)
- [ ] Enforce editor vs viewer in every mutation
- [ ] Exit check: friend@ sees shared folder; viewer blocked from edits; public link works logged out

### Day 10 — Search + Activity
- [ ] `src/repositories/search.repo.ts` — trigram search across owned + shared
- [ ] Debounced header search, URL-param driven results page
- [ ] Activity feed page (paginated from activity_logs)
- [ ] Exit check: ranked matches; feed shows uploads/renames/shares

### Day 11 — Background jobs + hardening
- [ ] `src/lib/redis.ts` (+ cached() helper) and `src/lib/queue.ts`
- [ ] `src/workers/index.ts` + jobs: thumbnail (sharp → webp), purge-trash (daily), reap-pending (daily)
- [ ] Redis rate limiting on auth + upload
- [ ] `/api/health` route; security headers (CSP, nosniff)
- [ ] Wire login `?from=` redirect param
- [ ] Exit check: image upload → thumbnail appears; jobs visible in worker logs

### Day 12 — Polish + production build
- [ ] error.tsx / not-found.tsx / loading + empty states everywhere; toasts
- [ ] Keyboard-accessible menus; responsive pass
- [ ] Dockerfile (multi-stage, output: standalone)
- [ ] Clean `next build` + lint; README with screenshots
- [ ] Exit check: docker build + run works against compose services

### Day 13 — AWS provisioning (solution.md §13 steps 1–7)
- [ ] Account prep: billing alarms, region, CLI profile
- [ ] IAM roles (web-task, worker-task, execution, ci-deploy)
- [ ] VPC, subnets, NAT, security groups
- [ ] RDS Postgres 17 + secret in Secrets Manager
- [ ] ElastiCache Redis
- [ ] S3 prod bucket (private, TLS-only, CORS, lifecycle)
- [ ] ECR repo + image push; run migrations via one-off ECS task

### Day 14 — Deploy + monitoring (§13 steps 8–11)
- [ ] ECS cluster + web/worker services
- [ ] ALB + ACM cert + HTTPS redirect + health checks
- [ ] CloudFront + DNS; AUTH_URL set to final domain
- [ ] CloudWatch logs + alarms (5xx, unhealthy targets, RDS CPU/storage)
- [ ] Prod E2E smoke: register → upload → share → download
- [ ] Optional: GitHub Actions ci.yml + deploy.yml (OIDC)
