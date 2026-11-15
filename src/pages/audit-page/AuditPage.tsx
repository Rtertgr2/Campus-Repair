import React, { useState } from "react"
import { Modal } from "react-bootstrap"
import { api } from "../../lib/api"
import { downscaleImage } from "../../lib/image"

// Buildings available for repair reports - in a real app this would come from the API
const MOCK_LOCATIONS = [
  { id: "B01", name: "อาคารเรียน 1", zone: "อาคารเรียน 1" },
  { id: "B02", name: "อาคารเรียน 2", zone: "อาคารเรียน 2" },
  { id: "B03", name: "อาคารอเนกประสงค์", zone: "อาคารอเนกประสงค์" },
  { id: "B04", name: "โรงอาหาร", zone: "โรงอาหาร" },
  { id: "B05", name: "หอสมุด", zone: "หอสมุด" },
]

interface IssueFormData {
  groupId: string
  zone: string
  category: string
  riskLevel: string
  locationDetail: string
  suggestion: string
  photoBase64?: string
  photoName?: string
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

const AuditPage: React.FC = () => {
  const [formData, setFormData] = useState<IssueFormData>({
    groupId: "",
    zone: "",
    category: "",
    riskLevel: "",
    locationDetail: "",
    suggestion: "",
    photoBase64: undefined,
    photoName: undefined,
    website: "",
  })

  const [showPhotoPreview, setShowPhotoPreview] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64String = event.target?.result as string
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.groupId || !formData.zone) {
      setMessage({ variant: "warning", text: "กรุณาเลือกอาคาร/พื้นที่ที่พบปัญหา" })
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

      setFormData({
        groupId: "",
        zone: "",
        category: "",
        riskLevel: "",
        locationDetail: "",
        suggestion: "",
        photoBase64: undefined,
        photoName: undefined,
        website: "",
      })
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
                  {MOCK_LOCATIONS.map((location) => (
                    <option key={location.id} data-zone={location.zone} value={location.id}>
                      {location.name}
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

              <div className="field">
                <label htmlFor="formPhoto">รูปถ่ายสภาพก่อนซ่อม</label>
                <input id="formPhoto" type="file" accept="image/*" onChange={handlePhotoChange} />
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
