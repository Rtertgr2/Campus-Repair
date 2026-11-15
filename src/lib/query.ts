import { IssueFilters } from "./api"

/**
 * แปลงตัวกรองเป็น query string (ใช้แชร์ลิงก์ / เปิดหน้าพิมพ์)
 * ค่าว่างจะไม่ถูกใส่ เพื่อให้ URL อ่านง่าย
 */
export function filtersToQuery(filters: IssueFilters): string {
  const params = new URLSearchParams()

  const add = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === null) return
    const text = String(value).trim()
    if (text === "" || text === "0") return
    params.set(key, text)
  }

  add("search", filters.search)
  add("zone", filters.zone)
  add("category", filters.category)
  add("status", filters.status)
  add("riskLevel", filters.riskLevel)
  add("dateFrom", filters.dateFrom)
  add("dateTo", filters.dateTo)
  add("page", filters.page ?? 1)
  add("pageSize", filters.pageSize)
  add("id", undefined)
  if (filters.overdueOnly) params.set("overdueOnly", "1")

  const query = params.toString()
  return query === "" ? "" : `?${query}`
}

/** อ่านตัวกรองจาก query string ของหน้าเว็บ */
export function queryToFilters(search: string): IssueFilters {
  const params = new URLSearchParams(search)
  const text = (key: string) => params.get(key) ?? ""
  const number = (key: string, fallback: number) => {
    const value = Number(params.get(key))
    return Number.isFinite(value) && value > 0 ? value : fallback
  }

  return {
    search: text("search"),
    zone: text("zone"),
    category: text("category"),
    status: text("status"),
    riskLevel: text("riskLevel"),
    dateFrom: text("dateFrom"),
    dateTo: text("dateTo"),
    page: number("page", 1),
    pageSize: number("pageSize", 10),
    overdueOnly: params.get("overdueOnly") === "1",
  }
}
