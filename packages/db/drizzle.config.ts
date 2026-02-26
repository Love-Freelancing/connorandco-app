import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_SESSION_POOLER!,
  },
} satisfies Config;
