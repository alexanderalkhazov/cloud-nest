import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";

const connectionString = env.DATABASE_URL!;

// Reuse the connection across HMR reloads in dev to avoid exhausting pool slots
const globalForDb = globalThis as unknown as { client?: ReturnType<typeof postgres> };
const client = globalForDb.client ?? postgres(connectionString);
if (env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle({ client });
export type Db = typeof db;
// What repositories accept: the db itself or a transaction handle, so services
// can compose several repo calls into one atomic transaction.
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];