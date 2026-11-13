/**
 * Server-side database client (Neon Postgres).
 *
 * This module is intentionally NOT imported by the React app: it must only run
 * behind an API/worker so the connection string never reaches the browser.
 * Nothing calls it yet — it is prepared for when the repair API moves off
 * Google Apps Script.
 *
 * Activation:
 *   1. set DATABASE_URL (never VITE_DATABASE_URL) in the server environment
 *   2. npm run db:init   (applies db/schema.sql)
 *   3. import { getDb } from "./client" in the server handler
 */
import { neon } from "@neondatabase/serverless"

export const DATABASE_URL = String(process.env.DATABASE_URL ?? "").trim()

/** False until DATABASE_URL is provided, so the connector stays dormant. */
export const isDatabaseConfigured = DATABASE_URL.length > 0

let client: ReturnType<typeof neon> | null = null

/** Lazily creates the connection (HTTP driver — no pool to manage). */
export function getDb(): ReturnType<typeof neon> {
  if (!isDatabaseConfigured) {
    throw new Error(
      "DATABASE_URL ยังไม่ได้ตั้งค่า — database connector ถูกปิดไว้จนกว่าจะตั้งค่า environment variable",
    )
  }
  if (!client) client = neon(DATABASE_URL)
  return client
}
