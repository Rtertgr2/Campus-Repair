import React, { useEffect, useState } from "react"
import { Modal } from "react-bootstrap"
import { api, Zone } from "../../lib/api"
import { downscaleImage } from "../../lib/image"

const FALLBACK_ZONES: Zone[] = [
  { id: 1, groupId: "B01", name: "อาคารเรียน 1", detail: "ห้องเรียนและห้องปฏิบัติการ", active: true, sortOrder: 10 },
  { id: 2, groupId: "B02", name: "อาคารเรียน 2", detail: "ห้องเรียนและห้องพักครู", active: true, sortOrder: 20 },
  { id: 3, groupId: "B03", name: "อาคารอเนกประสงค์", detail: "ห้องประชุมและกิจกรรม", active: true, sortOrder: 30 },
  { id: 4, groupId: "B04", name: "โรงอาหาร", detail: "พื้นที่รับประทานอาหาร", active: true, sortOrder: 40 },
  { id: 5, groupId: "B05", name: "หอสมุด", detail: "ห้องอ่านหนังสือและคอมพิวเตอร์", active: true, sortOrder: 50 },
]

interface IssueFormData {
  groupId: string
  zone: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  reporterName: string
  reporterPhone: string
  reporterEmail: string
  photoBase64?: string
  /** Honeypot: hidden from humans, filled by bots. */
  website: string
}

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

const emptyForm: IssueFormData = {
  groupId: "",
  zone: "",
  category: "",
  riskLevel: "",
  locationDetail: "",
  suggestion: "",
  reporterName: "",
  reporterPhone: "",
  reporterEmail: "",
  photoBase64: undefined,
  website: "",
}

const AuditPage: React.FC = () => {
  const [formData, setFormData] = useState<IssueFormData>(emptyForm)
  const [zones, setZones] = useState<Zone[]>(FALLBACK_ZONES)
  const [showPhotoPreview, setShowPhotoPreview] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listZones()
      .then((items) => {
        const active = items.filter((zone) => zone.active)
        if (!cancelled && active.length > 0) setZones(active)
      })
      .catch(() => {
        /* keep the built-in list when the API is not reachable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64String = event.target?.result as string
      const resized = await downscaleImage(base64String)
      setFormData((prev) => ({ ...prev, photoBase64: resized }))
      setPreviewImage(resized)
      setShowPhotoPreview(true)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.groupId || !formData.zone) {
      setMessage({ variant: "warning", text: "กรุณาเลือกอาคาร/พื้นที่ที่พบปัญหา" })
      return
    }
    if (!formData.reporterName.trim()) {
      setMessage({ variant: "warning", text: "กรุณากรอกชื่อผู้แจ้งเพื่อให้ทีมช่างติดต่อกลับได้" })
      return
    }

    setSubmitting(true)
    try {
      const issue = await api.createIssue({
        groupId: formData.groupId,
        zone: formData.zone,
        category: formData.category,
        riskLevel: formData.riskLevel,
        locationDetail: formData.locationDetail,
        suggestion: formData.suggestion,
        reporterName: formData.reporterName.trim(),
        reporterPhone: formData.reporterPhone.trim(),
        reporterEmail: formData.reporterEmail.trim(),
        beforePhotoDataUrl: formData.photoBase64,
        website: formData.website,
      })

      setMessage({
        variant: "success",
        text:
          `แจ้งซ่อมสำเร็จ! หมายเลขงาน: ${issue.id}` +
          ` • ครบกำหนดติดตาม ${issue.dueDate}` +
          (issue.beforePhoto ? " • แนบรูปกับรายการแล้ว" : ""),
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
          เพื่อให้ทีมช่างเข้าซ่อมได้ตรงจุด
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
              {/* Honeypot: off-screen, never focusable, never announced to users. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inlineSize: 1,
                  blockSize: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                  whiteSpace: "nowrap",
                }}
              >
                <label htmlFor="formWebsite">Website</label>
                <input
                  id="formWebsite"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formGroupId">
                  อาคาร/พื้นที่ <span className="req" aria-hidden="true">*</span>
                </label>
                <select
                  id="formGroupId"
                  value={formData.groupId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      groupId: e.target.value,
                      zone: e.target.options[e.target.selectedIndex].getAttribute("data-zone") || "",
                    }))
                  }
                >
                  <option value="">เลือกอาคาร/พื้นที่</option>
                  {zones.map((zone) => (
                    <option key={zone.groupId} data-zone={zone.name} value={zone.groupId}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="formZone">พื้นที่ที่แจ้ง</label>
                <p className="field-help">ระบบจะเติมชื่ออาคารให้เมื่อเลือกด้านบน</p>
                <input
                  id="formZone"
                  type="text"
                  readOnly
                  value={formData.zone}
                  placeholder="เลือกอาคารเพื่อดูพื้นที่"
                />
              </div>

              <fieldset className="field">
                <legend>ประเภทงานซ่อม</legend>
                <div className="type-grid three">
                  {categories.map((cat) => (
                    <label className="type-option" key={cat}>
                      <input
                        type="radio"
                        name="category"
                        value={cat}
                        checked={formData.category === cat}
                        onChange={() => setFormData({ ...formData, category: cat })}
                      />
                      <span>{cat}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="field">
                <legend>ความเร่งด่วน</legend>
                <div className="type-grid three">
                  {urgencyLevels.map((level) => (
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
              </fieldset>

              <div className="field">
                <label htmlFor="formLocation">รายละเอียดจุดที่พบ</label>
                <p className="field-help">เช่น อาคารเรียน 1 ชั้น 2 ห้อง 204</p>
                <input
                  id="formLocation"
                  type="text"
                  placeholder="ระบุตำแหน่ง/อาการเสียของสิ่งที่ชำรุด"
                  value={formData.locationDetail}
                  onChange={(e) => setFormData({ ...formData, locationDetail: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="formSuggestion">ข้อเสนอแนะเพิ่มเติม</label>
                <textarea
                  id="formSuggestion"
                  rows={3}
                  placeholder="เช่น ต้องการให้ตรวจสอบก่อนเปิดใช้งาน"
                  value={formData.suggestion}
                  onChange={(e) => setFormData({ ...formData, suggestion: e.target.value })}
                />
              </div>

              <fieldset className="field contact-fieldset">
                <legend>ข้อมูลผู้แจ้ง</legend>
                <p className="field-help">
                  ใช้สำหรับให้ทีมช่างติดต่อกลับเมื่อต้องการสอบถามรายละเอียดเพิ่มเติม
                </p>
                <div className="field">
                  <label htmlFor="formReporterName">
                    ชื่อผู้แจ้ง <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="formReporterName"
                    type="text"
                    autoComplete="name"
                    placeholder="ชื่อ-นามสกุล หรือชื่อที่ใช้ติดต่อ"
                    value={formData.reporterName}
                    onChange={(e) => setFormData({ ...formData, reporterName: e.target.value })}
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="formReporterPhone">เบอร์โทร</label>
                    <input
                      id="formReporterPhone"
                      type="text"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="เช่น 0812345678"
                      value={formData.reporterPhone}
                      onChange={(e) => setFormData({ ...formData, reporterPhone: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="formReporterEmail">อีเมล</label>
                    <input
                      id="formReporterEmail"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={formData.reporterEmail}
                      onChange={(e) => setFormData({ ...formData, reporterEmail: e.target.value })}
                    />
                  </div>
                </div>
              </fieldset>

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
                    ? "รูปภาพถูกย่อขนาดแล้ว พร้อมแนบไปกับรายการแจ้งซ่อม"
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

      <Modal show={!!formData.photoBase64 && showPhotoPreview} onHide={() => setShowPhotoPreview(false)} size="lg" centered>
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
