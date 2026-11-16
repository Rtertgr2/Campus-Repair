import React, { useCallback, useEffect, useState } from "react"
import { Modal } from "react-bootstrap"
import {
  api,
  Issue,
  JobEvent,
  ListIssuesParams,
  StaffMember,
  Stats,
  STATUS_ACCEPTED,
  STATUS_CANCELLED,
  STATUS_CLOSED,
  STATUS_IN_PROGRESS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  STATUS_PENDING,
  STATUS_UNREPAIRABLE,
  STATUS_WAITING_PARTS,
  Zone,
  isTerminalStatus,
} from "../../lib/api"
import { useStaff } from "../../lib/staff-context"
import { downscaleImage } from "../../lib/image"

type ActionMode = "status" | "edit" | "delete" | "history"
interface ActionState {
  mode: ActionMode
  issue: Issue
}

const PAGE_SIZE = 20
const ALL_STATUSES = "ทั้งหมด"

const categories = [
  "ไฟฟ้า / หลอดไฟ",
  "ประปา / สุขภัณฑ์",
  "ครุภัณฑ์ / เฟอร์นิเจอร์",
  "ประตู / หน้าต่าง",
  "อุปกรณ์การเรียน",
  "โครงสร้าง / อาคาร",
  "อื่นๆ",
]
const urgencyLevels = ["ปกติ", "เร่งด่วน", "ฉุกเฉิน"]

const statusTone = (status: string) => {
  if (status === STATUS_CLOSED) return "done"
  if (status === STATUS_UNREPAIRABLE || status === STATUS_CANCELLED) return "danger"
  if (status === STATUS_IN_PROGRESS || status === STATUS_WAITING_PARTS) return "active"
  if (status === STATUS_ACCEPTED) return "accepted"
  return "open"
}

const eventLabel = (action: string) => {
  if (action === "create") return "แจ้งซ่อม"
  if (action === "status") return "เปลี่ยนสถานะ"
  if (action === "edit") return "แก้ไขรายละเอียด"
  if (action === "delete") return "ลบรายการ"
  return action
}

/** Small preview from the thumbnail; clicking opens the full photo. */
const PhotoThumb: React.FC<{ path: string; thumb: string; label: string }> = ({ path, thumb, label }) => (
  <a href={path} target="_blank" rel="noreferrer" title={label}>
    <img
      src={thumb || path}
      alt={label}
      loading="lazy"
      style={{
        inlineSize: 56,
        blockSize: 56,
        objectFit: "cover",
        borderRadius: "var(--radius-sm)",
        display: "block",
      }}
    />
  </a>
)

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}

const TrackerPage: React.FC = () => {
  const { isStaff, isAdmin, canEdit, token } = useStaff()

  const [issues, setIssues] = useState<Issue[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const [zoneFilter, setZoneFilter] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [zones, setZones] = useState<Zone[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, closed: 0, pending: 0, groups: 0, dueSoon: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  const [action, setAction] = useState<ActionState | null>(null)
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const [statusValue, setStatusValue] = useState<string>(STATUS_PENDING)
  const [staffNote, setStaffNote] = useState("")
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null)
  const [assignee, setAssignee] = useState("")
  const [editForm, setEditForm] = useState({
    groupId: "",
    zone: "",
    category: "",
    riskLevel: "",
    locationDetail: "",
    suggestion: "",
    reporterName: "",
    reporterPhone: "",
    reporterEmail: "",
  })
  const [events, setEvents] = useState<JobEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, zoneFilter])

  useEffect(() => {
    api.listZones().then((items) => setZones(items.filter((zone) => zone.active))).catch(() => setZones([]))
  }, [])

  useEffect(() => {
    if (!token) {
      setStaffList([])
      return
    }
    api.listStaff(token).then((items) => setStaffList(items.filter((member) => member.active !== false))).catch(() => setStaffList([]))
  }, [token])

  const loadStats = useCallback(async () => {
    try {
      setStats(await api.getStats())
    } catch {
      /* the list shows its own error */
    }
  }, [])

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    const params: ListIssuesParams = {
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
      zone: zoneFilter || undefined,
      search: debouncedSearch || undefined,
    }
    try {
      const result = await api.listIssues(params, token ?? undefined)
      setIssues(result.issues)
      setTotal(result.total)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, zoneFilter, debouncedSearch, token])

  useEffect(() => {
    void loadIssues()
  }, [loadIssues])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const closureRate = stats.total > 0 ? Math.round((stats.closed / stats.total) * 100) : 0

  const openAction = (mode: ActionMode, issue: Issue) => {
    setAction({ mode, issue })
    setFormError("")
    setMessage(null)
    setEvents([])
    setAfterPhoto(null)
    setStatusValue(issue.status)
    setStaffNote(issue.staffNote)
    setAssignee(issue.assignedStaffId ? String(issue.assignedStaffId) : "")
    setEditForm({
      groupId: issue.groupId,
      zone: issue.zone,
      category: issue.category,
      riskLevel: issue.riskLevel,
      locationDetail: issue.locationDetail,
      suggestion: issue.suggestion,
      reporterName: issue.reporterName,
      reporterPhone: issue.reporterPhone,
      reporterEmail: issue.reporterEmail,
    })
    if (mode === "history" && token) {
      setEventsLoading(true)
      api
        .listEvents(token, issue.rowIndex)
        .then(setEvents)
        .catch((err) => setFormError(err instanceof Error ? err.message : String(err)))
        .finally(() => setEventsLoading(false))
    }
  }

  const closeAction = () => {
    setAction(null)
    setFormError("")
  }

  const handleAfterPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      setAfterPhoto(await downscaleImage(event.target?.result as string))
    }
    reader.readAsDataURL(file)
  }

  const handleStatusSubmit = async () => {
    if (!action || !token) return
    if (!canEdit) {
      setFormError("บัญชีนี้เป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขงานได้")
      return
    }
    if (isTerminalStatus(statusValue) && !staffNote.trim()) {
      setFormError("กรุณากรอกหมายเหตุการซ่อมก่อนปิดงาน")
      return
    }
    setBusy(true)
    setFormError("")
    try {
      const updated = await api.updateStatus({
        token,
        rowIndex: action.issue.rowIndex,
        status: statusValue,
        staffNote: staffNote.trim(),
        afterPhotoDataUrl: afterPhoto ?? undefined,
        assignedStaffId: assignee ? Number(assignee) : null,
      })
      setIssues((prev) => prev.map((item) => (item.rowIndex === updated.rowIndex ? updated : item)))
      setMessage({ variant: "success", text: `อัปเดต ${updated.id} เป็น “${STATUS_LABELS[updated.status] ?? updated.status}” แล้ว` })
      closeAction()
      await Promise.all([loadIssues(), loadStats()])
    } catch (err) {
      setFormError("บันทึกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const handleEditSubmit = async () => {
    if (!action || !token) return
    if (!canEdit) {
      setFormError("บัญชีนี้เป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขงานได้")
      return
    }
    setBusy(true)
    setFormError("")
    try {
      const updated = await api.updateIssue({
        token,
        rowIndex: action.issue.rowIndex,
        ...editForm,
        assignedStaffId: assignee ? Number(assignee) : null,
      })
      setIssues((prev) => prev.map((item) => (item.rowIndex === updated.rowIndex ? updated : item)))
      setMessage({ variant: "success", text: `แก้ไขรายละเอียด ${updated.id} แล้ว` })
      closeAction()
      await Promise.all([loadIssues(), loadStats()])
    } catch (err) {
      setFormError("บันทึกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!action || !token) return
    if (!isAdmin) {
      setFormError("เฉพาะผู้ดูแลระบบเท่านั้น")
      return
    }
    setBusy(true)
    setFormError("")
    try {
      await api.deleteIssue(token, action.issue.rowIndex)
      setMessage({ variant: "success", text: `ลบรายการ ${action.issue.id} แล้ว` })
      closeAction()
      await Promise.all([loadIssues(), loadStats()])
    } catch (err) {
      setFormError("ลบไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (!token) return
    setExporting(true)
    setMessage(null)
    try {
      const all: Issue[] = []
      let nextPage = 1
      let count = 0
      do {
        const result = await api.listIssues(
          {
            page: nextPage,
            pageSize: 200,
            status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
            zone: zoneFilter || undefined,
            search: debouncedSearch || undefined,
          },
          token,
        )
        all.push(...result.issues)
        count = result.total
        nextPage += 1
      } while (all.length < count && nextPage <= 100)

      const header = [
        "ID", "วันที่แจ้ง", "กำหนดเสร็จ", "อาคาร", "พื้นที่", "ประเภท", "ความเร่งด่วน",
        "สถานะ", "ผู้แจ้ง", "เบอร์โทร", "อีเมล", "ผู้รับผิดชอบ", "รายละเอียด", "ข้อเสนอแนะ",
        "หมายเหตุเจ้าหน้าที่", "วันที่ปิด",
      ]
      const rows = all.map((issue) => [
        issue.id, issue.createdDate, issue.dueDate, issue.zone, issue.groupId, issue.category,
        issue.riskLevel, STATUS_LABELS[issue.status] ?? issue.status, issue.reporterName,
        issue.reporterPhone, issue.reporterEmail, issue.assignedStaffName, issue.locationDetail,
        issue.suggestion, issue.staffNote, issue.closedDate,
      ])
      const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `campus-repair-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
      setMessage({ variant: "success", text: `ส่งออก ${all.length} รายการเป็น CSV แล้ว` })
    } catch (err) {
      setMessage({ variant: "danger", text: "ส่งออกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setExporting(false)
    }
  }

  const filters = [ALL_STATUSES, ...STATUS_OPTIONS]

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          ติดตามงานซ่อม
        </p>
        <h1>ติดตามงานซ่อม (Repair Tracker)</h1>
        <p className="lede">
          ดูสถานะงานซ่อมทุกรายการ ค้นหาและกรองงาน มอบหมายช่าง บันทึกผลการซ่อม
          หรือย้อนดูประวัติการเปลี่ยนแปลงของแต่ละงาน
        </p>
      </div>

      <div className="workspace wrap">
        <div className="workspace-grid single">
          <div className="panel">
            <div className="list-head">
              <div>
                <h2>รายการแจ้งซ่อม</h2>
                <p className="field-help">อัตราซ่อมเสร็จ {closureRate}% • ทั้งหมด {stats.total} รายการ</p>
              </div>
              <div className="stat-strip" aria-label="สรุปรายการ">
                <span className="od-stat">
                  <span className="stat-num">{stats.total}</span>
                  <span className="stat-cap">ทั้งหมด</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{stats.pending}</span>
                  <span className="stat-cap">รอดำเนินการ</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{stats.closed}</span>
                  <span className="stat-cap">ปิดแล้ว</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{stats.dueSoon}</span>
                  <span className="stat-cap">ใกล้ครบกำหนด</span>
                </span>
              </div>
            </div>

            {message && (
              <p className={`form-summary${message.variant === "success" ? " success" : ""}`} role="alert">
                {message.text}
              </p>
            )}
            {loadError && (
              <p className="form-summary" role="alert">โหลดรายการไม่สำเร็จ: {loadError}</p>
            )}

            <div className="filter-bar">
              <div className="chips" role="group" aria-label="กรองสถานะ">
                {filters.map((status) => (
                  <button
                    className="chip"
                    type="button"
                    key={status}
                    aria-pressed={statusFilter === status}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === ALL_STATUSES ? ALL_STATUSES : STATUS_LABELS[status] ?? status}
                  </button>
                ))}
              </div>
              <div className="filter-row">
                <input
                  className="search-input"
                  type="search"
                  placeholder="ค้นหาเลขงาน, อาคาร, อาการ, ผู้แจ้ง..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="ค้นหารายการ"
                />
                <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} aria-label="กรองอาคาร">
                  <option value="">ทุกอาคาร</option>
                  {zones.map((zone) => (
                    <option key={zone.groupId} value={zone.name}>{zone.name}</option>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadIssues()} disabled={loading}>
                  {loading ? "กำลังโหลด..." : "↻ รีเฟรช"}
                </button>
                {isStaff && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => void handleExport()} disabled={exporting}>
                    {exporting ? "กำลังส่งออก..." : "⬇ ส่งออก CSV"}
                  </button>
                )}
              </div>
            </div>

            <div className="report-list">
              {loading ? (
                <div className="empty"><h3>กำลังโหลดรายการ...</h3></div>
              ) : issues.length === 0 ? (
                <div className="empty">
                  <h3>ไม่มีรายการที่ตรงกับเงื่อนไข</h3>
                  <p>ลองเลือกตัวกรองอื่น หรือแจ้งซ่อมใหม่จากหน้า “แจ้งซ่อม”</p>
                </div>
              ) : (
                issues.map((issue) => (
                  <article className="report" key={issue.id}>
                    <div className="report-head">
                      <span className="report-type">{issue.category || "ไม่ระบุประเภท"}</span>
                      <span className="report-status" data-status={statusTone(issue.status)}>
                        {STATUS_LABELS[issue.status] ?? issue.status}
                        {issue.status === STATUS_CLOSED && <span className="report-tick" aria-hidden="true">✓</span>}
                      </span>
                      <span className="report-status">{issue.riskLevel || "-"}</span>
                    </div>

                    <h3 className="report-loc">{issue.zone || issue.groupId}</h3>

                    {issue.locationDetail && <p className="report-detail">{issue.locationDetail}</p>}
                    {isStaff && issue.reporterName && (
                      <p className="report-detail">
                        ผู้แจ้ง: {issue.reporterName}
                        {issue.reporterPhone ? ` • ${issue.reporterPhone}` : ""}
                        {issue.reporterEmail ? ` • ${issue.reporterEmail}` : ""}
                      </p>
                    )}
                    {issue.assignedStaffName && (
                      <p className="report-detail">ผู้รับผิดชอบ: {issue.assignedStaffName}</p>
                    )}
                    {issue.staffNote && <p className="report-detail">หมายเหตุ: {issue.staffNote}</p>}

                    <div className="report-foot">
                      <span className="report-time">
                        {issue.id} • บันทึก {issue.createdDate}
                        {issue.closedDate ? ` • ปิด ${issue.closedDate}` : ` • ครบกำหนด ${issue.dueDate}`}
                      </span>
                      <div className="report-actions">
                        {issue.beforePhoto && (
                          <PhotoThumb path={issue.beforePhoto} thumb={issue.beforePhotoThumb} label="ภาพก่อนซ่อม" />
                        )}
                        {issue.afterPhoto && (
                          <PhotoThumb path={issue.afterPhoto} thumb={issue.afterPhotoThumb} label="ภาพหลังซ่อม" />
                        )}
                        {isStaff ? (
                          <>
                            {canEdit && (
                              <>
                                <button className="report-action" type="button" onClick={() => openAction("status", issue)}>
                                  อัปเดตสถานะ
                                </button>
                                <button className="report-action" type="button" onClick={() => openAction("edit", issue)}>
                                  แก้ไข
                                </button>
                              </>
                            )}
                            <button className="report-action" type="button" onClick={() => openAction("history", issue)}>
                              ประวัติ
                            </button>
                            {isAdmin && (
                              <button className="report-action report-action--danger" type="button" onClick={() => openAction("delete", issue)}>
                                ลบ
                              </button>
                            )}
                            {!canEdit && <span className="field-help">อ่านอย่างเดียว</span>}
                          </>
                        ) : (
                          <span className="field-help">เข้าสู่ระบบเจ้าหน้าที่เพื่ออัปเดตงาน</span>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="pager">
              <button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                ← ก่อนหน้า
              </button>
              <span>หน้า {page} / {totalPages} • {total} รายการ</span>
              <button className="btn btn-ghost btn-sm" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
                ถัดไป →
              </button>
            </div>

            {!isStaff && (
              <p className="field-help" style={{ marginTop: "var(--space-2)" }}>
                การบันทึกผลการซ่อมต้องเข้าสู่ระบบเจ้าหน้าที่ด้วยชื่อและ PIN
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal show={!!action} onHide={closeAction} centered size={action?.mode === "edit" ? "lg" : undefined}>
        <Modal.Header closeButton>
          <Modal.Title>
            {action?.mode === "status" && "อัปเดตสถานะงาน"}
            {action?.mode === "edit" && "แก้ไขรายละเอียดงาน"}
            {action?.mode === "delete" && "ลบรายการแจ้งซ่อม"}
            {action?.mode === "history" && "ประวัติการเปลี่ยนแปลง"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {action && (
            <p className="field-help" style={{ marginBottom: 12 }}>
              {action.issue.id} • {action.issue.zone} • {action.issue.category}
            </p>
          )}
          {formError && <p className="form-summary" role="alert">{formError}</p>}

          {action?.mode === "status" && (
            <>
              <div className="field">
                <label htmlFor="formStatus">สถานะใหม่</label>
                <select id="formStatus" value={statusValue} onChange={(event) => setStatusValue(event.target.value)}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{STATUS_LABELS[status] ?? status}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="formAssignee">ผู้รับผิดชอบ</label>
                <select id="formAssignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                  <option value="">ไม่มอบหมาย</option>
                  {staffList.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="formStaffNote">หมายเหตุการซ่อม</label>
                <textarea
                  id="formStaffNote"
                  rows={3}
                  value={staffNote}
                  onChange={(event) => setStaffNote(event.target.value)}
                  placeholder="เช่น ซ่อมเสร็จโดยทีมงานอาคารสถานที่"
                />
              </div>
              <div className="field">
                <label htmlFor="formAfterPhoto">ภาพหลังซ่อม (ไม่บังคับ)</label>
                <input id="formAfterPhoto" type="file" accept="image/*" capture="environment" onChange={handleAfterPhotoChange} />
                {afterPhoto && (
                  <img
                    src={afterPhoto}
                    alt="หลังซ่อม"
                    style={{ width: "100%", height: "auto", borderRadius: "var(--radius-sm)", marginTop: 8 }}
                  />
                )}
              </div>
            </>
          )}

          {action?.mode === "edit" && (
            <>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="editZone">อาคาร/พื้นที่</label>
                  <select
                    id="editZone"
                    value={editForm.groupId}
                    onChange={(event) => {
                      const zone = zones.find((item) => item.groupId === event.target.value)
                      setEditForm((prev) => ({
                        ...prev,
                        groupId: event.target.value,
                        zone: zone?.name ?? prev.zone,
                      }))
                    }}
                  >
                    <option value="">เลือกอาคาร/พื้นที่</option>
                    {zones.map((zone) => (
                      <option key={zone.groupId} value={zone.groupId}>{zone.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="editAssignee">ผู้รับผิดชอบ</label>
                  <select id="editAssignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    <option value="">ไม่มอบหมาย</option>
                    {staffList.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="editCategory">ประเภทงาน</label>
                  <select
                    id="editCategory"
                    value={editForm.category}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    <option value="">ไม่ระบุ</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="editRisk">ความเร่งด่วน</label>
                  <select
                    id="editRisk"
                    value={editForm.riskLevel}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, riskLevel: event.target.value }))}
                  >
                    <option value="">ไม่ระบุ</option>
                    {urgencyLevels.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="editLocation">รายละเอียดจุดที่พบ</label>
                <input
                  id="editLocation"
                  type="text"
                  value={editForm.locationDetail}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, locationDetail: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="editSuggestion">ข้อเสนอแนะเพิ่มเติม</label>
                <textarea
                  id="editSuggestion"
                  rows={2}
                  value={editForm.suggestion}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, suggestion: event.target.value }))}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="editReporterName">ชื่อผู้แจ้ง</label>
                  <input
                    id="editReporterName"
                    type="text"
                    value={editForm.reporterName}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, reporterName: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="editReporterPhone">เบอร์โทร</label>
                  <input
                    id="editReporterPhone"
                    type="text"
                    value={editForm.reporterPhone}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, reporterPhone: event.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="editReporterEmail">อีเมล</label>
                <input
                  id="editReporterEmail"
                  type="email"
                  value={editForm.reporterEmail}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, reporterEmail: event.target.value }))}
                />
              </div>
            </>
          )}

          {action?.mode === "delete" && (
            <p>
              ต้องการลบรายการ <strong>{action.issue.id}</strong> ({action.issue.zone}) ใช่หรือไม่?
              การลบจะลบรูปก่อน/หลังซ่อมและไม่สามารถย้อนกลับได้
            </p>
          )}

          {action?.mode === "history" && (
            <>
              {eventsLoading ? (
                <p className="field-help">กำลังโหลดประวัติ...</p>
              ) : events.length === 0 ? (
                <p className="field-help">ยังไม่มีประวัติสำหรับรายการนี้</p>
              ) : (
                <ol className="timeline">
                  {events.map((event) => (
                    <li key={event.id}>
                      <strong>{eventLabel(event.action)}</strong>
                      {event.fromStatus || event.toStatus ? (
                        <span>
                          {" "}
                          {event.fromStatus ? STATUS_LABELS[event.fromStatus] ?? event.fromStatus : "-"}
                          {" → "}
                          {event.toStatus ? STATUS_LABELS[event.toStatus] ?? event.toStatus : "-"}
                        </span>
                      ) : null}
                      <div className="field-help">
                        {event.staffName || "ระบบ"} • {new Date(event.createdAt).toLocaleString("th-TH")}
                      </div>
                      {event.note && <p>{event.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-ghost btn-sm" type="button" onClick={closeAction}>
            {action?.mode === "history" ? "ปิด" : "ยกเลิก"}
          </button>
          {action?.mode === "status" && canEdit && (
            <button className="btn btn-primary btn-sm" type="button" onClick={() => void handleStatusSubmit()} disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึกสถานะ"}
            </button>
          )}
          {action?.mode === "edit" && canEdit && (
            <button className="btn btn-primary btn-sm" type="button" onClick={() => void handleEditSubmit()} disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          )}
          {action?.mode === "delete" && isAdmin && (
            <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDelete()} disabled={busy}>
              {busy ? "กำลังลบ..." : "ยืนยันลบ"}
            </button>
          )}
        </Modal.Footer>
      </Modal>
    </section>
  )
}

export default TrackerPage
