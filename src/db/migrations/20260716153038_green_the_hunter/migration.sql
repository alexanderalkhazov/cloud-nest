CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text,
	"provider_account_id" text,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_pkey" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"s3_key" text NOT NULL UNIQUE,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"thumbnail_key" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_status_check" CHECK (status IN ('pending','ready','failed'))
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folders_owner_parent_name_unique" UNIQUE NULLS NOT DISTINCT("owner_id","parent_id","name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_to" uuid,
	"role" text NOT NULL,
	"public_token" text UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_resource_user_unique" UNIQUE("resource_type","resource_id","granted_to"),
	CONSTRAINT "shares_resource_type_check" CHECK (resource_type IN ('file','folder')),
	CONSTRAINT "shares_role_check" CHECK (role IN ('viewer','editor'))
);
--> statement-breakpoint
CREATE TABLE "storage_usage" (
	"user_id" uuid PRIMARY KEY,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"quota_bytes" bigint DEFAULT 1073741824 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"name" text,
	"password_hash" text,
	"image" text,
	"email_verified" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text,
	"token" text,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_pkey" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE INDEX "idx_activity_user_time" ON "activity_logs" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_activity_resource" ON "activity_logs" ("resource_type","resource_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_files_owner_folder" ON "files" ("owner_id","folder_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_files_trash" ON "files" ("owner_id","deleted_at") WHERE deleted_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_files_name_trgm" ON "files" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_folders_owner_parent" ON "folders" ("owner_id","parent_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_folders_path" ON "folders" (path text_pattern_ops);--> statement-breakpoint
CREATE INDEX "idx_folders_name_trgm" ON "folders" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_shares_granted_to" ON "shares" ("granted_to");--> statement-breakpoint
CREATE INDEX "idx_shares_resource" ON "shares" ("resource_type","resource_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_granted_by_users_id_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_granted_to_users_id_fkey" FOREIGN KEY ("granted_to") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;