import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// postgres-js works with Neon (serverless), Docker Postgres, and RDS without code changes.
// prepare: false is required for Neon's serverless HTTP driver and is harmless for RDS.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
});

export const db = drizzle(client, { schema });

export type DB = typeof db;
