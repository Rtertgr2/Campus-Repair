/**
 * Client for the Campus Repair PHP backend in api/ (Apache + PHP + MySQL on XAMPP).
 *
 * Every call is a POST of a JSON body with an `action`, sent as
 * `text/plain` so the browser does not issue a CORS preflight.
 *
 * When VITE_API_URL is not set the module falls back to an in-memory store so
 * the app stays usable locally; `isBackendConfigured` is exported so the UI can
 * say so instead of pretending data was saved.
 */

/**
 * VITE_API_URL เป็น path สัมพัทธ์ก็ได้ เช่น `api/index.php`
 * สำหรับ PHP backend ที่ติดตั้งอยู่ใต้ base path เดียวกับเว็บ
 * (XAMPP: /campus-repair/api/index.php)
 */
function resolveApiUrl(raw: string): string {
  if (!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw)) {
    try {
      const appBase = new URL(import.meta.env.BASE_URL || "/", window.location.origin)
      return new URL(raw, appBase).toString()
    } catch {
      return raw
    }
  }
  return raw
}

export const API_URL = resolveApiUrl(String(import.meta.env.VITE_API_URL ?? "").trim())
export const isBackendConfigured = API_URL.length > 0

export const STATUS_PENDING = "รอแก้ไข"
export const STATUS_CLOSED = "ปิดงานแล้ว"

/** วันครบกำหนดตามความเร่งด่วน — ต้องตรงกับ api/config.php (due_days_by_risk) */
export const DUE_DAYS_BY_RISK: Record<string, number> = {
  สูง: 3,
  ปานกลาง: 7,
  ต่ำ: 30,
}

export const RISK_LEVELS = ["สูง", "ปานกลาง", "ต่ำ"] as const

export const CATEGORIES = [
  "ไฟฟ้า / หลอดไฟ",
  "ประปา / สุขภัณฑ์",
  "ครุภัณฑ์ / เฟอร์นิเจอร์",
  "ประตู / หน้าต่าง",
  "อุปกรณ์การเรียน",
  "โครงสร้าง / อาคาร",
  "อื่นๆ",
]

/** อาคารที่ให้บริการ (ใช้ทั้งหน้าแจ้งซ่อม หน้าประเมิน และหน้า QR) */
export const BUILDINGS = [
  { id: "B01", name: "อาคารเรียน 1", zone: "อาคารเรียน 1" },
  { id: "B02", name: "อาคารเรียน 2", zone: "อาคารเรียน 2" },
  { id: "B03", name: "อาคารอเนกประสงค์", zone: "อาคารอเนกประสงค์" },
  { id: "B04", name: "โรงอาหาร", zone: "โรงอาหาร" },
  { id: "B05", name: "หอสมุด", zone: "หอสมุด" },
]

export interface IssueHistoryEntry {
  fromStatus: string
  toStatus: string
  staffName: string
  note: string
  createdAt: string
}

export interface Issue {
  rowIndex: number
  id: string
  createdDate: string
  dueDate: string
  dueDateRaw: string
  groupId: string
  zone: string
  room: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterContact: string
  beforePhoto: string
  status: string
  closedDate: string
  afterPhoto: string
  staffNote: string
  createdAt: string
  overdueDays: number
  history: IssueHistoryEntry[]
}

export interface NewIssueInput {
  groupId: string
  zone: string
  room?: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterContact?: string
  beforePhotoDataUrl?: string
  /** honeypot — ต้องเว้นว่าง */
  website?: string
}

export interface StatusUpdateInput {
  pin: string
  rowIndex: number
  status: string
  staffNote?: string
  afterPhotoDataUrl?: string
  afterPhotoName?: string
  staffName?: string
  edit?: boolean
}

export interface IssueFilters {
  search?: string
  zone?: string
  category?: string
  status?: string
  riskLevel?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  overdueOnly?: boolean
}

export interface IssueStats {
  total: number
  pending: number
  closed: number
  overdue: number
  closureRate: number
  avgRepairDays: number | null
}

export interface IssuePage {
  issues: Issue[]
  total: number
  page: number
  pageSize: number
  pages: number
  stats: IssueStats
}

export interface Assessment {
  id: string
  timestamp: string
  studentId: string
  studentName: string
  level: string
  groupId: string
  knowledgeCorrect: number
  knowledgeTotal: number
  knowledgePercent: number
  awarenessPoints: number
  awarenessMax: number
  awarenessPercent: number
}

export interface NewAssessmentInput {
  studentId: string
  studentName: string
  level: string
  groupId: string
  knowledgeCorrect: number
  knowledgeTotal: number
  awarenessPoints: number
  awarenessMax: number
  /** honeypot — ต้องเว้นว่าง */
  website?: string
}

export interface AssessmentSummary {
  total: number
  avgKnowledge: number
  avgAwareness: number
  bestKnowledge: number
}

export interface HealthWarning {
  code: string
  message: string
}

export interface HealthReport {
  warnings: HealthWarning[]
  installLocked: boolean
  gdAvailable: boolean
  uploadsWritable: boolean
  photoMaxEdge: number
}

export interface CleanupResult {
  scanned: number
  deleted: string[]
  kept: number
  dryRun: boolean
  maxAgeHours: number
}

/** Shape returned by the API (see api/lib/issues.php). */
interface RawIssue {
  rowIndex: number
  id: string
  createdDate: string
  dueDate: string
  dueDateRaw?: string
  groupId: string
  zone: string
  room?: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName?: string
  reporterContact?: string
  beforePhotoUrl: string
  status: string
  closedDate: string
  afterPhotoUrl: string
  staffNote: string
  createdAt?: string
  overdueDays?: number
  history?: IssueHistoryEntry[]
}

interface ApiResponse {
  ok: boolean
  error?: string
  issues?: RawIssue[]
  issue?: RawIssue
  assessments?: Assessment[]
  assessment?: Assessment
  summary?: AssessmentSummary
  stats?: IssueStats
  total?: number
  page?: number
  pageSize?: number
  pages?: number
  csv?: string
  filename?: string
  rows?: number
  warnings?: HealthWarning[]
  installLocked?: boolean
  gdAvailable?: boolean
  uploadsWritable?: boolean
  photoMaxEdge?: number
  result?: CleanupResult
}

const EMPTY_STATS: IssueStats = {
  total: 0,
  pending: 0,
  closed: 0,
  overdue: 0,
  closureRate: 0,
  avgRepairDays: null,
}

function toIssue(raw: RawIssue): Issue {
  return {
    rowIndex: Number(raw.rowIndex),
    id: raw.id ?? "",
    createdDate: raw.createdDate ?? "",
    dueDate: raw.dueDate ?? "",
    dueDateRaw: raw.dueDateRaw ?? "",
    groupId: raw.groupId ?? "",
    zone: raw.zone ?? "",
    room: raw.room ?? "",
    category: raw.category ?? "",
    riskLevel: raw.riskLevel ?? "",
    locationDetail: raw.locationDetail ?? "",
    suggestion: raw.suggestion ?? "",
    reporterName: raw.reporterName ?? "",
    reporterContact: raw.reporterContact ?? "",
    beforePhoto: raw.beforePhotoUrl ?? "",
    status: raw.status || STATUS_PENDING,
    closedDate: raw.closedDate ?? "",
    afterPhoto: raw.afterPhotoUrl ?? "",
    staffNote: raw.staffNote ?? "",
    createdAt: raw.createdAt ?? "",
    overdueDays: Number(raw.overdueDays ?? 0),
    history: Array.isArray(raw.history) ? raw.history : [],
  }
}

async function post(payload: Record<string, unknown>): Promise<ApiResponse> {
  if (!isBackendConfigured) return mockHandle(payload)

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new Error(
      "เชื่อมต่อ backend ไม่ได้: " +
        (err instanceof Error ? err.message : String(err)),
    )
  }

  if (!response.ok) {
    throw new Error(`backend ตอบกลับผิดพลาด (HTTP ${response.status})`)
  }

  let data: ApiResponse
  try {
    data = (await response.json()) as ApiResponse
  } catch {
    throw new Error("backend ส่งข้อมูลที่ไม่ใช่ JSON กลับมา (ตรวจสอบ VITE_API_URL และ api/index.php)")
  }

  if (!data.ok) throw new Error(data.error || "คำขอถูกปฏิเสธจาก backend")
  return data
}

/** ใส่ PIN เฉพาะเมื่อมีค่า (ไม่ส่ง PIN ว่างให้ backend) */
function withPin(pin?: string): Record<string, string> {
  return pin ? { pin } : {}
}

export const api = {
  async listIssues(filters: IssueFilters = {}, pin?: string): Promise<IssuePage> {
    const data = await post({ action: "listIssues", filters, ...withPin(pin) })
    const issues = (data.issues ?? []).map(toIssue)
    return {
      issues,
      total: Number(data.total ?? issues.length),
      page: Number(data.page ?? 1),
      pageSize: Number(data.pageSize ?? issues.length),
      pages: Number(data.pages ?? 1),
      stats: data.stats ?? EMPTY_STATS,
    }
  },

  async stats(): Promise<IssueStats> {
    const data = await post({ action: "stats" })
    return data.stats ?? EMPTY_STATS
  },

  async createIssue(input: NewIssueInput): Promise<Issue> {
    if (!input.groupId || !input.zone) throw new Error("กรุณาเลือกอาคาร/พื้นที่")
    const data = await post({ action: "createIssue", issue: input })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่บันทึกกลับมา")
    return toIssue(data.issue)
  },

  async updateStatus(input: StatusUpdateInput): Promise<Issue> {
    if (!input.pin) throw new Error("ต้องยืนยันรหัส PIN เจ้าหน้าที่ก่อน")
    const data = await post({ action: "updateStatus", ...input })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่อัปเดตกลับมา")
    return toIssue(data.issue)
  },

  async verifyPin(pin: string): Promise<boolean> {
    try {
      await post({ action: "verifyPin", pin })
      return true
    } catch {
      return false
    }
  },

  async exportIssues(filters: IssueFilters = {}, pin?: string): Promise<{ csv: string; filename: string; rows: number }> {
    const data = await post({ action: "exportIssues", filters, ...withPin(pin) })
    return {
      csv: data.csv ?? "",
      filename: data.filename ?? "campus-repair.csv",
      rows: Number(data.rows ?? 0),
    }
  },

  async listAssessments(pin?: string): Promise<{ assessments: Assessment[]; summary: AssessmentSummary }> {
    const data = await post({ action: "listAssessments", ...withPin(pin) })
    return {
      assessments: data.assessments ?? [],
      summary: data.summary ?? { total: 0, avgKnowledge: 0, avgAwareness: 0, bestKnowledge: 0 },
    }
  },

  async submitAssessment(input: NewAssessmentInput): Promise<Assessment> {
    if (!input.studentId || !input.studentName || !input.groupId) {
      throw new Error("กรุณากรอกข้อมูลให้ครบถ้วน")
    }
    const data = await post({ action: "submitAssessment", assessment: input })
    if (!data.assessment) throw new Error("backend ไม่ได้ส่งผลการประเมินกลับมา")
    return data.assessment
  },

  async health(pin: string): Promise<HealthReport> {
    const data = await post({ action: "health", pin })
    return {
      warnings: data.warnings ?? [],
      installLocked: Boolean(data.installLocked),
      gdAvailable: Boolean(data.gdAvailable),
      uploadsWritable: Boolean(data.uploadsWritable),
      photoMaxEdge: Number(data.photoMaxEdge ?? 1600),
    }
  },

  async cleanupPhotos(pin: string, dryRun = true): Promise<CleanupResult> {
    const data = await post({ action: "cleanupPhotos", pin, dryRun: dryRun ? 1 : 0 })
    return (
      data.result ?? { scanned: 0, deleted: [], kept: 0, dryRun, maxAgeHours: 24 }
    )
  },
}

/* --------------------------------------------------------------------------
 * Local fallback store — used only when VITE_API_URL is empty.
 * Nothing here persists across a page reload and nothing is written to MySQL.
 * ------------------------------------------------------------------------ */

const STAFF_PIN_FALLBACK = "7391"

function today(): string {
  return new Date().toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function isoToday(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function mmDate(raw: string): string {
  const [year, month, day] = raw.split("-")
  return `${day}/${month}/${year}`
}

function buildMockIssue(partial: Partial<Issue> & { rowIndex: number }): Issue {
  return {
    id: "",
    createdDate: today(),
    dueDate: "",
    dueDateRaw: "",
    groupId: "",
    zone: "",
    room: "",
    category: "",
    riskLevel: "",
    locationDetail: "",
    suggestion: "",
    reporterName: "",
    reporterContact: "",
    beforePhoto: "",
    status: STATUS_PENDING,
    closedDate: "",
    afterPhoto: "",
    staffNote: "",
    createdAt: today(),
    overdueDays: 0,
    history: [],
    ...partial,
  }
}

let mockIssues: Issue[] = [
  buildMockIssue({
    rowIndex: 1,
    id: "GW-001",
    createdDate: "10/01/2026",
    dueDate: "13/01/2026",
    dueDateRaw: "2026-01-13",
    groupId: "B01",
    zone: "อาคารเรียน 1",
    room: "204",
    category: "ไฟฟ้า / หลอดไฟ",
    riskLevel: "สูง",
    locationDetail: "หลอดไฟทางเข้าอาคารหลักดับ",
    suggestion: "เปลี่ยนหลอดไฟและตรวจสอบสายไฟ",
    reporterName: "นักศึกษาทดลอง",
    overdueDays: 5,
    history: [
      {
        fromStatus: "",
        toStatus: STATUS_PENDING,
        staffName: "นักศึกษาทดลอง",
        note: "แจ้งซ่อมใหม่",
        createdAt: "10/01/2026 08:30",
      },
    ],
  }),
  buildMockIssue({
    rowIndex: 2,
    id: "GW-002",
    createdDate: "15/01/2026",
    dueDate: "22/01/2026",
    dueDateRaw: "2026-01-22",
    groupId: "B02",
    zone: "อาคารเรียน 2",
    category: "ประปา / สุขภัณฑ์",
    riskLevel: "ปานกลาง",
    locationDetail: "ก๊อกน้ำห้องน้ำชั้น 1 รั่ว",
    suggestion: "เปลี่ยนก๊อกน้ำและตรวจสอบท่อ",
    reporterName: "ครูทดลอง",
    status: STATUS_CLOSED,
    closedDate: "20/01/2026",
    staffNote: "ซ่อมเสร็จโดยทีมงานอาคารสถานที่",
    history: [
      {
        fromStatus: "",
        toStatus: STATUS_PENDING,
        staffName: "ครูทดลอง",
        note: "แจ้งซ่อมใหม่",
        createdAt: "15/01/2026 09:10",
      },
      {
        fromStatus: STATUS_PENDING,
        toStatus: STATUS_CLOSED,
        staffName: "ช่างสมหมาย",
        note: "ซ่อมเสร็จโดยทีมงานอาคารสถานที่",
        createdAt: "20/01/2026 14:05",
      },
    ],
  }),
]

let mockAssessments: Assessment[] = []

function mockStats(issues: Issue[]): IssueStats {
  const total = issues.length
  const closed = issues.filter((issue) => issue.status === STATUS_CLOSED).length
  const pending = total - closed
  const overdue = issues.filter((issue) => issue.overdueDays > 0).length
  return {
    total,
    pending,
    closed,
    overdue,
    closureRate: total > 0 ? Math.round((closed / total) * 100) : 0,
    avgRepairDays: null,
  }
}

function mockList(filters: IssueFilters): IssuePage {
  const search = (filters.search ?? "").trim().toLowerCase()
  const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize) || 20))
  const page = Math.max(1, Number(filters.page) || 1)

  let rows = [...mockIssues].sort((a, b) => b.rowIndex - a.rowIndex)
  if (search) {
    rows = rows.filter((issue) =>
      [issue.id, issue.zone, issue.room, issue.category, issue.locationDetail, issue.reporterName]
        .join(" ")
        .toLowerCase()
        .includes(search),
    )
  }
  if (filters.zone) rows = rows.filter((issue) => issue.zone === filters.zone)
  if (filters.category) rows = rows.filter((issue) => issue.category === filters.category)
  if (filters.status) rows = rows.filter((issue) => issue.status === filters.status)
  if (filters.riskLevel) rows = rows.filter((issue) => issue.riskLevel === filters.riskLevel)
  if (filters.overdueOnly) rows = rows.filter((issue) => issue.overdueDays > 0)
  if (filters.dateFrom) rows = rows.filter((issue) => issue.dueDateRaw >= filters.dateFrom!)
  if (filters.dateTo) rows = rows.filter((issue) => issue.dueDateRaw <= filters.dateTo!)

  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize

  return {
    issues: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pages,
    stats: mockStats(mockIssues),
  }
}

function mockHandle(payload: Record<string, unknown>): ApiResponse {
  const action = payload.action

  if (action === "listIssues") {
    const filters = (payload.filters ?? {}) as IssueFilters
    return { ok: true, ...mockList(filters) } as unknown as ApiResponse
  }

  if (action === "stats") {
    return { ok: true, stats: mockStats(mockIssues) }
  }

  if (action === "verifyPin") {
    return payload.pin === STAFF_PIN_FALLBACK
      ? { ok: true }
      : { ok: false, error: "รหัส PIN ไม่ถูกต้อง" }
  }

  if (action === "createIssue") {
    const input = (payload.issue ?? {}) as NewIssueInput
    if (!input.groupId || !input.zone) {
      return { ok: false, error: "กรุณาเลือกอาคาร/พื้นที่" }
    }
    const dueDays = DUE_DAYS_BY_RISK[input.riskLevel] ?? 30
    const issue = buildMockIssue({
      rowIndex: mockIssues.length + 1,
      id: `GW-${String(mockIssues.length + 1).padStart(3, "0")}`,
      groupId: input.groupId,
      zone: input.zone,
      room: input.room ?? "",
      category: input.category,
      riskLevel: input.riskLevel,
      locationDetail: input.locationDetail,
      suggestion: input.suggestion,
      reporterName: input.reporterName,
      reporterContact: input.reporterContact ?? "",
      beforePhoto: input.beforePhotoDataUrl ? "mock://photo" : "",
      dueDateRaw: isoToday(dueDays),
      dueDate: mmDate(isoToday(dueDays)),
      history: [
        {
          fromStatus: "",
          toStatus: STATUS_PENDING,
          staffName: input.reporterName || "ผู้แจ้ง",
          note: "แจ้งซ่อมใหม่",
          createdAt: `${today()} ${new Date().toTimeString().slice(0, 5)}`,
        },
      ],
    })
    mockIssues = [issue, ...mockIssues]
    return { ok: true, issue: issue as unknown as RawIssue }
  }

  if (action === "updateStatus") {
    const update = payload as unknown as StatusUpdateInput
    if (update.pin !== STAFF_PIN_FALLBACK) {
      return { ok: false, error: "รหัส PIN ไม่ถูกต้อง" }
    }
    const index = mockIssues.findIndex((issue) => issue.rowIndex === Number(update.rowIndex))
    if (index < 0) return { ok: false, error: "ไม่พบรายการที่ต้องการอัปเดต" }

    const closing = update.status === STATUS_CLOSED
    const before = mockIssues[index]
    const updated: Issue = {
      ...before,
      status: closing ? STATUS_CLOSED : STATUS_PENDING,
      closedDate: closing ? today() : "",
      staffNote: update.staffNote ?? before.staffNote,
      afterPhoto: update.afterPhotoDataUrl ? "mock://after-photo" : before.afterPhoto,
      overdueDays: closing ? 0 : before.overdueDays,
      history: [
        ...before.history,
        {
          fromStatus: before.status,
          toStatus: closing ? STATUS_CLOSED : STATUS_PENDING,
          staffName: update.staffName || "เจ้าหน้าที่",
          note: closing ? update.staffNote ?? "" : "เปิดงานซ่อมอีกครั้ง",
          createdAt: `${today()} ${new Date().toTimeString().slice(0, 5)}`,
        },
      ],
    }
    mockIssues = mockIssues.map((issue, i) => (i === index ? updated : issue))
    return { ok: true, issue: updated as unknown as RawIssue }
  }

  if (action === "exportIssues") {
    const filters = (payload.filters ?? {}) as IssueFilters
    const rows = mockList({ ...filters, page: 1, pageSize: 100 }).issues
    const header = "เลขงาน,วันที่แจ้ง,อาคาร,สถานะ\n"
    const body = rows
      .map((issue) => `${issue.id},${issue.createdDate},${issue.zone},${issue.status}`)
      .join("\n")
    return { ok: true, csv: header + body, filename: "campus-repair-mock.csv", rows: rows.length }
  }

  if (action === "listAssessments") {
    const total = mockAssessments.length
    const avgKnowledge = total
      ? Math.round((mockAssessments.reduce((sum, a) => sum + a.knowledgePercent, 0) / total) * 10) / 10
      : 0
    const avgAwareness = total
      ? Math.round((mockAssessments.reduce((sum, a) => sum + a.awarenessPercent, 0) / total) * 10) / 10
      : 0
    return {
      ok: true,
      assessments: mockAssessments,
      summary: {
        total,
        avgKnowledge,
        avgAwareness,
        bestKnowledge: total ? Math.max(...mockAssessments.map((a) => a.knowledgePercent)) : 0,
      },
    }
  }

  if (action === "submitAssessment") {
    const input = (payload.assessment ?? {}) as NewAssessmentInput
    if (!input.studentId || !input.studentName || !input.groupId) {
      return { ok: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" }
    }
    const knowledgeTotal = Math.max(1, Number(input.knowledgeTotal) || 10)
    const awarenessMax = Math.max(1, Number(input.awarenessMax) || 12)
    const knowledgeCorrect = Math.min(Math.max(Number(input.knowledgeCorrect) || 0, 0), knowledgeTotal)
    const awarenessPoints = Math.min(Math.max(Number(input.awarenessPoints) || 0, 0), awarenessMax)

    const assessment: Assessment = {
      id: `A-${String(mockAssessments.length + 1).padStart(3, "0")}`,
      timestamp: new Date().toISOString(),
      studentId: input.studentId,
      studentName: input.studentName,
      level: input.level ?? "",
      groupId: input.groupId,
      knowledgeCorrect,
      knowledgeTotal,
      knowledgePercent: Math.round((knowledgeCorrect / knowledgeTotal) * 100),
      awarenessPoints,
      awarenessMax,
      awarenessPercent: Math.round((awarenessPoints / awarenessMax) * 100),
    }
    mockAssessments = [...mockAssessments, assessment]
    return { ok: true, assessment }
  }

  if (action === "health") {
    return payload.pin === STAFF_PIN_FALLBACK
      ? {
          ok: true,
          warnings: [
            { code: "mock", message: "โหมดข้อมูลตัวอย่าง (ไม่ได้ตั้ง VITE_API_URL) — ข้อมูลไม่ถูกบันทึกถาวร" },
          ],
          installLocked: false,
          gdAvailable: false,
          uploadsWritable: false,
          photoMaxEdge: 1600,
        }
      : { ok: false, error: "รหัส PIN ไม่ถูกต้อง" }
  }

  if (action === "cleanupPhotos") {
    return {
      ok: true,
      result: { scanned: 0, deleted: [], kept: 0, dryRun: Boolean(payload.dryRun), maxAgeHours: 24 },
    }
  }

  return { ok: false, error: `ไม่รู้จักคำสั่ง: ${String(action)}` }
}
