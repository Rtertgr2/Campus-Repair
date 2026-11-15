import React, { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Modal } from "react-bootstrap"
import { api, BUILDINGS, CATEGORIES, DUE_DAYS_BY_RISK, RISK_LEVELS } from "../../lib/api"
import { downscaleImage } from "../../lib/image"

interface IssueFormData {
  groupId: string
  zone: string
  room: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterContact: string
  website: string
  photoBase64?: string
  photoName?: string
}

const emptyForm: IssueFormData = {
  groupId: "",
  zone: "",
  room: "",
  category: "",
  riskLevel: "",
  locationDetail: "",
  suggestion: "",
  reporterName: "",
  reporterContact: "",
  website: "",
  photoBase64: undefined,
  photoName: undefined,
}

const AuditPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [formData, setFormData] = useState<IssueFormData>(emptyForm)

  const [showPhotoPreview, setShowPhotoPreview] = useState(false)
  const [previewImage, setPreviewImage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)

  // ลิงก์จากป้าย QR: /audit?zone=B01&room=301&category=...
  // เติมอาคาร/ห้องให้อัตโนมัติ ผู้แจ้งไม่ต้องเลือกเอง
  useEffect(() => {
    const zoneParam = searchParams.get("zone") ?? ""
    const roomParam = searchParams.get("room") ?? ""
    const categoryParam = searchParams.get("category") ?? ""
    if (!zoneParam && !roomParam && !categoryParam) return

    const building =
      BUILDINGS.find((item) => item.id === zoneParam) ??
      BUILDINGS.find((item) => item.zone === zoneParam)

    setFormData((prev) => ({
      ...prev,
      groupId: building ? building.id : prev.groupId,
      zone: building ? building.zone : zoneParam || prev.zone,
      room: roomParam || prev.room,
      category: CATEGORIES.includes(categoryParam) ? categoryParam : prev.category,
    }))
  }, [searchParams])

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (loadEvent) => {
      const base64String = loadEvent.target?.result as string
      const resized = await downscaleImage(base64String)

      setFormData((prev) => ({
        ...prev,
        photoBase64: resized,
        photoName: file.name.replace(/\.[^.]+$/, ""),
      }))
      setPreviewImage(resized)
      setShowPhotoPreview(true)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.groupId || !formData.zone) {
      setMessage({ variant: "warning", text: "กรุณาเลือกอาคาร/พื้นที่ที่พบปัญหา" })
      return
    }
    if (!formData.reporterName.trim()) {
      setMessage({ variant: "warning", text: "กรุณากรอกชื่อผู้แจ้ง เพื่อให้ทีมช่างติดต่อกลับได้" })
      return
    }

    setSubmitting(true)
    try {
      const issue = await api.createIssue({
        groupId: formData.groupId,
        zone: formData.zone,
        room: formData.room,
        category: formData.category,
        riskLevel: formData.riskLevel,
        locationDetail: formData.locationDetail,
        suggestion: formData.suggestion,
        reporterName: formData.reporterName.trim(),
        reporterContact: formData.reporterContact.trim(),
        beforePhotoDataUrl: formData.photoBase64,
        website: formData.website,
      })

      setMessage({
        variant: "success",
        text:
          `แจ้งซ่อมสำเร็จ! หมายเลขงาน: ${issue.id}` +
          ` • ครบกำหนดติดตาม ${issue.dueDate}` +
          (issue.beforePhoto ? " • แนบรูปภาพเรียบร้อย" : ""),
      })

      setFormData(emptyForm)
      setShowPhotoPreview(false)
      setPreviewImage("")
    } catch (err) {
      setMessage({
        variant: "danger",
        text: "แจ้งซ่อมไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const dueDays = formData.riskLevel ? DUE_DAYS_BY_RISK[formData.riskLevel] : undefined

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          แจ้งซ่อม
        </p>
        <h1>แจ้งซ่อมสถานที่ (Repair Request)</h1>
        <p className="lede">
          เลือกอาคารและจุดที่พบ ระบุประเภทงานซ่อมและความเร่งด่วน พร้อมแนบรูปถ่าย
          เพื่อให้ทีมช่างเข้าซ่อมได้ตรงจุด — ความเร่งด่วนกำหนดวันครบกำหนดให้อัตโนมัติ
        </p>
      </div>

      <div className="workspace wrap">
        <div className="workspace-grid single">
          <div className="panel form-panel">
            <div className="panel-head">
              <h2>รายละเอียดงานซ่อม</h2>
              <p>กรอกข้อมูลสั้น ๆ แล้วกดส่งเรื่อง ระบบจะคำนวณวันครบกำหนดติดตามให้อัตโนมัติ</p>
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
                <label htmlFor="formWebsite">Website</label>
                <input
                  id="formWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.website}
                  onChange={(event) => setFormData({ ...formData, website: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formGroupId">
                  อาคาร/พื้นที่ <span className="req" aria-hidden="true">*</span>
                </label>
                <select
                  id="formGroupId"
                  value={formData.groupId}
                  onChange={(event) => {
                    const zone =
                      event.target.options[event.target.selectedIndex].getAttribute("data-zone") || ""
                    setFormData((prev) => ({ ...prev, groupId: event.target.value, zone }))
                  }}
                >
                  <option value="">เลือกอาคาร/พื้นที่</option>
                  {BUILDINGS.map((building) => (
                    <option key={building.id} data-zone={building.zone} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="formRoom">ห้อง/จุดที่พบ (ไม่บังคับ)</label>
                <input
                  id="formRoom"
                  type="text"
                  placeholder="เช่น 301, ห้องน้ำชายชั้น 1"
                  value={formData.room}
                  onChange={(event) => setFormData({ ...formData, room: event.target.value })}
                />
              </div>

              <fieldset className="field">
                <legend>ประเภทงานซ่อม</legend>
                <div className="type-grid three">
                  {CATEGORIES.map((category) => (
                    <label className="type-option" key={category}>
                      <input
                        type="radio"
                        name="category"
                        value={category}
                        checked={formData.category === category}
                        onChange={() => setFormData({ ...formData, category })}
                      />
                      <span>{category}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="field">
                <legend>ความเร่งด่วน</legend>
                <div className="type-grid three">
                  {RISK_LEVELS.map((level) => (
                    <label className="type-option" key={level}>
                      <input
                        type="radio"
                        name="riskLevel"
                        value={level}
                        checked={formData.riskLevel === level}
                        onChange={() => setFormData({ ...formData, riskLevel: level })}
                      />
                      <span>{level}</span>
                    </label>
                  ))}
                </div>
                <p className="field-help">
                  {dueDays
                    ? `ความเร่งด่วนระดับนี้: ครบกำหนดติดตามใน ${dueDays} วัน`
                    : "สูง = 3 วัน • ปานกลาง = 7 วัน • ต่ำ = 30 วัน"}
                </p>
              </fieldset>

              <div className="field">
                <label htmlFor="formLocation">รายละเอียดจุดที่พบ</label>
                <p className="field-help">เช่น หลอดไฟห้อง 204 ดับ 2 ดวง</p>
                <input
                  id="formLocation"
                  type="text"
                  placeholder="ระบุตำแหน่ง/อาการเสียของสิ่งที่ชำรุด"
                  value={formData.locationDetail}
                  onChange={(event) => setFormData({ ...formData, locationDetail: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formSuggestion">ข้อเสนอแนะเพิ่มเติม</label>
                <textarea
                  id="formSuggestion"
                  rows={2}
                  placeholder="เช่น ต้องการให้ตรวจสอบก่อนเปิดใช้งาน"
                  value={formData.suggestion}
                  onChange={(event) => setFormData({ ...formData, suggestion: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formReporterName">
                  ชื่อผู้แจ้ง <span className="req" aria-hidden="true">*</span>
                </label>
                <p className="field-help">ใช้ติดต่อกลับเมื่อต้องเข้าห้องหรือสอบถามเพิ่มเติม</p>
                <input
                  id="formReporterName"
                  type="text"
                  autoComplete="name"
                  placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"
                  value={formData.reporterName}
                  onChange={(event) => setFormData({ ...formData, reporterName: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formReporterContact">ช่องทางติดต่อ (ไม่บังคับ)</label>
                <p className="field-help">
                  เบอร์โทรหรือ LINE — แสดงเฉพาะเจ้าหน้าที่ ไม่แสดงบนหน้าสาธารณะ
                </p>
                <input
                  id="formReporterContact"
                  type="text"
                  placeholder="เช่น 08x-xxx-xxxx"
                  value={formData.reporterContact}
                  onChange={(event) => setFormData({ ...formData, reporterContact: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formPhoto">รูปถ่ายสภาพก่อนซ่อม</label>
                <input
                  id="formPhoto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                />
                <p className="field-help">
                  {formData.photoBase64
                    ? "รูปภาพถูกย่อขนาดแล้ว พร้อมอัปโหลด"
                    : "ถ่ายรูปเพื่ออัปโหลด (จะถูกย่อขนาดอัตโนมัติ)"}
                </p>
              </div>

              <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
                {submitting ? "กำลังส่งเรื่อง..." : "ส่งเรื่องแจ้งซ่อม"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <Modal
        show={!!formData.photoBase64 && showPhotoPreview}
        onHide={() => setShowPhotoPreview(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>ภาพถ่ายสภาพก่อนซ่อม</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <img
            src={previewImage}
            alt="Preview"
            style={{ width: "100%", height: "auto", borderRadius: "var(--radius-sm)" }}
          />
        </Modal.Body>
      </Modal>
    </section>
  )
}

export default AuditPage
