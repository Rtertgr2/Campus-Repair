import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Modal } from "react-bootstrap"
import {
  api,
  BUILDINGS,
  CATEGORIES,
  Issue,
  IssueFilters,
  IssuePage,
  RISK_LEVELS,
  STATUS_CLOSED,
  STATUS_PENDING,
} from "../../lib/api"
import { useStaff } from "../../lib/staff-context"
import { downscaleImage } from "../../lib/image"
import { filtersToQuery } from "../../lib/query"

type ActionMode = "close" | "reopen" | "edit"

/** แสดงสถานะด้วยถ้อยคำงานซ่อม โดยยังใช้ค่าจริงจาก backend ในการเรียก API */
const statusLabel = (status: string) =>
  status === STATUS_CLOSED ? "ซ่อมเสร็จแล้ว" : status === STATUS_PENDING ? "รอซ่อม" : status

const PAGE_SIZE = 10

const emptyFilters: IssueFilters = {
  search: "",
  zone: "",
  category: "",
  status: "",
  riskLevel: "",
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: PAGE_SIZE,
  overdueOnly: false,
}

const TrackerPage: React.FC = () => {
  const { isStaff, name, pin, login } = useStaff()

  const [filters, setFilters] = useState<IssueFilters>(emptyFilters)
  const [searchInput, setSearchInput] = useState("")
  const [page, setPage] = useState<IssuePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const [action, setAction] = useState<{ mode: ActionMode; issue: Issue } | null>(null)
  const [pinInput, setPinInput] = useState("")
  const [formError, setFormError] = useState("")
  const [staffNote, setStaffNote] = useState("")
  const [afterPhoto, setAfterPhoto] = useState<{ dataUrl: string; name: string } | null>(null)

  // ------------------------------------------------------------ โหลดข้อมูล
  const loadIssues = useCallback(async (next: IssueFilters) => {
    setLoading(true)
    setLoadError("")
    try {
      setPage(await api.listIssues(next, pin ?? undefined))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [pin])

  useEffect(() => {
    void loadIssues(filters)
  }, [filters, loadIssues])

  // หน่วงการค้นหา เพื่อไม่ยิง API ทุกตัวอักษร
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) =>
        prev.search === searchInput ? prev : { ...prev, search: searchInput, page: 1 },
      )
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const update = (patch: Partial<IssueFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }))

  const issues = page?.issues ?? []
  const stats = page?.stats
  const totalPages = page?.pages ?? 1

  const printQuery = useMemo(() => filtersToQuery(filters), [filters])

  const showsResultForm = action?.mode === "close" || action?.mode === "edit"
  const modalTitle = action
    ? { edit: "แก้ไขผลการซ่อม", close: "บันทึกผลการซ่อม", reopen: "เปิดงานซ่อมอีกครั้ง" }[action.mode]
    : ""
  const submitLabel = action
    ? { edit: "บันทึกการแก้ไข", close: "ยืนยันซ่อมเสร็จ", reopen: "ยืนยันเปิดงานซ่อม" }[action.mode]
    : ""

  // ---------------------------------------------------------------- actions
  const openAction = (issue: Issue, mode?: ActionMode) => {
    const next = mode ?? (issue.status === STATUS_CLOSED ? "reopen" : "close")
    setAction({ mode: next, issue })
    setPinInput("")
    setFormError("")
    setStaffNote(next === "edit" ? issue.staffNote ?? "" : "")
    setAfterPhoto(null)
  }

  const closeAction = () => {
    setAction(null)
    setFormError("")
  }

  const handleAfterPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (loadEvent) => {
      const dataUrl = loadEvent.target?.result as string
      const resized = await downscaleImage(dataUrl)
      setAfterPhoto({ dataUrl: resized, name: file.name.replace(/\.[^.]+$/, "") })
    }
    reader.readAsDataURL(file)
  }

  const submitAction = async () => {
    if (!action) return

    if (!isStaff && !/^\d{4}$/.test(pinInput)) {
      setFormError("กรุณากรอกรหัส PIN เจ้าหน้าที่ 4 หลัก")
      return
    }
    if (action.mode === "close" && !staffNote.trim()) {
      setFormError("กรุณากรอกหมายเหตุการซ่อมก่อนแจ้งว่าซ่อมเสร็จ")
      return
    }

    setUpdatingId(action.issue.id)
    try {
      if (!isStaff) {
        const ok = await login("", pinInput)
        if (!ok) {
          setFormError("รหัส PIN ไม่ถูกต้อง")
          return
        }
      }

      const isEdit = action.mode === "edit"
      const isClose = action.mode === "close"
      const updated = await api.updateStatus({
        pin: isStaff ? (pin as string) : pinInput,
        rowIndex: action.issue.rowIndex,
        status: isEdit ? action.issue.status : isClose ? STATUS_CLOSED : STATUS_PENDING,
        staffName: isStaff ? name || "เจ้าหน้าที่" : name || "",
        ...(showsResultForm
          ? {
              staffNote: staffNote.trim(),
              afterPhotoDataUrl: afterPhoto?.dataUrl,
              afterPhotoName: afterPhoto?.name,
            }
          : {}),
        ...(isEdit ? { edit: true } : {}),
      })

      setPage((prev) =>
        prev
          ? {
              ...prev,
              issues: prev.issues.map((item) =>
                item.rowIndex === updated.rowIndex ? updated : item,
              ),
            }
          : prev,
      )
      let text = `เปิดงานซ่อม ${updated.id} อีกครั้ง`
      if (isEdit) {
        text = `บันทึกการแก้ไข ${updated.id} แล้ว${updated.afterPhoto ? " พร้อมภาพหลังซ่อม" : ""}`
      } else if (isClose) {
        text = `บันทึกว่าซ่อมเสร็จ ${updated.id} แล้ว พร้อมหมายเหตุการซ่อม${updated.afterPhoto ? "และภาพหลังซ่อม" : ""}`
      }
      setMessage({ variant: "success", text })
      closeAction()
      void loadIssues(filters)
    } catch (err) {
      setFormError("บันทึกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setUpdatingId(null)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setMessage(null)
    try {
      const result = await api.exportIssues(filters, pin ?? undefined)
      if (result.rows === 0) {
        setMessage({ variant: "warning", text: "ไม่มีรายการให้ส่งออกตามตัวกรองนี้" })
        return
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMessage({ variant: "success", text: `ส่งออก ${result.rows} รายการเป็น CSV แล้ว` })
    } catch (err) {
      setMessage({
        variant: "danger",
        text: "ส่งออกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)),
      })
    } finally {
      setExporting(false)
    }
  }

  const handleCleanup = async () => {
    if (!pin) return
    setMessage(null)
    try {
      const preview = await api.cleanupPhotos(pin, true)
      if (preview.deleted.length === 0) {
        setMessage({ variant: "warning", text: "ไม่มีไฟล์รูปที่ตกค้างให้ลบ" })
        return
      }
      const confirmed = window.confirm(
        `พบไฟล์รูปที่ไม่มีในฐานข้อมูล ${preview.deleted.length} ไฟล์ (เก่ากว่า ${preview.maxAgeHours} ชั่วโมง)\nต้องการลบเลยหรือไม่?`,
      )
      if (!confirmed) {
        setMessage({ variant: "warning", text: "ยกเลิกการลบไฟล์รูปแล้ว" })
        return
      }
      const result = await api.cleanupPhotos(pin, false)
      setMessage({ variant: "success", text: `ลบไฟล์รูปตกค้าง ${result.deleted.length} ไฟล์แล้ว` })
    } catch (err) {
      setMessage({
        variant: "danger",
        text: "ล้างไฟล์รูปไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)),
      })
    }
  }

  const filtersActive =
    Boolean(filters.search || filters.zone || filters.category || filters.status || filters.riskLevel || filters.dateFrom || filters.dateTo || filters.overdueOnly)

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          ติดตามงานซ่อม
        </p>
        <h1>ติดตามงานซ่อม (Repair Tracker)</h1>
        <p className="lede">
          ค้นหาและกรองงานซ่อม บันทึกผลการซ่อมพร้อมหมายเหตุและภาพหลังซ่อม
          หรือเปิดงานซ่อมอีกครั้งหากยังไม่เรียบร้อย
        </p>
      </div>

      <div className="workspace wrap">
        <div className="workspace-grid single">
          <div className="panel">
            <div className="list-head">
              <div>
                <h2>รายการแจ้งซ่อม</h2>
                <p className="field-help">
                  อัตราซ่อมเสร็จ {stats?.closureRate ?? 0}%
                  {stats?.avgRepairDays ? ` • ซ่อมเฉลี่ย ${stats.avgRepairDays} วัน` : ""}
                </p>
              </div>
              <div className="stat-strip" aria-label="สรุปรายการ">
                <span className="od-stat">
                  <span className="stat-num">{stats?.total ?? 0}</span>
                  <span className="stat-cap">ทั้งหมด</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{stats?.pending ?? 0}</span>
                  <span className="stat-cap">รอซ่อม</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{stats?.closed ?? 0}</span>
                  <span className="stat-cap">ซ่อมเสร็จแล้ว</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num stat-num-danger">{stats?.overdue ?? 0}</span>
                  <span className="stat-cap">เลยกำหนด</span>
                </span>
              </div>
            </div>

            {message && (
              <p
                className={`form-summary${message.variant === "success" ? " success" : ""}`}
                role="alert"
              >
                {message.text}
              </p>
            )}

            {loadError && (
              <p className="form-summary" role="alert">
                โหลดรายการไม่สำเร็จ: {loadError}
              </p>
            )}

            <div className="filter-bar">
              <div className="filter-search">
                <label className="visually-hidden" htmlFor="trackerSearch">
                  ค้นหา
                </label>
                <input
                  id="trackerSearch"
                  type="text"
                  placeholder={
                    isStaff
                      ? "ค้นหาเลขงาน อาคาร ห้อง ผู้แจ้ง หรืออาการเสีย"
                      : "ค้นหาเลขงาน อาคาร ห้อง หรืออาการเสีย"
                  }
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>

              <div className="filter-row">
                <select
                  aria-label="กรองตามอาคาร"
                  value={filters.zone}
                  onChange={(event) => update({ zone: event.target.value })}
                >
                  <option value="">ทุกอาคาร</option>
                  {BUILDINGS.map((building) => (
                    <option key={building.id} value={building.zone}>
                      {building.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="กรองตามประเภทงาน"
                  value={filters.category}
                  onChange={(event) => update({ category: event.target.value })}
                >
                  <option value="">ทุกประเภทงาน</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="กรองตามความเร่งด่วน"
                  value={filters.riskLevel}
                  onChange={(event) => update({ riskLevel: event.target.value })}
                >
                  <option value="">ทุกระดับความเร่งด่วน</option>
                  {RISK_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>

                <label className="filter-date">
                  <span>ตั้งแต่</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) => update({ dateFrom: event.target.value })}
                  />
                </label>

                <label className="filter-date">
                  <span>ถึง</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) => update({ dateTo: event.target.value })}
                  />
                </label>
              </div>

              <div className="chips">
                <button
                  className="chip"
                  type="button"
                  aria-pressed={!filters.status}
                  onClick={() => update({ status: "", overdueOnly: false })}
                >
                  ทั้งหมด
                </button>
                <button
                  className="chip"
                  type="button"
                  aria-pressed={filters.status === STATUS_PENDING}
                  onClick={() => update({ status: STATUS_PENDING })}
                >
                  รอซ่อม
                </button>
                <button
                  className="chip"
                  type="button"
                  aria-pressed={filters.status === STATUS_CLOSED}
                  onClick={() => update({ status: STATUS_CLOSED })}
                >
                  ซ่อมเสร็จแล้ว
                </button>
                <button
                  className="chip"
                  type="button"
                  aria-pressed={filters.overdueOnly}
                  onClick={() => update({ overdueOnly: !filters.overdueOnly, status: STATUS_PENDING })}
                >
                  เฉพาะเลยกำหนด
                </button>

                <span className="chip-spacer" />

                <button className="chip" type="button" onClick={() => void loadIssues(filters)} disabled={loading}>
                  {loading ? "กำลังโหลด..." : "↻ รีเฟรช"}
                </button>
                <button className="chip" type="button" onClick={handleExport} disabled={exporting}>
                  {exporting ? "กำลังส่งออก..." : "⭳ CSV"}
                </button>
                <Link className="chip" to={`/print${printQuery}`} target="_blank" rel="noreferrer">
                  🖨 พิมพ์รายงาน
                </Link>
                {isStaff && (
                  <button className="chip" type="button" onClick={handleCleanup}>
                    🧹 ล้างรูปตกค้าง
                  </button>
                )}
                {filtersActive && (
                  <button
                    className="chip"
                    type="button"
                    onClick={() => {
                      setSearchInput("")
                      setFilters(emptyFilters)
                    }}
                  >
                    ✕ ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>

            <div className="report-list">
              {loading && issues.length === 0 ? (
                <div className="empty">
                  <h3>กำลังโหลดรายการ...</h3>
                </div>
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
                      <span
                        className="report-status"
                        data-status={issue.status === STATUS_CLOSED ? "done" : "open"}
                      >
                        {statusLabel(issue.status)}
                        {issue.status === STATUS_CLOSED && (
                          <span className="report-tick" aria-hidden="true">✓</span>
                        )}
                      </span>
                      <span className="report-status report-status-risk">{issue.riskLevel || "-"}</span>
                      {issue.overdueDays > 0 && (
                        <span className="badge-overdue">เลยกำหนด {issue.overdueDays} วัน</span>
                      )}
                    </div>

                    <h3 className="report-loc">
                      {issue.zone || issue.groupId}
                      {issue.room ? ` • ห้อง ${issue.room}` : ""}
                    </h3>

                    {issue.locationDetail && <p className="report-detail">{issue.locationDetail}</p>}
                    {issue.suggestion && (
                      <p className="report-detail report-detail-muted">ข้อเสนอแนะ: {issue.suggestion}</p>
                    )}
                    {isStaff && issue.reporterName && (
                      <p className="report-reporter">
                        ผู้แจ้ง: {issue.reporterName}
                        {issue.reporterContact ? ` • ติดต่อ ${issue.reporterContact}` : ""}
                      </p>
                    )}
                    {issue.staffNote && <p className="report-detail">หมายเหตุ: {issue.staffNote}</p>}

                    {issue.history.length > 0 && (
                      <details className="history">
                        <summary>ประวัติ ({issue.history.length})</summary>
                        <ul>
                          {issue.history.map((entry, index) => (
                            <li key={`${issue.id}-h${index}`}>
                              <span className="history-time">{entry.createdAt}</span>
                              <span className="history-text">
                                {entry.fromStatus ? `${entry.fromStatus} → ` : "สร้างงาน → "}
                                <strong>{entry.toStatus}</strong>
                                {entry.staffName ? ` • ${entry.staffName}` : ""}
                                {entry.note ? ` • ${entry.note}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="report-foot">
                      <span className="report-time">
                        {issue.id} • บันทึก {issue.createdDate}
                        {issue.closedDate
                          ? ` • ซ่อมเสร็จ ${issue.closedDate}`
                          : ` • ครบกำหนด ${issue.dueDate}`}
                      </span>
                      <div className="report-actions">
                        {issue.beforePhoto && (
                          <a className="report-action" href={issue.beforePhoto} target="_blank" rel="noreferrer">
                            ภาพก่อนซ่อม
                          </a>
                        )}
                        {issue.afterPhoto && (
                          <a className="report-action" href={issue.afterPhoto} target="_blank" rel="noreferrer">
                            ภาพหลังซ่อม
                          </a>
                        )}
                        <Link className="report-action" to={`/print?id=${issue.id}`} target="_blank" rel="noreferrer">
                          ใบงาน
                        </Link>
                        {isStaff && (
                          <button
                            className="report-action"
                            type="button"
                            disabled={updatingId === issue.id}
                            onClick={() => openAction(issue, "edit")}
                          >
                            ✏ แก้ไขผลการซ่อม
                          </button>
                        )}
                        <button
                          className="report-action"
                          type="button"
                          disabled={updatingId === issue.id}
                          onClick={() => openAction(issue)}
                        >
                          {updatingId === issue.id
                            ? "กำลังอัปเดต..."
                            : issue.status === STATUS_CLOSED
                              ? "↺ ยังไม่เรียบร้อย"
                              : "✓ ซ่อมเสร็จ"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <nav className="pager" aria-label="แบ่งหน้า">
                <button
                  className="chip"
                  type="button"
                  disabled={(page?.page ?? 1) <= 1 || loading}
                  onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))}
                >
                  ← ก่อนหน้า
                </button>
                <span className="pager-info">
                  หน้า {page?.page ?? 1} / {totalPages} • {page?.total ?? 0} รายการ
                </span>
                <button
                  className="chip"
                  type="button"
                  disabled={(page?.page ?? 1) >= totalPages || loading}
                  onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                >
                  ถัดไป →
                </button>
              </nav>
            )}

            {!isStaff && (
              <p className="field-help" style={{ marginTop: "var(--space-2)" }}>
                การบันทึกผลการซ่อมต้องยืนยันรหัส PIN เจ้าหน้าที่
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal show={!!action} onHide={closeAction} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {modalTitle}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {action && (
            <p className="field-help" style={{ marginBottom: 12 }}>
              {action.issue.id} • {action.issue.zone}
              {action.issue.room ? ` • ห้อง ${action.issue.room}` : ""} • {action.issue.category}
            </p>
          )}

          {isStaff && showsResultForm && (
            <p className="field-help" style={{ marginBottom: 12 }}>
              บันทึกในนาม: <strong>{name || "เจ้าหน้าที่"}</strong>
            </p>
          )}

          {formError && (
            <p className="form-summary" role="alert">
              {formError}
            </p>
          )}

          {showsResultForm && (
            <>
              <div className="field">
                <label htmlFor="formStaffNote">หมายเหตุการซ่อม</label>
                <textarea
                  id="formStaffNote"
                  rows={2}
                  value={staffNote}
                  onChange={(event) => setStaffNote(event.target.value)}
                  placeholder="เช่น ซ่อมเสร็จโดยทีมงานอาคารสถานที่"
                />
              </div>

              <div className="field">
                <label htmlFor="formAfterPhoto">
                  ภาพหลังซ่อม (ไม่บังคับ)
                  {action?.mode === "edit" && action.issue.afterPhoto && !afterPhoto && (
                    <span className="field-help" style={{ marginLeft: 8 }}>
                      (มีรูปเดิมอยู่แล้ว — เลือกไฟล์ใหม่เพื่อแทนที่)
                    </span>
                  )}
                </label>
                {action?.mode === "edit" && action.issue.afterPhoto && !afterPhoto && (
                  <img
                    src={action.issue.afterPhoto}
                    alt="หลังซ่อม (เดิม)"
                    style={{ width: "100%", height: "auto", borderRadius: "var(--radius-sm)", marginBottom: 8 }}
                  />
                )}
                <input
                  id="formAfterPhoto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleAfterPhotoChange}
                />
                {afterPhoto && (
                  <img
                    src={afterPhoto.dataUrl}
                    alt="หลังซ่อม"
                    style={{ width: "100%", height: "auto", borderRadius: "var(--radius-sm)", marginTop: 8 }}
                  />
                )}
              </div>
            </>
          )}

          {!isStaff && (
            <div className="field">
              <label htmlFor="formPin">รหัส PIN เจ้าหน้าที่</label>
              <input
                id="formPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-ghost btn-sm" type="button" onClick={closeAction}>
            ยกเลิก
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={submitAction}
            disabled={updatingId !== null}
          >
            {updatingId !== null ? "กำลังบันทึก..." : submitLabel}
          </button>
        </Modal.Footer>
      </Modal>
    </section>
  )
}

export default TrackerPage
