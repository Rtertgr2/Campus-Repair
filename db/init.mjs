/**
 * Applies db/schema.sql to the database in DATABASE_URL.
 * Safe to run repeatedly: every statement is idempotent.
 *
 * Plain .mjs (not .ts) so `node db/init.mjs` runs without a TypeScript runner.
 *
 *   DATABASE_URL=postgres://... npm run db:init
 */
import { readFile } from "node:fs/promises"
import { neon } from "@neondatabase/serverless"

const url = String(process.env.DATABASE_URL ?? "").trim()

if (!url) {
  console.error(
    "DATABASE_URL is not set — database connector is disabled, nothing to do.\n" +
      "Set DATABASE_URL (server-side only, never VITE_*) and run again.",
  )
  process.exit(1)
}

const schemaPath = new URL("./schema.sql", import.meta.url)
const schema = await readFile(schemaPath, "utf8")

const statements = schema
  .replace(/^\s*--.*$/gm, "")
  .split(/;\s*\n/)
  .map((statement) => statement.trim())
  .filter(Boolean)

const sql = neon(url)
for (const statement of statements) {
  await sql.query(statement)
}

console.log(`Applied ${statements.length} SQL statements to the database.`)
