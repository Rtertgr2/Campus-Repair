/**
 * Repair-job queries for the future API layer.
 *
 * Returned objects match the `Issue` contract in src/lib/api.ts, so a server
 * handler can replace its Apps Script calls without touching the React pages.
 * Only type imports come from the frontend module: its runtime values pull
 * Vite's `import.meta.env` into Node.
 *
 * Reads go through the `repair_jobs_api` view (db/schema.sql), which already
 * returns camelCase fields and dd/mm/yyyy dates.
 */
import type { Issue, NewIssueInput, StatusUpdateInput } from "../src/lib/api.js"
import { getDb } from "./client.js"

// Mirrors STATUS_PENDING / STATUS_CLOSED in src/lib/api.ts.
const STATUS_PENDING = "รอแก้ไข"
const STATUS_CLOSED = "ปิดงานแล้ว"

const SELECT_ISSUES = `
  select "rowIndex", id, "createdDate", "dueDate", "groupId", zone, category,
         "riskLevel", "locationDetail", suggestion, "beforePhoto", status,
         "closedDate", "afterPhoto", "staffNote"
  from repair_jobs_api
`

/** Neon's driver returns a union of result shapes; narrow it in one place. */
async function queryRows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = getDb()
  return (await sql.query(text, params)) as unknown as T[]
}

export async function listIssues(): Promise<Issue[]> {
  return queryRows<Issue>(`${SELECT_ISSUES} order by "rowIndex"`)
}

export async function getIssue(rowIndex: number): Promise<Issue | null> {
  const [issue] = await queryRows<Issue>(`${SELECT_ISSUES} where "rowIndex" = $1`, [rowIndex])
  return issue ?? null
}

export async function createIssue(input: NewIssueInput): Promise<Issue> {
  if (!input.groupId || !input.zone) throw new Error("กรุณาเลือกอาคาร/พื้นที่")

  const inserted = await queryRows<{ row_index: number }>(
    `insert into repair_jobs
       (group_id, zone, category, risk_level, location_detail, suggestion,
        before_photo_data_url)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning row_index`,
    [
      input.groupId,
      input.zone,
      input.category ?? "",
      input.riskLevel ?? "",
      input.locationDetail ?? "",
      input.suggestion ?? "",
      input.beforePhotoDataUrl ?? "",
    ],
  )

  const issue = await getIssue(inserted[0].row_index)
  if (!issue) throw new Error("ไม่พบรายการที่เพิ่งบันทึก")
  return issue
}

/**
 * Closes or reopens a job. The caller is responsible for verifying `input.pin`;
 * this layer only persists the outcome.
 */
export async function updateStatus(input: StatusUpdateInput): Promise<Issue> {
  if (input.status === STATUS_CLOSED) {
    await queryRows(
      `update repair_jobs
          set status = $1,
              closed_date = current_date,
              staff_note = $3,
              after_photo_data_url = coalesce(nullif($4, ''), after_photo_data_url),
              updated_at = now()
        where row_index = $2`,
      [STATUS_CLOSED, input.rowIndex, input.staffNote ?? "", input.afterPhotoDataUrl ?? ""],
    )
  } else {
    // Reopening keeps the previous note and photo for reference.
    await queryRows(
      `update repair_jobs
          set status = $1, closed_date = null, updated_at = now()
        where row_index = $2`,
      [STATUS_PENDING, input.rowIndex],
    )
  }

  const issue = await getIssue(input.rowIndex)
  if (!issue) throw new Error("ไม่พบรายการที่ต้องการอัปเดต")
  return issue
}
