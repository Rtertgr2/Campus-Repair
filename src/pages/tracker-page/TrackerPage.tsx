import React, { useCallback, useEffect, useState } from "react"
import { Modal } from "react-bootstrap"
import { api, Issue, STATUS_CLOSED, STATUS_PENDING } from "../../lib/api"
import { useStaff } from "../../lib/staff-context"
import { downscaleImage } from "../../lib/image"

type ActionMode = "close" | "reopen"

/** แสดงสถานะด้วยถ้อยคำงานซ่อม โดยยังใช้ค่าจริงจาก backend ในการเรียก API */
const statusLabel = (status: string) =>
  status === STATUS_CLOSED ? "ซ่อมเสร็จแล้ว" : status === STATUS_PENDING ? "รอซ่อม" : status

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

const TrackerPage: React.FC = () => {
  const { isStaff, pin, login } = useStaff()

  const [issues, setIssues] = useState<Issue[]>([])
  const [filterStatus, setFilterStatus] = useState<string>("ทั้งหมด")
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>("")
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [action, setAction] = useState<{ mode: ActionMode; issue: Issue } | null>(null)
  const [pinInput, setPinInput] = useState<string>("")
  const [formError, setFormError] = useState<string>("")
  const [staffNote, setStaffNote] = useState<string>("")
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null)

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      setIssues(await api.listIssues())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIssues()
  }, [loadIssues])

  const totalIssues = issues.length
  const closedCount = issues.filter((issue) => issue.status === STATUS_CLOSED).length
  const closureRate = totalIssues > 0 ? Math.round((closedCount / totalIssues) * 100) : 0

  const filteredIssues =
    filterStatus === "ทั้งหมด" ? issues : issues.filter((issue) => issue.status === filterStatus)

  const openAction = (issue: Issue) => {
    setAction({ mode: issue.status === STATUS_CLOSED ? "reopen" : "close", issue })
    setPinInput("")
    setFormError("")
    setStaffNote("")
    setAfterPhoto(null)
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
        const ok = await login(pinInput)
        if (!ok) {
          setFormError("รหัส PIN ไม่ถูกต้อง")
          return
        }
      }

      const updated = await api.updateStatus({
        pin: isStaff ? (pin as string) : pinInput,
        rowIndex: action.issue.rowIndex,
        status: action.mode === "close" ? STATUS_CLOSED : STATUS_PENDING,
        // Only a closure carries a work note and an after photo; reopening leaves them untouched.
        ...(action.mode === "close"
          ? {
              staffNote: staffNote.trim(),
              afterPhotoDataUrl: afterPhoto ?? undefined,
            }
          : {}),
      })

      setIssues((prev) => prev.map((item) => (item.rowIndex === updated.rowIndex ? updated : item)))
      setMessage({
        variant: "success",
        text:
          action.mode === "close"
            ? `บันทึกว่าซ่อมเสร็จ ${updated.id} แล้ว พร้อมหมายเหตุการซ่อม${updated.afterPhoto ? "และภาพหลังซ่อม" : ""}`
            : `เปิดงานซ่อม ${updated.id} อีกครั้ง`,
      })
      closeAction()
    } catch (err) {
      setFormError("บันทึกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setUpdatingId(null)
    }
  }

  const filters = ["ทั้งหมด", STATUS_PENDING, STATUS_CLOSED]

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          ติดตามงานซ่อม
        </p>
        <h1>ติดตามงานซ่อม (Repair Tracker)</h1>
        <p className="lede">
          ดูสถานะงานซ่อมทุกรายการ บันทึกผลการซ่อมพร้อมหมายเหตุและภาพหลังซ่อม
          หรือเปิดงานซ่อมอีกครั้งหากยังไม่เรียบร้อย
        </p>
      </div>

      <div className="workspace wrap">
        <div className="workspace-grid single">
          <div className="panel">
            <div className="list-head">
              <div>
                <h2>รายการแจ้งซ่อม</h2>
                <p className="field-help">อัตราซ่อมเสร็จ {closureRate}%</p>
              </div>
              <div className="stat-strip" aria-label="สรุปรายการ">
                <span className="od-stat">
                  <span className="stat-num">{totalIssues}</span>
                  <span className="stat-cap">ทั้งหมด</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{totalIssues - closedCount}</span>
                  <span className="stat-cap">รอซ่อม</span>
                </span>
                <span className="od-stat">
                  <span className="stat-num">{closedCount}</span>
                  <span className="stat-cap">ซ่อมเสร็จแล้ว</span>
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

            <div className="chips" role="group" aria-label="กรองรายการ">
              {filters.map((status) => (
                <button
                  className="chip"
                  type="button"
                  key={status}
                  aria-pressed={filterStatus === status}
                  onClick={() => setFilterStatus(status)}
                >
                  {status === "ทั้งหมด" ? "ทั้งหมด" : statusLabel(status)}
                </button>
              ))}
              <button
                className="chip"
                type="button"
                onClick={loadIssues}
                disabled={loading}
                style={{ marginInlineStart: "auto" }}
              >
                {loading ? "กำลังโหลด..." : "↻ รีเฟรช"}
              </button>
            </div>

            <div className="report-list">
              {loading ? (
                <div className="empty">
                  <h3>กำลังโหลดรายการ...</h3>
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="empty">
                  <h3>ไม่มีรายการที่ตรงกับเงื่อนไข</h3>
                  <p>ลองเลือกตัวกรองอื่น หรือแจ้งซ่อมใหม่จากหน้า “แจ้งซ่อม”</p>
                </div>
              ) : (
                filteredIssues.map((issue) => (
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
                      <span className="report-status">{issue.riskLevel || "-"}</span>
                    </div>

                    <h3 className="report-loc">{issue.zone || issue.groupId}</h3>

                    {issue.locationDetail && (
                      <p className="report-detail">{issue.locationDetail}</p>
                    )}
                    {issue.staffNote && (
                      <p className="report-detail">หมายเหตุ: {issue.staffNote}</p>
                    )}

                    <div className="report-foot">
                      <span className="report-time">
                        {issue.id} • บันทึก {issue.createdDate}
                        {issue.closedDate ? ` • ซ่อมเสร็จ ${issue.closedDate}` : ` • ครบกำหนด ${issue.dueDate}`}
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {issue.beforePhoto && (
                          <PhotoThumb
                            path={issue.beforePhoto}
                            thumb={issue.beforePhotoThumb}
                            label="ภาพก่อนซ่อม"
                          />
                        )}
                        {issue.afterPhoto && (
                          <PhotoThumb
                            path={issue.afterPhoto}
                            thumb={issue.afterPhotoThumb}
                            label="ภาพหลังซ่อม"
                          />
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
            {action?.mode === "close" ? "บันทึกผลการซ่อม" : "เปิดงานซ่อมอีกครั้ง"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {action && (
            <p className="field-help" style={{ marginBottom: 12 }}>
              {action.issue.id} • {action.issue.zone} • {action.issue.category}
            </p>
          )}

          {formError && (
            <p className="form-summary" role="alert">
              {formError}
            </p>
          )}

          {action?.mode === "close" && (
            <>
              <div className="field">
                <label htmlFor="formStaffNote">หมายเหตุการซ่อม</label>
                <textarea
                  id="formStaffNote"
                  rows={2}
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  placeholder="เช่น ซ่อมเสร็จโดยทีมงานอาคารสถานที่"
                />
              </div>

              <div className="field">
                <label htmlFor="formAfterPhoto">ภาพหลังซ่อม (ไม่บังคับ)</label>
                <input
                  id="formAfterPhoto"
                  type="file"
                  accept="image/*"
                  onChange={handleAfterPhotoChange}
                />
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

          {!isStaff && (
            <div className="field">
              <label htmlFor="formPin">รหัส PIN เจ้าหน้าที่</label>
              <input
                id="formPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
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
            {updatingId !== null
              ? "กำลังบันทึก..."
              : action?.mode === "close"
                ? "ยืนยันซ่อมเสร็จ"
                : "ยืนยันเปิดงานซ่อม"}
          </button>
        </Modal.Footer>
      </Modal>
    </section>
  )
}

export default TrackerPage
