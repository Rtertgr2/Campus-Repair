import React, { useCallback, useEffect, useState } from "react"
import { api, Assessment, AssessmentSummary, BUILDINGS } from "../../lib/api"
import { useStaff } from "../../lib/staff-context"

interface FormState {
  studentId: string
  studentName: string
  level: string
  groupId: string
  knowledgeCorrect: string
  knowledgeTotal: string
  awarenessPoints: string
  awarenessMax: string
  website: string
}

const emptyForm: FormState = {
  studentId: "",
  studentName: "",
  level: "",
  groupId: "",
  knowledgeCorrect: "0",
  knowledgeTotal: "10",
  awarenessPoints: "0",
  awarenessMax: "12",
  website: "",
}

const LEVELS = ["ปวช.1", "ปวช.2", "ปวช.3", "ปวส.1", "ปวส.2", "อาจารย์", "บุคลากร"]

const emptySummary: AssessmentSummary = {
  total: 0,
  avgKnowledge: 0,
  avgAwareness: 0,
  bestKnowledge: 0,
}

/** หน้าแบบประเมินสาธารณะ + ผลสรุปสำหรับเจ้าหน้าที่ */
const AssessPage: React.FC = () => {
  const { isStaff, pin } = useStaff()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)

  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [summary, setSummary] = useState<AssessmentSummary>(emptySummary)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")

  const loadResults = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const data = await api.listAssessments(pin ?? undefined)
      setAssessments(data.assessments)
      setSummary(data.summary)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [pin])

  useEffect(() => {
    // ผลรายคนเห็นได้เฉพาะเจ้าหน้าที่ — ผู้ใช้ทั่วไปไม่ต้องยิงคำขอนี้
    if (isStaff) void loadResults()
  }, [isStaff, loadResults])

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!form.studentId.trim() || !form.studentName.trim() || !form.groupId) {
      setMessage({ variant: "warning", text: "กรุณากรอกรหัส/ชื่อผู้ประเมินและเลือกอาคาร" })
      return
    }

    setSubmitting(true)
    try {
      const assessment = await api.submitAssessment({
        studentId: form.studentId.trim(),
        studentName: form.studentName.trim(),
        level: form.level,
        groupId: form.groupId,
        knowledgeCorrect: Number(form.knowledgeCorrect) || 0,
        knowledgeTotal: Number(form.knowledgeTotal) || 10,
        awarenessPoints: Number(form.awarenessPoints) || 0,
        awarenessMax: Number(form.awarenessMax) || 12,
        website: form.website,
      })

      setMessage({
        variant: "success",
        text: `บันทึกผลประเมิน ${assessment.id} แล้ว — ความรู้ ${assessment.knowledgePercent}% • จิตสำนึก ${assessment.awarenessPercent}%`,
      })
      setForm(emptyForm)
      if (isStaff) void loadResults()
    } catch (err) {
      setMessage({
        variant: "danger",
        text: "บันทึกผลประเมินไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const buildingName = (groupId: string) =>
    BUILDINGS.find((building) => building.id === groupId)?.name ?? groupId

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          ประเมินความพึงพอใจ
        </p>
        <h1>แบบประเมินความพึงพอใจ</h1>
        <p className="lede">
          ตอบคำถามสั้น ๆ เพื่อให้ทีมอาคารสถานที่นำผลไปปรับปรุงการซ่อมและดูแลสถานที่
          {isStaff ? " — ในโหมดเจ้าหน้าที่จะเห็นผลสรุปของผู้ตอบทั้งหมดด้านล่าง" : ""}
        </p>
      </div>

      <div className="workspace wrap">
        <div className="workspace-grid single">
          <div className="panel">
            <div className="panel-head">
              <h2>ตอบแบบประเมิน</h2>
              <p>ใช้เวลาประมาณหนึ่งนาที ไม่มีการเก็บข้อมูลอื่นนอกจากที่กรอกด้านล่าง</p>
            </div>

            {message && (
              <p
                className={`form-summary${message.variant === "success" ? " success" : ""}`}
                role="alert"
              >
                {message.text}
              </p>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* honeypot: ซ่อนจากผู้ใช้จริง — บอทมักกรอกฟิลด์นี้ */}
              <div
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
              >
                <label htmlFor="assessWebsite">Website</label>
                <input
                  id="assessWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(event) => update({ website: event.target.value })}
                />
              </div>

              <div className="filter-row">
                <div className="field">
                  <label htmlFor="assessStudentId">
                    รหัสผู้ประเมิน <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="assessStudentId"
                    type="text"
                    placeholder="เช่น 65001"
                    value={form.studentId}
                    onChange={(event) => update({ studentId: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="assessStudentName">
                    ชื่อ-นามสกุล <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="assessStudentName"
                    type="text"
                    autoComplete="name"
                    placeholder="เช่น สมชาย ใจดี"
                    value={form.studentName}
                    onChange={(event) => update({ studentName: event.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="assessLevel">ชั้น/สถานะ</label>
                  <select
                    id="assessLevel"
                    value={form.level}
                    onChange={(event) => update({ level: event.target.value })}
                  >
                    <option value="">ไม่ระบุ</option>
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="assessBuilding">
                    อาคารที่ประเมิน <span className="req" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="assessBuilding"
                    value={form.groupId}
                    onChange={(event) => update({ groupId: event.target.value })}
                  >
                    <option value="">เลือกอาคาร</option>
                    {BUILDINGS.map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset className="field">
                <legend>ความรู้ความเข้าใจ (ตอบถูกกี่ข้อ)</legend>
                <div className="filter-row">
                  <div className="field">
                    <label htmlFor="assessKnowledgeCorrect">ตอบถูก</label>
                    <input
                      id="assessKnowledgeCorrect"
                      type="number"
                      min={0}
                      max={Number(form.knowledgeTotal) || 10}
                      value={form.knowledgeCorrect}
                      onChange={(event) => update({ knowledgeCorrect: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="assessKnowledgeTotal">จากจำนวนข้อ</label>
                    <input
                      id="assessKnowledgeTotal"
                      type="number"
                      min={1}
                      max={50}
                      value={form.knowledgeTotal}
                      onChange={(event) => update({ knowledgeTotal: event.target.value })}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="field">
                <legend>จิตสำนึก/การมีส่วนร่วม (ให้คะแนน)</legend>
                <div className="filter-row">
                  <div className="field">
                    <label htmlFor="assessAwarenessPoints">ได้คะแนน</label>
                    <input
                      id="assessAwarenessPoints"
                      type="number"
                      min={0}
                      max={Number(form.awarenessMax) || 12}
                      step="0.5"
                      value={form.awarenessPoints}
                      onChange={(event) => update({ awarenessPoints: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="assessAwarenessMax">จากเต็ม</label>
                    <input
                      id="assessAwarenessMax"
                      type="number"
                      min={1}
                      max={50}
                      step="0.5"
                      value={form.awarenessMax}
                      onChange={(event) => update({ awarenessMax: event.target.value })}
                    />
                  </div>
                </div>
              </fieldset>

              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : "ส่งแบบประเมิน"}
              </button>
            </form>
          </div>

          {isStaff && (
            <div className="panel">
              <div className="list-head">
                <div>
                  <h2>ผลประเมินทั้งหมด</h2>
                  <p className="field-help">
                    {summary.total} รายการ • เฉลี่ยความรู้ {summary.avgKnowledge}% • จิตสำนึก{" "}
                    {summary.avgAwareness}%
                  </p>
                </div>
                <button className="chip" type="button" onClick={() => void loadResults()} disabled={loading}>
                  {loading ? "กำลังโหลด..." : "↻ รีเฟรช"}
                </button>
              </div>

              {loadError && (
                <p className="form-summary" role="alert">
                  โหลดผลประเมินไม่สำเร็จ: {loadError}
                </p>
              )}

              {assessments.length === 0 ? (
                <div className="empty">
                  <h3>ยังไม่มีผู้ตอบแบบประเมิน</h3>
                  <p>เมื่อมีการส่งแบบประเมิน ผลจะแสดงที่นี่พร้อมค่าเฉลี่ย</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>เลขที่</th>
                        <th>ผู้ประเมิน</th>
                        <th>ชั้น</th>
                        <th>อาคาร</th>
                        <th>ความรู้</th>
                        <th>จิตสำนึก</th>
                        <th>เวลา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessments.map((assessment) => (
                        <tr key={assessment.id}>
                          <td>{assessment.id}</td>
                          <td>
                            {assessment.studentName}
                            <span className="cell-muted"> ({assessment.studentId})</span>
                          </td>
                          <td>{assessment.level || "-"}</td>
                          <td>{buildingName(assessment.groupId)}</td>
                          <td>{assessment.knowledgePercent}%</td>
                          <td>{assessment.awarenessPercent}%</td>
                          <td className="cell-muted">{assessment.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default AssessPage
