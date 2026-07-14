# Cloud Nest — Engineering Design & Implementation Plan

A production-style Google Drive clone, buildable solo in ~2 weeks.

> **Stack**: Next.js 16 (App Router) · TypeScript · PostgreSQL · Drizzle ORM · Redis · AWS S3 · Docker Compose (local) · ECS Fargate + RDS + ElastiCache + CloudFront (production)

> **⚠️ Next.js 16 notes (this repo pins `next@16.2.10`)** — conventions differ from older tutorials:
> - `middleware.ts` is replaced by **`proxy.ts`** at the project root.
> - Caching uses **Cache Components**: `cacheComponents: true` in `next.config.ts`, the `'use cache'` directive, and `cacheLife()` / `cacheTag()` — not the old `revalidate` segment configs.
> - Mutations use **Server Functions** (`'use server'`); every Server Function must do its own auth check (they are reachable via direct POST).
> - When in doubt, read `node_modules/next/dist/docs/` — it is the source of truth for this version.

---

## Table of Contents

1. [Scope & Non-Goals](#1-scope--non-goals)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Decisions](#3-technology-decisions)
4. [Database Design](#4-database-design)
5. [File Storage Design (S3)](#5-file-storage-design-s3)
6. [Core Flows](#6-core-flows)
7. [Application Architecture](#7-application-architecture)
8. [Caching Strategy (Redis + Next.js)](#8-caching-strategy)
9. [Local Development Environment](#9-local-development-environment)
10. [Security Model](#10-security-model)
11. [Production AWS Architecture](#11-production-aws-architecture)
12. [Implementation Roadmap (Day-by-Day)](#12-implementation-roadmap-day-by-day)
13. [Deployment Roadmap](#13-deployment-roadmap)
14. [CI/CD](#14-cicd)
15. [Checklists](#15-checklists)
16. [Future Improvements](#16-future-improvements)

---

## 1. Scope & Non-Goals

### In scope (MVP)

| Feature | Notes |
|---|---|
| Auth & accounts | Email/password + sessions (Auth.js) |
| File upload | Direct-to-S3 via presigned URLs; multipart for large files |
| File download / preview | Presigned GET URLs; inline preview for images/PDF/text/video |
| Folders | Nested, unlimited depth (adjacency list + materialized path) |
| Listing | Folder contents, sorting, breadcrumbs |
| Metadata | Rename, size, MIME type, timestamps |
| Delete | Soft delete → trash → background purge |
| Move | Files and folders between folders |
| Search | Postgres `ILIKE`/trigram search on names (no Elasticsearch) |
| Storage quotas | Per-user quota, enforced at upload time |
| Sharing | Share file/folder with another user (viewer/editor) + public link |
| Permissions | Owner / editor / viewer, inherited through folders |
| Activity log | Append-only per-user/file event history |
| Background jobs | BullMQ (Redis): trash purge, thumbnail generation, upload reaper |

### Explicit non-goals

Real-time collaboration, document editing, OCR/full-text-content search, versioning, virus scanning, mobile apps, microservices, Kubernetes, event buses. A "Future Improvements" section covers these.

---

## 2. High-Level Architecture

```mermaid
graph TB
    subgraph Client
        B[Browser<br/>Next.js RSC + Client Components]
    end

    subgraph "Next.js App (single deployable)"
        RSC[Server Components<br/>read paths]
        SA[Server Functions<br/>mutations]
        RH[Route Handlers<br/>auth, download redirects]
        W[BullMQ Worker<br/>separate process, same codebase]
    end

    subgraph Data
        PG[(PostgreSQL<br/>metadata, users, permissions)]
        RD[(Redis<br/>cache + job queue)]
        S3[(S3<br/>file bytes)]
    end

    B -->|HTML / RSC payload| RSC
    B -->|actions| SA
    B -->|"PUT file bytes (presigned URL)"| S3
    RSC --> PG
    RSC --> RD
    SA --> PG
    SA --> RD
    SA -->|enqueue| RD
    W -->|consume jobs| RD
    W --> PG
    W --> S3
    RH --> PG
```

Key principle: **file bytes never pass through the Next.js server.** Uploads and downloads go browser ↔ S3 via presigned URLs. The app only handles metadata, auth, and URL signing. This keeps the compute tier small and cheap.

---

## 3. Technology Decisions

### ORM: Drizzle ORM (recommended)

| Criterion | Drizzle | Prisma |
|---|---|---|
| SQL control | Thin, SQL-first — you see the query | Abstracted; recursive CTEs awkward |
| Runtime weight | Tiny, no engine binary | Heavier |
| Migrations | `drizzle-kit` generates plain SQL you can read/edit | Good, but proprietary format |
| Types | Inferred from schema in TS | Generated client |

**Choose Drizzle** because this project needs real SQL (folder subtrees, quota aggregates, trigram search) and readable migration files are a portfolio asset. Prisma is a fine alternative if you already know it — nothing in this plan depends on Drizzle specifically.

### Auth: Auth.js (next-auth v5) with Credentials provider + Drizzle adapter

Battle-tested, native App Router support, database sessions. Add a GitHub/Google OAuth provider later for free. (Alternatives: hand-rolled Lucia-style sessions — good learning, more code; Clerk — great DX but SaaS dependency, weaker portfolio signal.)

### Background jobs: BullMQ

You already run Redis. BullMQ gives retries, delayed jobs, and repeatable (cron) jobs with zero extra infrastructure. The worker is a second process in the same repo (`npm run worker`), deployed as a second ECS service. Used for: trash purge, image thumbnails, stale-upload reaping. **Do not** reach for SQS/EventBridge here — no strong reason.

### Validation: Zod

At every trust boundary: Server Function inputs, route handler params, env vars (`src/lib/env.ts` parses `process.env` at boot and fails fast).

### UI: Tailwind CSS 4 (already installed) + a few shadcn/ui components

Don't build a design system. Dialog, dropdown, context menu, toast — take them from shadcn/ui.

---

## 4. Database Design

### Entity relationships

```mermaid
erDiagram
    users ||--o{ folders : owns
    users ||--o{ files : owns
    users ||--|| storage_usage : has
    folders ||--o{ folders : "parent of"
    folders ||--o{ files : contains
    users ||--o{ shares : "grants/receives"
    files ||--o{ shares : "shared via"
    folders ||--o{ shares : "shared via"
    users ||--o{ activity_logs : performs
```

### Schema (defined in Drizzle; SQL shown for clarity)

```sql
-- users (Auth.js adapter also adds accounts/sessions/verification_tokens)
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text,
  password_hash text,                    -- null for OAuth-only users
  image         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES folders(id) ON DELETE CASCADE,  -- NULL = root
  name       text NOT NULL,
  path       text NOT NULL,              -- materialized path of ids: '/a1/b2/'
  deleted_at timestamptz,                -- soft delete
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (owner_id, parent_id, name)  -- no dup names per folder
);
CREATE INDEX idx_folders_owner_parent ON folders(owner_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_folders_path ON folders USING btree (path text_pattern_ops);

CREATE TABLE files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id     uuid REFERENCES folders(id) ON DELETE SET NULL, -- NULL = root
  name          text NOT NULL,
  s3_key        text NOT NULL UNIQUE,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  status        text NOT NULL DEFAULT 'pending', -- pending | ready | failed
  thumbnail_key text,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_files_owner_folder ON files(owner_id, folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_trash ON files(owner_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- trigram search on names
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_files_name_trgm ON files USING gin (name gin_trgm_ops);
CREATE INDEX idx_folders_name_trgm ON folders USING gin (name gin_trgm_ops);

-- one shares table doubles as the permissions model
CREATE TABLE shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('file','folder')),
  resource_id   uuid NOT NULL,
  granted_by    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_to    uuid REFERENCES users(id) ON DELETE CASCADE, -- NULL = public link
  role          text NOT NULL CHECK (role IN ('viewer','editor')),
  public_token  text UNIQUE,             -- set only for public links
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, granted_to)
);
CREATE INDEX idx_shares_granted_to ON shares(granted_to);
CREATE INDEX idx_shares_resource ON shares(resource_type, resource_id);

CREATE TABLE activity_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action        text NOT NULL,   -- upload | download | rename | move | delete | restore | share | ...
  resource_type text NOT NULL,
  resource_id   uuid NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_user_time ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_resource ON activity_logs(resource_type, resource_id, created_at DESC);

CREATE TABLE storage_usage (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  used_bytes  bigint NOT NULL DEFAULT 0,
  quota_bytes bigint NOT NULL DEFAULT 1073741824,  -- 1 GiB default
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### Design notes

- **Folder tree**: adjacency list (`parent_id`) for integrity + **materialized path** (`path`) for cheap subtree queries (`WHERE path LIKE '/a1/b2/%'`) — used for move, permission inheritance, and recursive trash. On folder move, rewrite descendant paths in one `UPDATE ... SET path = replace(path, old_prefix, new_prefix)`.
- **Quota**: counter in `storage_usage`, updated in the same transaction as file insert/delete. Race-free reservation: `UPDATE storage_usage SET used_bytes = used_bytes + $size WHERE user_id = $id AND used_bytes + $size <= quota_bytes` — zero rows updated means quota exceeded.
- **`status='pending'`**: file row is created *before* upload; a confirm step flips it to `ready`. A daily job deletes stale pending rows and their S3 objects, releasing quota.
- **Soft delete**: `deleted_at` set → appears in Trash; BullMQ repeatable job purges rows + S3 objects older than 30 days.
- **Permission resolution** (in `services/permission.service.ts`): a user can access a resource if (a) owner, (b) direct share, or (c) share on any ancestor folder — walk the materialized path, one query: `WHERE resource_id IN (ancestor ids from path)`. Highest role wins.

---

## 5. File Storage Design (S3)

### Object key layout

```
{env}/users/{userId}/files/{fileId}          ← original bytes
{env}/users/{userId}/thumbs/{fileId}.webp    ← generated thumbnail
```

Deliberately **flat per user** — folders are a *database* concept only. Moving a file/folder never touches S3 (Google Drive works the same way). The display filename lives in Postgres and is applied at download time via `response-content-disposition`.

### Bucket configuration

- Block **all** public access; every access is a presigned URL.
- Enforce TLS via bucket policy (`aws:SecureTransport`).
- CORS: allow `PUT, GET` from the app origin only (required for presigned browser uploads).
- Lifecycle rule: abort incomplete multipart uploads after 7 days.
- SSE-S3 encryption at rest (default).

### Size strategy

| File size | Method |
|---|---|
| ≤ 100 MB | Single presigned `PUT` |
| > 100 MB | S3 **multipart upload**: server calls `CreateMultipartUpload`, presigns each `UploadPart` URL (10 MB parts), client uploads parts in parallel, server calls `CompleteMultipartUpload` |

Cap uploads at 2 GB for the MVP.

---

## 6. Core Flows

### Upload flow

```mermaid
sequenceDiagram
    participant C as Browser
    participant S as Server Function
    participant DB as Postgres
    participant S3 as S3

    C->>S: requestUpload(name, size, mime, folderId)
    S->>S: auth + zod + permission check on folder
    S->>DB: BEGIN: reserve quota (atomic UPDATE), insert file (status=pending)
    S->>S3: presign PUT (key, content-type, content-length, 15 min TTL)
    S-->>C: { fileId, presignedUrl }
    C->>S3: PUT bytes directly (XHR, progress events)
    C->>S: confirmUpload(fileId)
    S->>S3: HeadObject — verify object exists & size matches
    S->>DB: status=ready, activity_log(upload)
    S->>S: enqueue thumbnail job (if image), revalidatePath(folder)
    S-->>C: done → UI refreshes
```

If the client never confirms, the daily reaper finds `pending` rows older than 24 h, deletes the S3 object if present, releases quota, removes the row.

### Download / preview flow

```mermaid
sequenceDiagram
    participant C as Browser
    participant RH as Route Handler /api/files/[id]/download
    participant DB as Postgres
    participant S3 as S3

    C->>RH: GET (?preview=1 for inline)
    RH->>DB: load file + resolve permission (owner / share / ancestor share)
    RH->>RH: presign GET (60 s TTL,<br/>disposition attachment|inline + real filename)
    RH-->>C: 302 redirect to presigned URL
    C->>S3: GET bytes
```

Preview = same mechanism with `response-content-disposition: inline`; the client renders by MIME type: `<img>`, `<video>`, `<iframe>` (PDF), fetched text. Unknown types → download button.

### Move flow

Single Server Function: permission check on source + destination → cycle check for folders (destination `path` must not start with source `path`) → update `folder_id`/`parent_id` + rewrite descendant paths in one transaction → log activity → `revalidatePath` both folders.

---

## 7. Application Architecture

### Layering

```
Presentation    app/, components/, features/*/components    → renders, calls actions
Application     features/*/actions.ts, services/            → business rules, permissions, quotas, transactions
Data access     repositories/                               → Drizzle queries only, no business logic
Infrastructure  lib/s3.ts, lib/redis.ts, lib/queue.ts, db/  → SDK clients, connections
```

Rules that keep it clean:

- **Components never import Drizzle or the AWS SDK.** They call Server Functions or receive data from an RSC page that called a service.
- **Services never build SQL** — they orchestrate repositories + infrastructure and own transactions.
- **Every Server Function**: `auth() → zod.parse(input) → service call → revalidatePath`.
- Repositories accept an optional transaction handle so services can compose them atomically.

### Folder structure

```
src/
├── app/
│   ├── (marketing)/page.tsx                     # landing
│   ├── (auth)/login/  register/
│   ├── (dashboard)/
│   │   ├── layout.tsx                           # sidebar + quota widget
│   │   ├── drive/[[...folderPath]]/page.tsx     # folder browser (RSC)
│   │   ├── search/  shared/  trash/  activity/
│   ├── s/[token]/page.tsx                       # public share link
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── health/route.ts
│       └── files/[id]/download/route.ts
├── proxy.ts                        # Next 16: route protection (replaces middleware.ts)
├── components/ui/                  # shadcn primitives
├── features/
│   ├── files/    { components/, actions.ts, schemas.ts }
│   ├── folders/  { components/, actions.ts, schemas.ts }
│   ├── sharing/  search/  trash/  activity/  auth/
├── services/                       # upload, permission, quota, move services
├── repositories/                   # file.repo.ts, folder.repo.ts, share.repo.ts, activity.repo.ts
├── db/                             # schema.ts, index.ts (client), migrations/, seed.ts
├── lib/                            # env.ts, auth.ts, s3.ts, redis.ts, queue.ts, utils.ts
├── workers/                        # index.ts (BullMQ worker entry), jobs/*.ts
└── types/
```

Server/Client split: pages, listings, breadcrumbs, activity feed = **Server Components**. Upload dropzone, context menus, dialogs, preview modal = **Client Components** (leaf nodes only).

---

## 8. Caching Strategy

### What Redis caches (and what it doesn't)

| Data | Cache? | TTL / invalidation |
|---|---|---|
| Resolved permission for (user, resource) | ✅ | 60 s TTL + explicit delete on share change |
| Storage usage widget | ✅ | invalidate on upload/delete |
| Public share token → resource lookup | ✅ | invalidate on unshare |
| Folder listings | ❌ | indexed Postgres is fast; per-folder caching creates an invalidation swamp for near-zero gain |
| Presigned URLs | ❌ | cheap to generate, short-lived by design |
| Sessions | via DB (Auth.js) | move to Redis only if measured hot |

Pattern: tiny `cached(key, ttl, fn)` helper in `lib/redis.ts` (get → miss → compute → `SET EX`). The same Redis instance backs **BullMQ** queues.

### Next.js-level caching (Cache Components)

Enable `cacheComponents: true`. Folder pages read per-user data → **don't** `'use cache'` them; wrap listings in `<Suspense>` and stream. Use `'use cache'` + `cacheLife('hours')` only for genuinely shared, non-personal data (e.g., the marketing page). After mutations, call `revalidatePath('/drive/...')` from the Server Function.

---

## 9. Local Development Environment

### Docker Compose

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: cloudnest
      POSTGRES_PASSWORD: cloudnest
      POSTGRES_DB: cloudnest
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U cloudnest"], interval: 5s }

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redisdata:/data]

  minio:                       # S3-compatible local storage
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: cloudnest
      MINIO_ROOT_PASSWORD: cloudnest123
    volumes: [miniodata:/data]

  createbucket:                # one-shot bucket creation
    image: minio/mc
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "mc alias set local http://minio:9000 cloudnest cloudnest123 &&
      mc mb -p local/cloud-nest-dev || true"

volumes: { pgdata: {}, redisdata: {}, miniodata: {} }
```

**MinIO vs LocalStack vs real AWS**: use **MinIO**. You only need the S3 API, and MinIO implements it (presigned URLs and multipart included) with a nice console and no LocalStack tier surprises. The AWS SDK v3 points at it via `endpoint` + `forcePathStyle: true`. LocalStack earns its keep only if you also need SQS/Lambda locally — you don't. Do a one-time smoke test against a real dev S3 bucket in week 2 before deploying.

### Environment variables (`.env.local`, validated by `lib/env.ts` with Zod)

```bash
DATABASE_URL=postgres://cloudnest:cloudnest@localhost:5432/cloudnest
REDIS_URL=redis://localhost:6379
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000

S3_BUCKET=cloud-nest-dev
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000      # unset in production → real AWS
S3_FORCE_PATH_STYLE=true               # MinIO only
AWS_ACCESS_KEY_ID=cloudnest            # MinIO creds locally only
AWS_SECRET_ACCESS_KEY=cloudnest123     # in prod: ECS task IAM role, no static keys

MAX_FILE_SIZE_BYTES=2147483648
DEFAULT_QUOTA_BYTES=1073741824
```

`lib/s3.ts` reads `S3_ENDPOINT` conditionally — one code path locally and in prod. In production the SDK's default credential chain picks up the **ECS task IAM role**, so no keys are ever configured there.

### Workflow

```bash
docker compose up -d
npm run db:migrate       # drizzle-kit migrate
npm run db:seed          # demo user + sample folders/files
npm run dev              # next dev
npm run worker           # tsx watch src/workers/index.ts (separate terminal)
```

Migrations: `drizzle-kit generate` produces SQL files in `src/db/migrations/`, committed to git, applied with `drizzle-kit migrate` (and via a one-off ECS task at deploy time). Seed creates `demo@cloudnest.dev / password123` with a small folder tree, plus a second user for testing sharing.

---

## 10. Security Model

- **Authorization in one place**: `permission.service.resolve(userId, resource)` is the *only* way code decides access; called by every Server Function, route handler, and page loader. Never trust a `folderId`/`fileId` from the client without it.
- **Server Functions are public POST endpoints** — each one re-authenticates (`auth()`) and re-authorizes. `proxy.ts` route protection is UX, not security.
- **Presigned URLs**: PUT URLs pin `Content-Type` and `Content-Length`, 15 min TTL. GET URLs 60 s TTL (consumed by an immediate redirect). Never render presigned URLs into cacheable HTML.
- **Upload confirmation** verifies the object's real size via `HeadObject` before marking `ready` (prevents quota cheating).
- **Input validation**: Zod everywhere; filename sanitization (strip path separators/control chars); MIME type for rendering decisions comes from a server-side allowlist, not the client.
- **Public links**: unguessable 32-byte tokens, viewer role only, revocable.
- **Rate limiting**: Redis token bucket on auth endpoints and upload requests.
- **Secrets**: local → `.env.local` (gitignored); production → AWS Secrets Manager, injected into ECS task definitions. No AWS access keys in production — IAM roles only.
- **Headers**: CSP, `X-Content-Type-Options: nosniff` (critical when previewing user uploads), `Referrer-Policy` — configured in `next.config.ts`.

---

## 11. Production AWS Architecture

```mermaid
graph TB
    U[Users] --> CF[CloudFront]
    CF -->|"/_next/static/*"| S3A[(S3: static assets)]
    CF -->|dynamic, no cache| ALB[ALB<br/>public subnets]
    U -->|presigned PUT/GET| S3F[(S3: user files<br/>private bucket)]

    subgraph VPC [VPC 10.0.0.0/16]
        subgraph Public [Public subnets ×2 AZ]
            ALB
            NAT[NAT Gateway ×1]
        end
        subgraph Private [Private subnets ×2 AZ]
            ECS1[ECS Fargate: web ×2]
            ECS2[ECS Fargate: worker ×1]
            RDS[(RDS PostgreSQL 17<br/>db.t4g.micro)]
            EC[(ElastiCache Redis<br/>cache.t4g.micro)]
        end
    end

    ALB --> ECS1
    ECS1 --> RDS
    ECS1 --> EC
    ECS2 --> RDS
    ECS2 --> EC
    ECS1 -.IAM task role.-> S3F
    ECS2 -.-> S3F
    SM[Secrets Manager] -.-> ECS1
    CW[CloudWatch logs + alarms] -.-> ECS1
```

### Compute: ECS Fargate (recommended)

- **vs EC2**: no instance patching/AMI management; per-task IAM roles; cleaner scaling story.
- **vs Vercel**: easiest Next.js host, but the brief is to demonstrate AWS skills, and the long-lived BullMQ worker doesn't fit serverless anyway.
- Two services from **one Docker image** (multi-stage build, `output: 'standalone'`): `web` (`node server.js`, 2 tasks, 0.5 vCPU / 1 GB) and `worker` (`node workers/index.js`, 1 task). Migrations run as a one-off ECS task on deploy.

### Networking

- VPC `10.0.0.0/16`, 2 AZs. Public subnets: ALB + **1** NAT Gateway (accept the single-AZ NAT risk — each NAT is ~$32/mo). Private subnets: ECS, RDS, ElastiCache.
- Security groups, chained least-privilege: `alb-sg` ← 443 from world; `app-sg` ← 3000 from `alb-sg` only; `db-sg` ← 5432 from `app-sg`; `redis-sg` ← 6379 from `app-sg`.
- ALB: HTTPS listener (ACM cert), HTTP→HTTPS redirect, health check `/api/health`.

### Database: RDS PostgreSQL 17

`db.t4g.micro` to start, storage autoscaling on, automated backups 7 days, deletion protection, private subnets only, TLS required. Multi-AZ off initially (document the trade-off). Scaling path: vertical first → read replica only when measurably read-bound.

### Caching: ElastiCache Redis

Single `cache.t4g.micro` node (no cluster mode). Serves app cache and BullMQ. Invalidation is explicit deletes (§8); TTLs are the safety net.

### S3 + CloudFront

- **Files bucket**: private, presigned-URL-only, CORS locked to the app domain, multipart-abort lifecycle rule.
- **CloudFront**: ALB origin with caching disabled (auth'd HTML) + `/_next/static/*` behavior with long immutable TTL. Optionally add CloudFront + Origin Access Control in front of the files bucket later (Future Improvements) — presigned S3 is fine for MVP.

### IAM (least privilege)

- `web-task-role` / `worker-task-role`: `s3:PutObject, GetObject, DeleteObject, AbortMultipartUpload, ListMultipartUploadParts` on the files bucket ARN only; `secretsmanager:GetSecretValue` on the app secret only.
- `ecs-execution-role`: ECR pull, CloudWatch logs, secrets read.
- CI role: ECR push + `ecs:UpdateService` + scoped `iam:PassRole`, assumed via GitHub OIDC (no stored keys).

**Estimated monthly cost** (us-east-1, small): Fargate ~$30, RDS ~$13, ElastiCache ~$12, NAT ~$35, ALB ~$20, S3/CloudFront ~$5 → **~$115/mo**. Tear down when not demoing.

---

## 12. Implementation Roadmap (Day-by-Day)

> Rhythm: days 1–3 foundation, 4–8 core features, 9–10 sharing/search, 11–12 jobs + polish, 13–14 deploy. Each day ends with something demoable. Commit at every ✅.

### Day 1 — Foundation: Docker, DB, project skeleton

**Goal**: `docker compose up` + app boots with validated env, Drizzle connected.

- **Files**: `docker-compose.yml`, `.env.local`, `.env.example`, `src/lib/env.ts`, `src/db/schema.ts` (users only), `src/db/index.ts`, `drizzle.config.ts`, folder skeleton from §7.
- **Commands**:
  ```bash
  npm i drizzle-orm postgres zod @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
        ioredis bullmq bcryptjs next-auth@beta @auth/drizzle-adapter
  npm i -D drizzle-kit tsx @types/bcryptjs
  docker compose up -d
  npx drizzle-kit generate && npx drizzle-kit migrate
  ```
- ✅ App renders; migration creates `users`; MinIO console (`:9001`) shows the bucket.

### Day 2 — Authentication

**Goal**: register, login, logout, protected dashboard.

- **Files**: `src/lib/auth.ts` (Auth.js: Credentials provider, Drizzle adapter, DB sessions), `app/api/auth/[...nextauth]/route.ts`, `proxy.ts` (unauthenticated `/drive/*` → `/login`), `(auth)/login` + `register` pages, `features/auth/actions.ts` (register: zod → bcrypt → insert user + `storage_usage` row in one transaction).
- ✅ Full auth loop; `/drive` redirects when logged out.

### Day 3 — Full schema + repositories + seed

**Goal**: entire §4 schema migrated; repository layer; seed data.

- **Files**: complete `src/db/schema.ts`, `repositories/{file,folder,share,activity,quota}.repo.ts`, `src/db/seed.ts`, `services/permission.service.ts` (owner-only for now).
- **Details**: materialized-path helpers (`childPath`, `isDescendant`); `pg_trgm` extension in a migration.
- ✅ `npm run db:seed` produces a browsable dataset (verify in `psql`).

### Day 4 — Folder browser (read path)

**Goal**: navigate the folder tree.

- **Files**: `(dashboard)/layout.tsx` (sidebar, quota widget), `drive/[[...folderPath]]/page.tsx` (RSC: resolve folder from path segments → list children), `features/folders/components/{FolderGrid,Breadcrumbs,ItemRow}.tsx`.
- **Details**: folders-first sort; empty state; `<Suspense>` streaming.
- ✅ Click through seeded nested folders with correct breadcrumbs.

### Day 5 — Folder mutations

**Goal**: create, rename, soft-delete folders.

- **Files**: `features/folders/actions.ts` (`createFolder`, `renameFolder`, `trashFolder`), `schemas.ts`, dialogs + context menu (client components).
- **Details**: every action = auth → zod → permission → repo (transaction) → activity log → `revalidatePath`. Trash = set `deleted_at` on the whole subtree via one path-prefix `UPDATE`.
- ✅ Folder CRUD from the UI; duplicate-name constraint surfaces as a friendly error.

### Day 6 — Upload

**Goal**: full presigned upload flow (§6) with quota enforcement.

- **Files**: `lib/s3.ts`, `services/{upload,quota}.service.ts`, `features/files/actions.ts` (`requestUpload`, `confirmUpload`), `UploadButton.tsx` + `UploadDropzone.tsx` (client: XHR PUT with progress, then confirm).
- **Details**: atomic quota reservation (§4); release on failure; parallel uploads; multipart branch for >100 MB.
- ✅ Drag files in → progress bars → files appear; quota widget updates; over-quota upload rejected clearly.

### Day 7 — Download, preview, file mutations

**Goal**: get bytes back out; rename/trash files.

- **Files**: `app/api/files/[id]/download/route.ts` (302 → presigned GET), `PreviewModal.tsx` (image/video/PDF/text by MIME), file rename/trash actions.
- ✅ Download restores original filename; preview works for the main types.

### Day 8 — Move + Trash

**Goal**: move files/folders; trash with restore and purge.

- **Files**: `services/move.service.ts`, `MoveDialog.tsx` (folder tree picker), `trash/page.tsx`, restore/purge actions.
- **Details**: cycle prevention via path-prefix check; descendant paths rewritten transactionally. "Empty trash" hard-deletes rows, decrements quota, enqueues S3 deletions.
- ✅ Move a nested folder and verify children follow; trash → restore → purge round-trip.

### Day 9 — Sharing & permissions

**Goal**: share with users (viewer/editor), public links, "Shared with me".

- **Files**: `features/sharing/{actions.ts, ShareDialog.tsx}`, `shared/page.tsx`, `app/s/[token]/page.tsx`, complete `permission.service.ts` (owner → direct share → ancestor-folder share via path; Redis-cached 60 s).
- **Details**: editor may rename/upload-into/move-within the share; viewer read-only. Public link = viewer, no auth, cached token lookup.
- ✅ Second seeded user sees the shared folder; viewer role actually blocks edits; public link works logged out.

### Day 10 — Search + Activity

**Goal**: name search and activity feed.

- **Files**: `search/page.tsx` + debounced header search (URL-param driven), `repositories/search.repo.ts` (trigram search across owned + shared items), `activity/page.tsx` (paginated feed).
- ✅ Search returns ranked matches; activity shows uploads/renames/shares with timestamps.

### Day 11 — Background jobs + hardening

**Goal**: worker live; thumbnails; reapers; rate limiting.

- **Files**: `lib/queue.ts`, `workers/index.ts`, `workers/jobs/{thumbnail,purge-trash,reap-pending}.ts`, `app/api/health/route.ts`.
- **Details**: thumbnail job = fetch image from S3 → `sharp` resize to 256px webp → upload to `thumbs/` → set `thumbnail_key`. Repeatable daily jobs: purge trash >30 d, reap stale pending uploads. Redis rate limiter on auth + upload. Security headers.
- ✅ Upload an image → thumbnail appears in the grid shortly after; jobs visible in worker logs.

### Day 12 — Polish + production build

**Goal**: production-quality feel; Dockerized app.

- **Tasks**: `error.tsx`/`not-found.tsx`/loading/empty states everywhere, toasts, keyboard-accessible menus, responsive pass, `Dockerfile` (multi-stage, `output: 'standalone'`), clean `next build` + lint, README with screenshots.
- ✅ `docker build` + `docker run` against compose services works end-to-end.

### Day 13 — AWS provisioning

Execute Deployment Roadmap steps 1–7 (§13).
✅ VPC/RDS/Redis/S3/ECR exist; migration task ran; presigned upload smoke-tested against real S3.

### Day 14 — Deploy + monitoring

Execute steps 8–11 (§13).
✅ App live behind CloudFront over HTTPS; worker running; alarms configured; demo account seeded; demo GIF recorded for the README.

---

## 13. Deployment Roadmap

1. **Account prep**: dedicated AWS account (or isolated prefix), billing alarms at $50/$150, Cost Explorer on. Region `us-east-1`. AWS CLI v2 with SSO or an MFA-protected profile.
2. **IAM**: create `web-task-role`, `worker-task-role`, `ecs-execution-role`, `ci-deploy` role per §11. No `*` policies.
3. **Networking**: VPC `10.0.0.0/16`; public subnets `10.0.1-2.0/24`, private `10.0.11-12.0/24` (2 AZs); IGW; 1 NAT GW; route tables; the four security groups. (Console is fine; Terraform is a stretch goal.)
4. **Database**: RDS PostgreSQL 17, `db.t4g.micro`, private subnets, `db-sg`, 20 GB gp3 + autoscaling, 7-day backups, deletion protection. Connection string into Secrets Manager (`cloud-nest/prod`).
5. **Redis**: ElastiCache Redis `cache.t4g.micro`, same private subnets, `redis-sg`.
6. **S3**: `cloud-nest-prod-files-<suffix>` — block public access, TLS-only bucket policy, CORS for the app domain, multipart-abort lifecycle rule.
7. **ECR + image**: create repo; build and push. Run migrations via a one-off ECS task executing `drizzle-kit migrate`.
8. **ECS**: cluster; task definitions for `web` (port 3000, secrets from Secrets Manager, task role) and `worker`; services in private subnets; web → target group.
9. **ALB + TLS**: ACM certificate (DNS validation), HTTPS listener → target group, HTTP→HTTPS redirect, health check `/api/health`.
10. **CloudFront + DNS**: distribution with ALB origin (no cache, forward cookies) + `/_next/static/*` long-TTL behavior; point DNS at CloudFront; set `AUTH_URL` to the final domain.
11. **Monitoring**: CloudWatch log groups for both services; alarms: ALB 5xx rate, unhealthy targets, RDS CPU > 80%, RDS free storage < 2 GB, ECS task restart loops. Enable RDS Performance Insights (free tier).

---

## 14. CI/CD

GitHub Actions, two workflows — no more:

- **`ci.yml`** (every PR): `npm ci` → lint → `tsc --noEmit` → `next build` → optional Vitest for services (Postgres/Redis as service containers, S3 mocked).
- **`deploy.yml`** (push to `main`): OIDC federation to the `ci-deploy` role (no stored AWS keys) → build/push to ECR → run migration task → `aws ecs update-service --force-new-deployment` for web + worker.

---

## 15. Checklists

### Development checklist

- [ ] Compose stack up; env validated at boot
- [ ] Auth: register/login/logout/protected routes
- [ ] Schema migrated; seed data; repositories
- [ ] Folder browse/create/rename/trash with breadcrumbs
- [ ] Presigned upload (progress, quota, confirm, multipart > 100 MB)
- [ ] Download + preview (image/video/PDF/text)
- [ ] Move with cycle prevention; trash/restore/purge
- [ ] Sharing (user + public link) with enforced roles & inheritance
- [ ] Search + activity feed
- [ ] Worker: thumbnails, trash purge, pending-upload reaper
- [ ] Rate limiting, security headers, filename sanitization
- [ ] Error/loading/empty states; `next build` and lint clean
- [ ] Dockerfile works against compose services

### Deployment checklist

- [ ] Billing alarms; IAM roles least-privilege; no static keys in app
- [ ] VPC/subnets/NAT/security groups per design
- [ ] RDS with backups + deletion protection; secret in Secrets Manager
- [ ] ElastiCache reachable from app SG only
- [ ] S3 private, TLS-only, CORS, lifecycle rules
- [ ] ECR image pushed; migrations applied; web + worker healthy
- [ ] ALB + ACM cert + HTTPS redirect + health checks
- [ ] CloudFront + DNS; `AUTH_URL` correct; login works over HTTPS
- [ ] E2E smoke on prod: register → upload → share → download
- [ ] CloudWatch logs flowing; alarms verified
- [ ] CI/CD green on a real deploy

---

## 16. Future Improvements

- **File versioning** (S3 versioning + `file_versions` table)
- **Resumable uploads** (persist multipart state; retry individual parts)
- **CloudFront signed URLs for downloads** (edge-cached delivery of hot files)
- **Full-text content search** (worker extracts text → Postgres `tsvector`; OpenSearch only if truly needed)
- **Virus scanning** (ClamAV job between `pending` and `ready`)
- **Real-time updates** (SSE for shared-folder changes)
- **Infrastructure as Code** (Terraform/CDK for all of §13)
- **Org/team accounts**; link permissions with expiry + password
- **Autoscaling** (ECS target tracking), Multi-AZ RDS, second NAT gateway

---

*A portfolio project demonstrating full-stack Next.js + AWS cloud engineering. Scope discipline rule: every feature ships in a day or it gets cut.*
