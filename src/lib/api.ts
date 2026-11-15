/** PHP/MySQL API. Explicit VITE_API_URL=demo enables temporary demo data. */
export const API_URL = String(import.meta.env.VITE_API_URL ?? "./api/index.php").trim()
export const isBackendConfigured = API_URL.length > 0 && API_URL !== "demo"

export const STATUS_PENDING = "รอแก้ไข"
export const STATUS_CLOSED = "ปิดงานแล้ว"

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
  beforePhoto: string
  beforePhotoThumb: string
  status: string
  closedDate: string
  afterPhoto: string
  afterPhotoThumb: string
  staffNote: string
}

export interface NewIssueInput {
  groupId: string
  zone: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  beforePhotoDataUrl?: string
  /** Honeypot: left empty by humans, filled by bots. */
  website?: string
}

export interface StatusUpdateInput {
  pin: string
  rowIndex: number
  status: string
  staffNote?: string
  afterPhotoDataUrl?: string
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
  /** Honeypot: left empty by humans, filled by bots. */
  website?: string
}

/** The PHP API already answers in these shapes (see public/api/index.php). */
interface ApiResponse {
  ok: boolean
  error?: string
  issues?: Issue[]
  issue?: Issue
  assessments?: Assessment[]
  assessment?: Assessment
}

async function post(payload: Record<string, unknown>): Promise<ApiResponse> {
  if (!isBackendConfigured) return mockHandle(payload)

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
  async listIssues(): Promise<Issue[]> {
    const data = await post({ action: "listIssues" })
    return data.issues ?? []
  },

  async createIssue(input: NewIssueInput): Promise<Issue> {
    if (!input.groupId || !input.zone) throw new Error("กรุณาเลือกอาคาร/พื้นที่")
    const data = await post({ action: "createIssue", issue: input, website: input.website ?? "" })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่บันทึกกลับมา")
    return data.issue
  },

  async updateStatus(input: StatusUpdateInput): Promise<Issue> {
    if (!input.pin) throw new Error("ต้องยืนยันรหัส PIN เจ้าหน้าที่ก่อน")
    const data = await post({ action: "updateStatus", ...input })
    if (!data.issue) throw new Error("backend ไม่ได้ส่งข้อมูลรายการที่อัปเดตกลับมา")
    return data.issue
  },

  async verifyPin(pin: string): Promise<boolean> {
    try {
      await post({ action: "verifyPin", pin })
      return true
    } catch {
      return false
    }
  },

  async listAssessments(): Promise<Assessment[]> {
    const data = await post({ action: "listAssessments" })
    return data.assessments ?? []
  },

  async submitAssessment(input: NewAssessmentInput): Promise<Assessment> {
    if (!input.studentId || !input.studentName || !input.groupId) {
      throw new Error("กรุณากรอกข้อมูลให้ครบถ้วน")
    }
    const data = await post({
      action: "submitAssessment",
      assessment: input,
      website: input.website ?? "",
    })
    if (!data.assessment) throw new Error("backend ไม่ได้ส่งผลการประเมินกลับมา")
    return data.assessment
  },
}

/* --------------------------------------------------------------------------
 * Local fallback store — used only when VITE_API_URL is empty or demo.
 * Nothing here persists across a page reload.
 * ------------------------------------------------------------------------ */

const STAFF_PIN_FALLBACK = "1234"

function today(): string {
  return new Date().toLocaleDateString("th-TH", {
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

let mockIssues: Issue[] = [
  {
    rowIndex: 2,
    id: "GW-001",
    createdDate: "10/01/2026",
    dueDate: "09/02/2026",
    groupId: "G01",
    zone: "อาคารเรียน 1",
    category: "ไฟฟ้า / หลอดไฟ",
    riskLevel: "สูง",
    locationDetail: "หลอดไฟทางเข้าอาคารหลักดับ",
    suggestion: "เปลี่ยนหลอดไฟและตรวจสอบสายไฟ",
    beforePhoto: "",
    beforePhotoThumb: "",
    status: STATUS_PENDING,
    closedDate: "",
    afterPhoto: "",
    afterPhotoThumb: "",
    staffNote: "",
  },
  {
    rowIndex: 3,
    id: "GW-002",
    createdDate: "15/01/2026",
    dueDate: "14/02/2026",
    groupId: "G02",
    zone: "อาคารเรียน 2",
    category: "ประปา / สุขภัณฑ์",
    riskLevel: "ปานกลาง",
    locationDetail: "ก๊อกน้ำห้องน้ำชั้น 1 รั่ว",
    suggestion: "เปลี่ยนก๊อกน้ำและตรวจสอบท่อ",
    beforePhoto: "",
    beforePhotoThumb: "",
    status: STATUS_CLOSED,
    closedDate: "20/01/2026",
    afterPhoto: "",
    afterPhotoThumb: "",
    staffNote: "ซ่อมเสร็จโดยทีมงานอาคารสถานที่",
  },
  {
    rowIndex: 4,
    id: "GW-003",
    createdDate: "20/01/2026",
    dueDate: "19/02/2026",
    groupId: "G03",
    zone: "โรงอาหาร",
    category: "ครุภัณฑ์ / เฟอร์นิเจอร์",
    riskLevel: "ต่ำ",
    locationDetail: "โต๊ะอาหารชำรุด 2 ตัว",
    suggestion: "ซ่อมหรือเปลี่ยนโต๊ะที่ชำรุด",
    beforePhoto: "",
    beforePhotoThumb: "",
    status: STATUS_PENDING,
    closedDate: "",
    afterPhoto: "",
    afterPhotoThumb: "",
    staffNote: "",
  },
]

let mockAssessments: Assessment[] = []

function nextMockId(): string {
  const max = mockIssues.reduce((acc, issue) => {
    const match = /^GW-(\d+)$/.exec(issue.id)
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `GW-${String(max + 1).padStart(3, "0")}`
}

function mockHandle(payload: Record<string, unknown>): ApiResponse {
  const action = payload.action

  if (action === "listIssues") {
    return { ok: true, issues: mockIssues }
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
    const issue: Issue = {
      rowIndex: mockIssues.length + 2,
      id: nextMockId(),
      createdDate: today(),
      dueDate: today(),
      groupId: input.groupId,
      zone: input.zone,
      category: input.category,
      riskLevel: input.riskLevel,
      locationDetail: input.locationDetail,
      suggestion: input.suggestion,
      beforePhoto: input.beforePhotoDataUrl ? MOCK_PHOTO : "",
      beforePhotoThumb: input.beforePhotoDataUrl ? MOCK_PHOTO : "",
      status: STATUS_PENDING,
      closedDate: "",
      afterPhoto: "",
      afterPhotoThumb: "",
      staffNote: "",
    }
    mockIssues = [...mockIssues, issue]
    return { ok: true, issue }
  }

  if (action === "updateStatus") {
    const update = payload as unknown as StatusUpdateInput
    if (update.pin !== STAFF_PIN_FALLBACK) {
      return { ok: false, error: "รหัส PIN ไม่ถูกต้อง" }
    }
    const index = mockIssues.findIndex((issue) => issue.rowIndex === Number(update.rowIndex))
    if (index < 0) return { ok: false, error: "ไม่พบรายการที่ต้องการอัปเดต" }

    const closing = update.status === STATUS_CLOSED
    const updated: Issue = {
      ...mockIssues[index],
      status: closing ? STATUS_CLOSED : STATUS_PENDING,
      closedDate: closing ? today() : "",
      staffNote: update.staffNote ?? mockIssues[index].staffNote,
      afterPhoto: update.afterPhotoDataUrl ? MOCK_PHOTO : mockIssues[index].afterPhoto,
      afterPhotoThumb: update.afterPhotoDataUrl
        ? MOCK_PHOTO
        : mockIssues[index].afterPhotoThumb,
    }
    mockIssues = mockIssues.map((issue, i) => (i === index ? updated : issue))
    return { ok: true, issue: updated }
  }

  if (action === "listAssessments") {
    return { ok: true, assessments: mockAssessments }
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

  return { ok: false, error: `ไม่รู้จักคำสั่ง: ${String(action)}` }
}
