import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// users + Auth.js adapter tables (accounts / sessions / verification_tokens)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"), // null for OAuth-only users
  image: text("image"),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// folders — adjacency list + materialized path of ids ('/a1/b2/')
// ---------------------------------------------------------------------------

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, {
      onDelete: "cascade",
    }), // NULL = root
    name: text("name").notNull(),
    path: text("path").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // no duplicate names within the same parent (NULL parent = root, still enforced)
    unique("folders_owner_parent_name_unique")
      .on(t.ownerId, t.parentId, t.name)
      .nullsNotDistinct(),
    index("idx_folders_owner_parent")
      .on(t.ownerId, t.parentId)
      .where(sql`deleted_at IS NULL`),
    index("idx_folders_path").using("btree", sql`path text_pattern_ops`),
    index("idx_folders_name_trgm").using("gin", sql`name gin_trgm_ops`),
  ],
);

// ---------------------------------------------------------------------------
// files — bytes live in S3; folders are a database concept only
// ---------------------------------------------------------------------------

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }), // NULL = root
    name: text("name").notNull(),
    s3Key: text("s3_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"), // pending | ready | failed
    thumbnailKey: text("thumbnail_key"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("files_status_check", sql`status IN ('pending','ready','failed')`),
    index("idx_files_owner_folder")
      .on(t.ownerId, t.folderId)
      .where(sql`deleted_at IS NULL`),
    index("idx_files_trash")
      .on(t.ownerId, t.deletedAt)
      .where(sql`deleted_at IS NOT NULL`),
    index("idx_files_name_trgm").using("gin", sql`name gin_trgm_ops`),
  ],
);

// ---------------------------------------------------------------------------
// shares — one table doubles as the permissions model
// ---------------------------------------------------------------------------

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    resourceType: text("resource_type").notNull(), // file | folder
    resourceId: uuid("resource_id").notNull(),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedTo: uuid("granted_to").references(() => users.id, {
      onDelete: "cascade",
    }), // NULL = public link
    role: text("role").notNull(), // viewer | editor
    publicToken: text("public_token").unique(), // set only for public links
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("shares_resource_type_check", sql`resource_type IN ('file','folder')`),
    check("shares_role_check", sql`role IN ('viewer','editor')`),
    unique("shares_resource_user_unique").on(t.resourceType, t.resourceId, t.grantedTo),
    index("idx_shares_granted_to").on(t.grantedTo),
    index("idx_shares_resource").on(t.resourceType, t.resourceId),
  ],
);

// ---------------------------------------------------------------------------
// activity_logs — append-only event history
// ---------------------------------------------------------------------------

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // upload | download | rename | move | delete | restore | share | ...
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_activity_user_time").on(t.userId, t.createdAt.desc()),
    index("idx_activity_resource").on(t.resourceType, t.resourceId, t.createdAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// storage_usage — quota counter, updated transactionally with file changes
// ---------------------------------------------------------------------------

export const storageUsage = pgTable("storage_usage", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
  quotaBytes: bigint("quota_bytes", { mode: "number" })
    .notNull()
    .default(1073741824), // 1 GiB
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Inferred types
export type User = typeof users.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type StorageUsage = typeof storageUsage.$inferSelect;