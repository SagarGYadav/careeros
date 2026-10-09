// Prisma 7 reads its connection settings from this file, not from schema.prisma.
// It does not load .env on its own, so dotenv is imported first.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // process.env (not env()) so `prisma generate` also works where no database is configured, e.g. CI installs.
    url: process.env["DATABASE_URL"],
  },
});
