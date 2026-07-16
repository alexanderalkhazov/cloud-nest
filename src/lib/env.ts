import { config } from "dotenv";
import { z } from "zod";

// For standalone scripts (seed, worker) run via tsx. In Next.js this is a
// no-op: .env.local is already loaded and dotenv never overrides set vars.
config({ path: ".env.local" });

const schema = z.object({
    NODE_ENV: z.string().default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    AUTH_SECRET: z.string().min(32),
    S3_BUCKET: z.string(),
    S3_REGION: z.string(),
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
    MAX_FILE_SIZE_BYTES: z.coerce.number(),
    DEFAULT_QUOTA_BYTES: z.coerce.number()
});

export const env = schema.parse(process.env); 