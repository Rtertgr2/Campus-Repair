/** PHP/MySQL API. Explicit VITE_API_URL=demo enables temporary demo data. */
const configuredApiUrl = String(import.meta.env.VITE_API_URL ?? "").trim()
export const API_URL = configuredApiUrl === "demo" ? "demo" : configuredApiUrl || "./api/index.php"
export const isBackendConfigured = API_URL !== "demo"

export const STATUS_PENDING = "รอแก้ไข"
export const STATUS_ACCEPTED = "รับเรื่องแล้ว"
export const STATUS_IN_PROGRESS = "กำลังซ่อม"
export const STATUS_WAITING_PARTS = "รออะไหล่"
export const STATUS_CLOSED = "ปิดงานแล้ว"
export const STATUS_UNREPAIRABLE = "ซ่อมไม่ได้"
export const STATUS_CANCELLED = "ยกเลิก"

export const STATUS_OPTIONS = [
  STATUS_PENDING,
  STATUS_ACCEPTED,
  STATUS_IN_PROGRESS,
  STATUS_WAITING_PARTS,
  STATUS_CLOSED,
  STATUS_UNREPAIRABLE,
  STATUS_CANCELLED,
] as const

export const TERMINAL_STATUSES = [STATUS_CLOSED, STATUS_UNREPAIRABLE, STATUS_CANCELLED] as const

export const STATUS_LABELS: Record<string, string> = {
  [STATUS_PENDING]: "รอซ่อม",
  [STATUS_ACCEPTED]: "รับเรื่องแล้ว",
  [STATUS_IN_PROGRESS]: "กำลังซ่อม",
  [STATUS_WAITING_PARTS]: "รออะไหล่",
  [STATUS_CLOSED]: "ซ่อมเสร็จแล้ว",
  [STATUS_UNREPAIRABLE]: "ซ่อมไม่ได้",
  [STATUS_CANCELLED]: "ยกเลิก",
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

export interface Issue {
  rowIndex: number
  id: string
  createdDate: string
  dueDate: string
  groupId: string
  zone: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterPhone: string
  reporterEmail: string
  beforePhoto: string
  beforePhotoThumb: string
  status: string
  closedDate: string
  afterPhoto: string
  afterPhotoThumb: string
  assignedStaffId: number | null
  assignedStaffName: string
  staffNote: string
}

export interface NewIssueInput {
  groupId: string
  zone: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterPhone: string
  reporterEmail: string
  beforePhotoDataUrl?: string
  /** Honeypot: left empty by humans, filled by bots. */
  website?: string
}

export interface StatusUpdateInput {
  token: string
  rowIndex: number
  status: string
  staffNote?: string
  afterPhotoDataUrl?: string
  assignedStaffId?: number | null
}

export interface UpdateIssueInput {
  token: string
  rowIndex: number
  groupId: string
  zone: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterPhone: string
  reporterEmail: string
  assignedStaffId?: number | null
}

export type StaffRole = "admin" | "technician" | "viewer"

export interface StaffMember {
  id: number
  name: string
  role: StaffRole
  active?: boolean
  failedAttempts?: number
  lockedUntil?: string | null
}

export interface StaffSession {
  token: string
  staff: StaffMember
}

export interface Zone {
  id: number
  groupId: string
  name: string
  detail: string
  active: boolean
  sortOrder: number
}

export interface ZoneInput {
  id?: number
  groupId: string
  name: string
  detail: string
  active: boolean
  sortOrder: number
}

export interface JobEvent {
  id: number
  rowIndex?: number
  action: string
  fromStatus: string
  toStatus: string
  note: string
  staffName: string
  createdAt: string
}

export interface NotificationItem {
  id: string
  rowIndex: number
  zone: string
  dueDate: string
  status: string
  daysLeft: number
  kind: "due" | "overdue"
}

export interface NotificationResult {
  items: NotificationItem[]
  count: number
  unassigned: number
}

export interface Stats {
  total: number
  closed: number
  pending: number
  groups: number
  dueSoon: number
}

export interface ListIssuesParams {
  page?: number
  pageSize?: number
  status?: string
  zone?: string
  search?: string
  assignedStaffId?: number | null
}

export interface ListIssuesResult {
  issues: Issue[]
  total: number
  page: number
  pageSize: number
}

/** The PHP API already answers in these shapes (see public/api/index.php). */
interface ApiResponse {
  ok: boolean
  error?: string
  issues?: Issue[]
  issue?: Issue
  total?: number
  page?: number
  pageSize?: number
  stats?: Stats
  zones?: Zone[]
  zone?: Zone
  staff?: StaffMember | StaffMember[]
  token?: string
  events?: JobEvent[]
  items?: NotificationItem[]
  count?: number
  unassigned?: number
}

async function post(payload: Record<string, unknown>): Promise<ApiResponse> {
  if (!isBackendConfigured) {
    const data = mockHandle(payload)
    if (!data.ok) throw new Error(data.error || "โหมดสาธิตตอบกลับผิดพลาด")
    return data
  }

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new Error(
      "เชื่อมต่อ backend ไม่ได้: " +
        (err instanceof Error ? err.message : String(err)),
    )
  }

  // The API answers 4xx/5xx with { ok: false, error }, so read the body first
  // and show that message instead of a bare HTTP status.
  let data: ApiResponse
  try {
    data = (await response.json()) as ApiResponse
  } catch {
    throw new Error(
      `backend ส่งข้อมูลที่ไม่ใช่ JSON กลับมา (HTTP ${response.status}) — ตรวจสอบ URL ของ API และให้ PHP ทำงานบนเซิร์ฟเวอร์`,
    )
  }

  if (!data.ok) {
    throw new Error(data.error || `backend ตอบกลับผิดพลาด (HTTP ${response.status})`)
  }
  return data
}

export const api = {
  async listIssues(params: ListIssuesParams = {}, token?: string): Promise<ListIssuesResult> {
    const data = await post({ action: "listIssues", ...params, token: token ?? "" })
    return {
      issues: data.issues ?? [],
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 20,
    }
  },

  async getStats(): Promise<Stats> {
    const data = await post({ action: "getStats" })
    return data.stats ?? { total: 0, closed: 0, pending: 0, groups: 0, dueSoon: 0 }
  },

  async createIssue(input: NewIssueInput): Promise<Issue> {
    if (!input.groupId || !input.zone) throw new Error("กรุณาเลือกอาคาร/พื้นที่")
    const data = await post({ action: "createIssue", issue: input, website: input.website ?? "" })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่บันทึกกลับมา")
    return data.issue
  },

  async loginStaff(staffName: string, pin: string): Promise<StaffSession> {
    const data = await post({ action: "loginStaff", staffName, pin })
    const staff = Array.isArray(data.staff) ? data.staff[0] : data.staff
    if (!data.token || !staff) throw new Error("backend ไม่ได้ส่งข้อมูลเจ้าหน้าที่กลับมา")
    return { token: data.token, staff }
  },

  async logoutStaff(token: string): Promise<void> {
    await post({ action: "logoutStaff", token })
  },

  async listStaff(token: string): Promise<StaffMember[]> {
    const data = await post({ action: "listStaff", token })
    return Array.isArray(data.staff) ? data.staff : data.staff ? [data.staff] : []
  },

  async createStaff(token: string, name: string, pin: string, role: StaffRole): Promise<StaffMember> {
    const data = await post({ action: "createStaff", token, name, pin, role })
    const staff = Array.isArray(data.staff) ? data.staff[0] : data.staff
    if (!staff) throw new Error("backend ไม่ได้ส่งข้อมูลบัญชีกลับมา")
    return staff
  },

  async updateStaff(
    token: string,
    id: number,
    input: { name?: string; role?: StaffRole; active?: boolean },
  ): Promise<StaffMember> {
    const data = await post({ action: "updateStaff", token, id, ...input })
    const staff = Array.isArray(data.staff) ? data.staff[0] : data.staff
    if (!staff) throw new Error("backend ไม่ได้ส่งข้อมูลบัญชีกลับมา")
    return staff
  },

  async resetStaffPin(token: string, id: number, pin: string): Promise<StaffMember> {
    const data = await post({ action: "resetStaffPin", token, id, pin })
    const staff = Array.isArray(data.staff) ? data.staff[0] : data.staff
    if (!staff) throw new Error("backend ไม่ได้ส่งข้อมูลบัญชีกลับมา")
    return staff
  },

  async updateStatus(input: StatusUpdateInput): Promise<Issue> {
    const data = await post({ action: "updateStatus", ...input })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่อัปเดตกลับมา")
    return data.issue
  },

  async updateIssue(input: UpdateIssueInput): Promise<Issue> {
    const { token, ...issue } = input
    const data = await post({ action: "updateIssue", token, issue })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่แก้ไขกลับมา")
    return data.issue
  },

  async deleteIssue(token: string, rowIndex: number): Promise<void> {
    await post({ action: "deleteIssue", token, rowIndex })
  },

  async listEvents(token: string, rowIndex: number): Promise<JobEvent[]> {
    const data = await post({ action: "listEvents", token, rowIndex })
    return data.events ?? []
  },

  async getNotifications(token: string): Promise<NotificationResult> {
    const data = await post({ action: "getNotifications", token })
    return { items: data.items ?? [], count: data.count ?? 0, unassigned: data.unassigned ?? 0 }
  },

  async listZones(): Promise<Zone[]> {
    const data = await post({ action: "listZones" })
    return data.zones ?? []
  },

  async saveZone(token: string, zone: ZoneInput): Promise<Zone> {
    const data = await post({ action: "saveZone", token, ...zone })
    if (!data.zone) throw new Error("backend ไม่ได้ส่งข้อมูลพื้นที่กลับมา")
    return data.zone
  },

  async deleteZone(token: string, id: number): Promise<void> {
    await post({ action: "deleteZone", token, id })
  },
}

/* --------------------------------------------------------------------------
 * Local fallback store — used only when VITE_API_URL is empty or demo.
 * Nothing here persists across a page reload.
 * ------------------------------------------------------------------------ */

const STAFF_PIN_FALLBACK = "1234"
const DEFAULT_STAFF_NAME = "เจ้าหน้าที่"
const DEMO_TOKEN = "demo-token"

function today(): string {
  return new Date().toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function todayPlus(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/** Placeholder image so the demo store has something to render. */
const MOCK_PHOTO =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#e3eaf2"/><text x="240" y="186" font-family="sans-serif" font-size="18" fill="#5b6b7c" text-anchor="middle">ตัวอย่างรูป (โหมดสาธิต)</text></svg>',
  )

let mockToken = ""
let mockSessionId = 0
let mockStaff: StaffMember[] = [
  { id: 1, name: DEFAULT_STAFF_NAME, role: "admin", active: true, failedAttempts: 0, lockedUntil: null },
]
const mockPins = new Map<number, string>([[1, STAFF_PIN_FALLBACK]])
let mockZones: Zone[] = [
  { id: 1, groupId: "B01", name: "อาคารเรียน 1", detail: "ห้องเรียนและห้องปฏิบัติการ", active: true, sortOrder: 10 },
  { id: 2, groupId: "B02", name: "อาคารเรียน 2", detail: "ห้องเรียนและห้องพักครู", active: true, sortOrder: 20 },
  { id: 3, groupId: "B03", name: "อาคารอเนกประสงค์", detail: "ห้องประชุมและกิจกรรม", active: true, sortOrder: 30 },
  { id: 4, groupId: "B04", name: "โรงอาหาร", detail: "พื้นที่รับประทานอาหาร", active: true, sortOrder: 40 },
  { id: 5, groupId: "B05", name: "หอสมุด", detail: "ห้องอ่านหนังสือและคอมพิวเตอร์", active: true, sortOrder: 50 },
]

let mockIssues: Issue[] = [
  {
    rowIndex: 1,
    id: "GW-001",
    createdDate: "10/01/2026",
    dueDate: "09/02/2026",
    groupId: "B01",
    zone: "อาคารเรียน 1",
    category: "ไฟฟ้า / หลอดไฟ",
    riskLevel: "สูง",
    locationDetail: "หลอดไฟทางเข้าอาคารหลักดับ",
    suggestion: "เปลี่ยนหลอดไฟและตรวจสอบสายไฟ",
    reporterName: "นักศึกษาตัวอย่าง",
    reporterPhone: "0800000001",
    reporterEmail: "student@example.com",
    beforePhoto: "",
    beforePhotoThumb: "",
    status: STATUS_PENDING,
    closedDate: "",
    afterPhoto: "",
    afterPhotoThumb: "",
    assignedStaffId: null,
    assignedStaffName: "",
    staffNote: "",
  },
  {
    rowIndex: 2,
    id: "GW-002",
    createdDate: "15/01/2026",
    dueDate: "14/02/2026",
    groupId: "B02",
    zone: "อาคารเรียน 2",
    category: "ประปา / สุขภัณฑ์",
    riskLevel: "ปานกลาง",
    locationDetail: "ก๊อกน้ำห้องน้ำชั้น 1 รั่ว",
    suggestion: "เปลี่ยนก๊อกน้ำและตรวจสอบท่อ",
    reporterName: "ครูตัวอย่าง",
    reporterPhone: "0800000002",
    reporterEmail: "",
    beforePhoto: "",
    beforePhotoThumb: "",
    status: STATUS_CLOSED,
    closedDate: "20/01/2026",
    afterPhoto: "",
    afterPhotoThumb: "",
    assignedStaffId: 1,
    assignedStaffName: DEFAULT_STAFF_NAME,
    staffNote: "ซ่อมเสร็จโดยทีมงานอาคารสถานที่",
  },
  {
    rowIndex: 3,
    id: "GW-003",
    createdDate: "20/01/2026",
    dueDate: "19/02/2026",
    groupId: "B03",
    zone: "โรงอาหาร",
    category: "ครุภัณฑ์ / เฟอร์นิเจอร์",
    riskLevel: "ต่ำ",
    locationDetail: "โต๊ะอาหารชำรุด 2 ตัว",
    suggestion: "ซ่อมหรือเปลี่ยนโต๊ะที่ชำรุด",
    reporterName: "",
    reporterPhone: "",
    reporterEmail: "",
    beforePhoto: "",
    beforePhotoThumb: "",
    status: STATUS_IN_PROGRESS,
    closedDate: "",
    afterPhoto: "",
    afterPhotoThumb: "",
    assignedStaffId: 1,
    assignedStaffName: DEFAULT_STAFF_NAME,
    staffNote: "",
  },
]

let mockEvents: JobEvent[] = []

function nextMockId(): number {
  return mockIssues.reduce((max, issue) => Math.max(max, issue.rowIndex), 0) + 1
}

function requireMockStaff(): boolean {
  return mockToken !== ""
}

function mockHandle(payload: Record<string, unknown>): ApiResponse {
  const action = payload.action
  const token = typeof payload.token === "string" ? payload.token : ""

  if (action === "listIssues") {
    const includeContact = token !== "" && token === mockToken
    const page = Math.max(1, Number(payload.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(payload.pageSize) || 20))
    const status = String(payload.status ?? "")
    const zone = String(payload.zone ?? "")
    const search = String(payload.search ?? "").toLowerCase()
    const filtered = mockIssues.filter((issue) => {
      if (status && issue.status !== status) return false
      if (zone && issue.zone !== zone) return false
      if (search) {
        const haystack = [issue.id, issue.zone, issue.category, issue.locationDetail, issue.reporterName]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
    const start = (page - 1) * pageSize
    return {
      ok: true,
      issues: filtered.slice(start, start + pageSize).map((issue) => ({
        ...issue,
        reporterPhone: includeContact ? issue.reporterPhone : "",
        reporterEmail: includeContact ? issue.reporterEmail : "",
        reporterName: includeContact ? issue.reporterName : "",
      })),
      total: filtered.length,
      page,
      pageSize,
    }
  }

  if (action === "getStats") {
    const closed = mockIssues.filter((issue) => isTerminalStatus(issue.status)).length
    return {
      ok: true,
      stats: {
        total: mockIssues.length,
        closed,
        pending: mockIssues.length - closed,
        groups: new Set(mockIssues.map((issue) => issue.groupId)).size,
        dueSoon: mockIssues.filter((issue) => !isTerminalStatus(issue.status) && issue.dueDate !== "").length,
      },
    }
  }

  if (action === "listZones") {
    return { ok: true, zones: mockZones }
  }

  if (action === "loginStaff") {
    const name = String(payload.staffName ?? "").trim()
    const pin = String(payload.pin ?? "")
    if (!name) return { ok: false, error: "กรุณากรอกชื่อเจ้าหน้าที่" }
    let staff = mockStaff.find((member) => member.name === name)
    if (!staff && pin === STAFF_PIN_FALLBACK) {
      staff = {
        id: mockStaff.reduce((max, member) => Math.max(max, member.id), 0) + 1,
        name,
        role: "technician",
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
      }
      mockStaff = [...mockStaff, staff]
      mockPins.set(staff.id, pin)
    }
    if (!staff || !staff.active || mockPins.get(staff.id) !== pin) {
      return { ok: false, error: "ชื่อหรือ PIN ไม่ถูกต้อง" }
    }
    mockToken = DEMO_TOKEN
    mockSessionId = staff.id
    return { ok: true, token: mockToken, staff: [staff] }
  }

  if (action === "logoutStaff") {
    mockToken = ""
    mockSessionId = 0
    return { ok: true }
  }

  if (action === "listStaff") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    return { ok: true, staff: mockStaff }
  }

  if (action === "createStaff") {
    const actor = mockStaff.find((member) => member.id === mockSessionId)
    if (!actor || actor.role !== "admin") return { ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" }
    const name = String(payload.name ?? "").trim()
    const pin = String(payload.pin ?? "")
    const role = String(payload.role ?? "technician") as StaffRole
    if (!name) return { ok: false, error: "กรุณากรอกชื่อเจ้าหน้าที่" }
    if (!/^\d{4,}$/.test(pin)) return { ok: false, error: "PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก" }
    if (!["admin", "technician", "viewer"].includes(role)) return { ok: false, error: "บทบาทไม่ถูกต้อง" }
    if (mockStaff.some((member) => member.name === name)) return { ok: false, error: "ชื่อเจ้าหน้าที่นี้มีอยู่แล้ว" }
    const staff: StaffMember = {
      id: mockStaff.reduce((max, member) => Math.max(max, member.id), 0) + 1,
      name,
      role,
      active: true,
      failedAttempts: 0,
      lockedUntil: null,
    }
    mockStaff = [...mockStaff, staff]
    mockPins.set(staff.id, pin)
    return { ok: true, staff }
  }

  if (action === "updateStaff") {
    const actor = mockStaff.find((member) => member.id === mockSessionId)
    if (!actor || actor.role !== "admin") return { ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" }
    const id = Number(payload.id)
    const target = mockStaff.find((member) => member.id === id)
    if (!target) return { ok: false, error: "ไม่พบบัญชีเจ้าหน้าที่" }
    const role = (payload.role === undefined ? target.role : String(payload.role)) as StaffRole
    if (!["admin", "technician", "viewer"].includes(role)) return { ok: false, error: "บทบาทไม่ถูกต้อง" }
    const active = payload.active === undefined ? target.active !== false : Boolean(payload.active)
    if (id === mockSessionId && !active) return { ok: false, error: "ปิดใช้งานบัญชีของตัวเองไม่ได้" }
    if (target.role === "admin" && (!active || role !== "admin")) {
      const others = mockStaff.filter((member) => member.id !== id && member.active !== false && member.role === "admin")
      if (others.length === 0) return { ok: false, error: "ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อยหนึ่งบัญชี" }
    }
    const updated: StaffMember = { ...target, role, active, name: payload.name ? String(payload.name).trim() : target.name }
    mockStaff = mockStaff.map((member) => (member.id === id ? updated : member))
    return { ok: true, staff: updated }
  }

  if (action === "resetStaffPin") {
    const actor = mockStaff.find((member) => member.id === mockSessionId)
    if (!actor || actor.role !== "admin") return { ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" }
    const id = Number(payload.id)
    const pin = String(payload.pin ?? "")
    const target = mockStaff.find((member) => member.id === id)
    if (!target) return { ok: false, error: "ไม่พบบัญชีเจ้าหน้าที่" }
    if (!/^\d{4,}$/.test(pin)) return { ok: false, error: "PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก" }
    mockPins.set(id, pin)
    const updated: StaffMember = { ...target, failedAttempts: 0, lockedUntil: null }
    mockStaff = mockStaff.map((member) => (member.id === id ? updated : member))
    return { ok: true, staff: updated }
  }

  if (action === "createIssue") {
    const input = (payload.issue ?? {}) as NewIssueInput
    if (!input.groupId || !input.zone) {
      return { ok: false, error: "กรุณาเลือกอาคาร/พื้นที่" }
    }
    const rowIndex = nextMockId()
    const issue: Issue = {
      rowIndex,
      id: `GW-${String(rowIndex).padStart(3, "0")}`,
      createdDate: today(),
      dueDate: todayPlus(30),
      groupId: input.groupId,
      zone: input.zone,
      category: input.category,
      riskLevel: input.riskLevel,
      locationDetail: input.locationDetail,
      suggestion: input.suggestion,
      reporterName: input.reporterName ?? "",
      reporterPhone: input.reporterPhone ?? "",
      reporterEmail: input.reporterEmail ?? "",
      beforePhoto: input.beforePhotoDataUrl ? MOCK_PHOTO : "",
      beforePhotoThumb: input.beforePhotoDataUrl ? MOCK_PHOTO : "",
      status: STATUS_PENDING,
      closedDate: "",
      afterPhoto: "",
      afterPhotoThumb: "",
      assignedStaffId: null,
      assignedStaffName: "",
      staffNote: "",
    }
    mockIssues = [issue, ...mockIssues]
    mockEvents = [
      {
        id: mockEvents.length + 1,
        rowIndex,
        action: "create",
        fromStatus: "",
        toStatus: STATUS_PENDING,
        note: input.reporterName ?? "",
        staffName: input.reporterName || "ผู้แจ้ง",
        createdAt: new Date().toISOString(),
      },
      ...mockEvents,
    ]
    return { ok: true, issue }
  }

  if (action === "updateStatus") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    if (mockStaff.find((member) => member.id === mockSessionId)?.role === "viewer") {
      return { ok: false, error: "บัญชีนี้เป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขงานได้" }
    }
    const update = payload as unknown as StatusUpdateInput
    const index = mockIssues.findIndex((issue) => issue.rowIndex === Number(update.rowIndex))
    if (index < 0) return { ok: false, error: "ไม่พบรายการที่ต้องการอัปเดต" }
    const current = mockIssues[index]
    const closing = isTerminalStatus(update.status)
    const staffName = mockStaff.find((member) => member.id === current.assignedStaffId)?.name ?? DEFAULT_STAFF_NAME
    const updated: Issue = {
      ...current,
      status: update.status,
      closedDate: closing ? today() : "",
      staffNote: update.staffNote ?? current.staffNote,
      afterPhoto: update.afterPhotoDataUrl ? MOCK_PHOTO : current.afterPhoto,
      afterPhotoThumb: update.afterPhotoDataUrl ? MOCK_PHOTO : current.afterPhotoThumb,
      assignedStaffId: update.assignedStaffId === undefined ? current.assignedStaffId : update.assignedStaffId,
      assignedStaffName:
        update.assignedStaffId === undefined
          ? current.assignedStaffName
          : mockStaff.find((member) => member.id === update.assignedStaffId)?.name ?? "",
    }
    mockIssues = mockIssues.map((issue, i) => (i === index ? updated : issue))
    mockEvents = [
      {
        id: mockEvents.length + 1,
        rowIndex: current.rowIndex,
        action: "status",
        fromStatus: current.status,
        toStatus: update.status,
        note: update.staffNote ?? "",
        staffName,
        createdAt: new Date().toISOString(),
      },
      ...mockEvents,
    ]
    return { ok: true, issue: updated }
  }

  if (action === "updateIssue") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    if (mockStaff.find((member) => member.id === mockSessionId)?.role === "viewer") {
      return { ok: false, error: "บัญชีนี้เป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขงานได้" }
    }
    const input = (payload.issue ?? {}) as Partial<UpdateIssueInput>
    const index = mockIssues.findIndex((issue) => issue.rowIndex === Number(input.rowIndex))
    if (index < 0) return { ok: false, error: "ไม่พบรายการที่ต้องการอัปเดต" }
    const current = mockIssues[index]
    const updated: Issue = {
      ...current,
      groupId: input.groupId ?? current.groupId,
      zone: input.zone ?? current.zone,
      category: input.category ?? current.category,
      riskLevel: input.riskLevel ?? current.riskLevel,
      locationDetail: input.locationDetail ?? current.locationDetail,
      suggestion: input.suggestion ?? current.suggestion,
      reporterName: input.reporterName ?? current.reporterName,
      reporterPhone: input.reporterPhone ?? current.reporterPhone,
      reporterEmail: input.reporterEmail ?? current.reporterEmail,
      assignedStaffId: input.assignedStaffId === undefined ? current.assignedStaffId : input.assignedStaffId,
      assignedStaffName:
        input.assignedStaffId === undefined
          ? current.assignedStaffName
          : mockStaff.find((member) => member.id === input.assignedStaffId)?.name ?? "",
    }
    mockIssues = mockIssues.map((issue, i) => (i === index ? updated : issue))
    mockEvents = [
      {
        id: mockEvents.length + 1,
        rowIndex: current.rowIndex,
        action: "edit",
        fromStatus: current.status,
        toStatus: current.status,
        note: "แก้ไขรายละเอียดงาน",
        staffName: DEFAULT_STAFF_NAME,
        createdAt: new Date().toISOString(),
      },
      ...mockEvents,
    ]
    return { ok: true, issue: updated }
  }

  if (action === "deleteIssue") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    if (mockStaff.find((member) => member.id === mockSessionId)?.role !== "admin") {
      return { ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" }
    }
    mockIssues = mockIssues.filter((issue) => issue.rowIndex !== Number(payload.rowIndex))
    return { ok: true }
  }

  if (action === "listEvents") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    return {
      ok: true,
      events: mockEvents.filter((event) => event.rowIndex === Number(payload.rowIndex)),
    }
  }

  if (action === "getNotifications") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    const pending = mockIssues.filter((issue) => !isTerminalStatus(issue.status))
    const items: NotificationItem[] = pending.slice(0, 10).map((issue) => ({
      id: issue.id,
      rowIndex: issue.rowIndex,
      zone: issue.zone,
      dueDate: issue.dueDate,
      status: issue.status,
      daysLeft: 0,
      kind: "due",
    }))
    return {
      ok: true,
      items,
      count: items.length,
      unassigned: pending.filter((issue) => issue.assignedStaffId === null).length,
    }
  }

  if (action === "saveZone") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    if (mockStaff.find((member) => member.id === mockSessionId)?.role !== "admin") {
      return { ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" }
    }
    const zone: Zone = {
      id: Number(payload.id) || mockZones.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      groupId: String(payload.groupId ?? ""),
      name: String(payload.name ?? ""),
      detail: String(payload.detail ?? ""),
      active: payload.active !== false,
      sortOrder: Number(payload.sortOrder) || 0,
    }
    if (!zone.groupId || !zone.name) return { ok: false, error: "กรุณากรอกรหัสและชื่อพื้นที่" }
    const exists = mockZones.findIndex((item) => item.id === zone.id)
    mockZones = exists >= 0 ? mockZones.map((item) => (item.id === zone.id ? zone : item)) : [...mockZones, zone]
    return { ok: true, zone }
  }

  if (action === "deleteZone") {
    if (!requireMockStaff()) return { ok: false, error: "กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่" }
    if (mockStaff.find((member) => member.id === mockSessionId)?.role !== "admin") {
      return { ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้น" }
    }
    mockZones = mockZones.map((zone) => (zone.id === Number(payload.id) ? { ...zone, active: false } : zone))
    return { ok: true }
  }

  return { ok: false, error: `ไม่รู้จักคำสั่ง: ${String(action)}` }
}
