import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function loadApi(apiUrl = "demo") {
  vi.resetModules()
  vi.stubEnv("VITE_API_URL", apiUrl)
  return import("./api")
}

const newIssue = {
  groupId: "B01",
  zone: "อาคารเรียน 1",
  category: "ไฟฟ้า / หลอดไฟ",
  riskLevel: "ปกติ",
  locationDetail: "หลอดไฟดับ",
  suggestion: "",
  reporterName: "ผู้ทดสอบ",
  reporterPhone: "0800000000",
  reporterEmail: "test@example.com",
}

describe("api demo mode", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("falls back to the same-origin API when VITE_API_URL is empty", async () => {
    const { API_URL, isBackendConfigured } = await loadApi("")

    expect(API_URL).toBe("./api/index.php")
    expect(isBackendConfigured).toBe(true)
  })

  it("lists the seeded repair jobs with pagination", async () => {
    const { api } = await loadApi()
    const result = await api.listIssues({ page: 1, pageSize: 2 })

    expect(result.issues).toHaveLength(2)
    expect(result.total).toBeGreaterThan(2)
    expect(result.issues[0].id).toMatch(/^GW-/)
  })

  it("logs in with the demo staff account and rejects a wrong PIN", async () => {
    const { api } = await loadApi()

    const session = await api.loginStaff("เจ้าหน้าที่", "1234")
    expect(session.token).toBeTruthy()
    expect(session.staff.name).toBe("เจ้าหน้าที่")

    await expect(api.loginStaff("เจ้าหน้าที่", "9999")).rejects.toThrow("ชื่อหรือ PIN ไม่ถูกต้อง")
  })

  it("creates, closes, and reopens a repair job", async () => {
    const { api, STATUS_CLOSED, STATUS_PENDING } = await loadApi()
    const session = await api.loginStaff("เจ้าหน้าที่", "1234")

    const created = await api.createIssue(newIssue)
    expect(created.id).toMatch(/^GW-/)
    expect(created.reporterName).toBe("ผู้ทดสอบ")
    expect(created.status).toBe(STATUS_PENDING)

    const closed = await api.updateStatus({
      token: session.token,
      rowIndex: created.rowIndex,
      status: STATUS_CLOSED,
      staffNote: "ซ่อมแล้ว",
    })
    expect(closed.status).toBe(STATUS_CLOSED)
    expect(closed.closedDate).not.toBe("")

    const reopened = await api.updateStatus({
      token: session.token,
      rowIndex: created.rowIndex,
      status: STATUS_PENDING,
    })
    expect(reopened.status).toBe(STATUS_PENDING)
    expect(reopened.closedDate).toBe("")
  })

  it("edits and deletes a repair job as staff", async () => {
    const { api } = await loadApi()
    const session = await api.loginStaff("เจ้าหน้าที่", "1234")
    const created = await api.createIssue(newIssue)

    const edited = await api.updateIssue({
      token: session.token,
      rowIndex: created.rowIndex,
      ...newIssue,
      locationDetail: "หลอดไฟดับหน้าห้อง 101",
    })
    expect(edited.locationDetail).toBe("หลอดไฟดับหน้าห้อง 101")

    await api.deleteIssue(session.token, created.rowIndex)
    const result = await api.listIssues({ search: edited.id })
    expect(result.issues.some((issue) => issue.id === edited.id)).toBe(false)
  })

  it("creates staff accounts and enforces roles in demo mode", async () => {
    const { api } = await loadApi()
    const admin = await api.loginStaff("เจ้าหน้าที่", "1234")

    const tech = await api.createStaff(admin.token, "ช่างทดสอบเดโม", "4321", "technician")
    expect(tech.role).toBe("technician")

    const techSession = await api.loginStaff("ช่างทดสอบเดโม", "4321")
    await expect(api.deleteIssue(techSession.token, 1)).rejects.toThrow("เฉพาะผู้ดูแลระบบ")
    await expect(api.createStaff(techSession.token, "ห้ามสร้าง", "5555", "viewer")).rejects.toThrow(
      "เฉพาะผู้ดูแลระบบ",
    )

    const adminAgain = await api.loginStaff("เจ้าหน้าที่", "1234")
    const viewer = await api.createStaff(adminAgain.token, "ผู้ชมเดโม", "4322", "viewer")
    const viewerSession = await api.loginStaff(viewer.name, "4322")
    await expect(
      api.updateStatus({ token: viewerSession.token, rowIndex: 1, status: "กำลังซ่อม" }),
    ).rejects.toThrow("อ่านอย่างเดียว")

    const adminAgain2 = await api.loginStaff("เจ้าหน้าที่", "1234")
    await api.resetStaffPin(adminAgain2.token, tech.id, "9999")
    const relogin = await api.loginStaff(tech.name, "9999")
    expect(relogin.staff.id).toBe(tech.id)
  })

  it("manages zones and returns dashboard stats", async () => {
    const { api } = await loadApi()
    const session = await api.loginStaff("เจ้าหน้าที่", "1234")

    const zone = await api.saveZone(session.token, {
      groupId: "B99",
      name: "อาคารทดสอบ",
      detail: "ทดสอบ",
      active: true,
      sortOrder: 99,
    })
    expect(zone.groupId).toBe("B99")

    const zones = await api.listZones()
    expect(zones.some((item) => item.groupId === "B99")).toBe(true)

    await api.deleteZone(session.token, zone.id)
    expect((await api.listZones()).find((item) => item.id === zone.id)?.active).toBe(false)

    const stats = await api.getStats()
    expect(stats.total).toBeGreaterThan(0)
  })

  it("refuses a repair job without a building", async () => {
    const { api } = await loadApi()

    await expect(api.createIssue({ ...newIssue, groupId: "", zone: "" })).rejects.toThrow(
      "กรุณาเลือกอาคาร/พื้นที่",
    )
  })
})
