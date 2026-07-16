// Dev seed: wipes and recreates two demo users with a folder tree, files,
// a share, and activity history. Idempotent — safe to re-run any time.
// Note: file rows are DB-only; no bytes exist in MinIO/S3 yet, so
// download/preview of seeded files 404s until real uploads (Day 6).
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { inArray, sql } from "drizzle-orm";
import { db } from ".";
import { childPath } from "./path";
import {
  activityLogs,
  files,
  folders,
  shares,
  storageUsage,
  users,
} from "./schema";

const DEMO_EMAILS = ["demo@cloudnest.dev", "friend@cloudnest.dev"];
const PASSWORD = "password123";
const QUOTA_BYTES = Number(process.env.DEFAULT_QUOTA_BYTES ?? 1073741824);

function s3KeyFor(userId: string) {
  return `dev/users/${userId}/files/${crypto.randomUUID()}`;
}

async function seed() {
  // Idempotency: cascade wipes folders/files/shares/activity/usage.
  await db.delete(users).where(inArray(users.email, DEMO_EMAILS));

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const [demo, friend] = await db
    .insert(users)
    .values([
      { email: DEMO_EMAILS[0], name: "Demo User", passwordHash },
      { email: DEMO_EMAILS[1], name: "Friendly Tester", passwordHash },
    ])
    .returning();

  await db.insert(storageUsage).values([
    { userId: demo.id, quotaBytes: QUOTA_BYTES },
    { userId: friend.id, quotaBytes: QUOTA_BYTES },
  ]);

  // --- demo user's folder tree -------------------------------------------
  async function createFolder(name: string, parent?: { id: string; path: string }) {
    const id = crypto.randomUUID();
    const [row] = await db
      .insert(folders)
      .values({
        id,
        ownerId: demo.id,
        parentId: parent?.id ?? null,
        name,
        path: childPath(parent?.path ?? null, id),
      })
      .returning();
    return row;
  }

  const documents = await createFolder("Documents");
  const reports = await createFolder("Reports", documents);
  const photos = await createFolder("Photos");
  const vacation = await createFolder("Vacation 2026", photos);
  const projects = await createFolder("Projects");

  // --- files ---------------------------------------------------------------
  const fileSeed: Array<{
    ownerId: string;
    folderId: string | null;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }> = [
    { ownerId: demo.id, folderId: null, name: "getting-started.txt", mimeType: "text/plain", sizeBytes: 10_240 },
    { ownerId: demo.id, folderId: documents.id, name: "resume.pdf", mimeType: "application/pdf", sizeBytes: 182_000 },
    { ownerId: demo.id, folderId: documents.id, name: "notes.md", mimeType: "text/markdown", sizeBytes: 4_096 },
    { ownerId: demo.id, folderId: reports.id, name: "q2-report.pdf", mimeType: "application/pdf", sizeBytes: 1_250_000 },
    { ownerId: demo.id, folderId: photos.id, name: "profile.png", mimeType: "image/png", sizeBytes: 820_000 },
    { ownerId: demo.id, folderId: vacation.id, name: "beach.jpg", mimeType: "image/jpeg", sizeBytes: 3_400_000 },
    { ownerId: demo.id, folderId: vacation.id, name: "sunset-clip.mp4", mimeType: "video/mp4", sizeBytes: 15_000_000 },
    { ownerId: demo.id, folderId: projects.id, name: "cloud-nest-pitch.pdf", mimeType: "application/pdf", sizeBytes: 640_000 },
    { ownerId: friend.id, folderId: null, name: "hello-from-friend.txt", mimeType: "text/plain", sizeBytes: 2_048 },
  ];

  const insertedFiles = await db
    .insert(files)
    .values(
      fileSeed.map((f) => ({ ...f, s3Key: s3KeyFor(f.ownerId), status: "ready" })),
    )
    .returning();

  // --- share: Documents → friend (viewer) ----------------------------------
  await db.insert(shares).values({
    resourceType: "folder",
    resourceId: documents.id,
    grantedBy: demo.id,
    grantedTo: friend.id,
    role: "viewer",
  });

  // --- activity history -----------------------------------------------------
  const resume = insertedFiles.find((f) => f.name === "resume.pdf")!;
  await db.insert(activityLogs).values([
    { userId: demo.id, action: "create", resourceType: "folder", resourceId: documents.id, metadata: { name: "Documents" } },
    { userId: demo.id, action: "upload", resourceType: "file", resourceId: resume.id, metadata: { name: "resume.pdf" } },
    { userId: demo.id, action: "rename", resourceType: "file", resourceId: resume.id, metadata: { from: "cv-final-v3.pdf", to: "resume.pdf" } },
    { userId: demo.id, action: "share", resourceType: "folder", resourceId: documents.id, metadata: { with: DEMO_EMAILS[1], role: "viewer" } },
  ]);

  // --- true up quota counters ------------------------------------------------
  await db.execute(sql`
    UPDATE storage_usage su
    SET used_bytes = COALESCE(
      (SELECT sum(f.size_bytes) FROM files f
       WHERE f.owner_id = su.user_id AND f.deleted_at IS NULL), 0)
  `);

  console.log(`Seeded:
  users:    ${DEMO_EMAILS.join(", ")}  (password: ${PASSWORD})
  folders:  5   files: ${insertedFiles.length}   share: Documents → friend (viewer)`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
