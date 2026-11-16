import React, { useCallback, useEffect, useState } from "react"
import { Zone } from "../../lib/api"
import { api } from "../../lib/api"
import { useStaff } from "../../lib/staff-context"

interface ZoneForm {
  id?: number
  groupId: string
  name: string
  detail: string
  sortOrder: number
  active: boolean
}

const emptyForm: ZoneForm = {
  groupId: "",
  name: "",
  detail: "",
  sortOrder: 0,
  active: true,
}

const ZonesPage: React.FC = () => {
  const { isStaff, isAdmin, token } = useStaff()
  const [zones, setZones] = useState<Zone[]>([])
  const [form, setForm] = useState<ZoneForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)

  const loadZones = useCallback(async () => {
    setLoading(true)
    try {
      setZones(await api.listZones())
    } catch (err) {
      setMessage({ variant: "danger", text: "โหลดพื้นที่ไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadZones()
  }, [loadZones])

  const startEdit = (zone: Zone) => {
    setForm({
      id: zone.id,
      groupId: zone.groupId,
      name: zone.name,
      detail: zone.detail,
      sortOrder: zone.sortOrder,
      active: zone.active,
    })
    setMessage(null)
  }

  const resetForm = () => setForm(emptyForm)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) return
    if (!form.groupId.trim() || !form.name.trim()) {
      setMessage({ variant: "warning", text: "กรุณากรอกรหัสและชื่ออาคาร/พื้นที่" })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await api.saveZone(token, {
        ...form,
        groupId: form.groupId.trim(),
        name: form.name.trim(),
        detail: form.detail.trim(),
      })
      setMessage({ variant: "success", text: form.id ? "บันทึกการแก้ไขพื้นที่แล้ว" : "เพิ่มพื้นที่ใหม่แล้ว" })
      resetForm()
      await loadZones()
    } catch (err) {
      setMessage({ variant: "danger", text: "บันทึกไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (zone: Zone) => {
    if (!token) return
    if (!window.confirm(`ปิดใช้งาน ${zone.name} ใช่หรือไม่? รายการงานเดิมจะยังอยู่`)) return
    setBusy(true)
    try {
      await api.deleteZone(token, zone.id)
      setMessage({ variant: "success", text: `ปิดใช้งาน ${zone.name} แล้ว` })
      await loadZones()
    } catch (err) {
      setMessage({ variant: "danger", text: "ปิดใช้งานไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  if (!isStaff || !isAdmin) {
    return (
      <section className="page-view active">
        <div className="page-intro wrap">
          <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />จัดการพื้นที่</p>
          <h1>จัดการอาคารและพื้นที่</h1>
          <p className="lede">
            {isStaff
              ? "หน้านี้สำหรับผู้ดูแลระบบเท่านั้น"
              : "หน้านี้สำหรับเจ้าหน้าที่เท่านั้น กรุณาเข้าสู่ระบบจากเมนูด้านบน"}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />จัดการพื้นที่</p>
        <h1>จัดการอาคารและพื้นที่</h1>
        <p className="lede">เพิ่ม แก้ไข หรือปิดใช้งานอาคาร/พื้นที่ที่เปิดรับแจ้งซ่อม</p>
      </div>

      <div className="workspace wrap">
        <div className="workspace-grid">
          <div className="panel">
            <div className="panel-head">
              <h2>{form.id ? "แก้ไขพื้นที่" : "เพิ่มพื้นที่ใหม่"}</h2>
              <p>รหัสพื้นที่ต้องไม่ซ้ำกับรายการอื่น</p>
            </div>
            {message && (
              <p className={`form-summary${message.variant === "success" ? " success" : ""}`} role="alert">
                {message.text}
              </p>
            )}
            <form onSubmit={handleSubmit}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="zoneGroupId">รหัสพื้นที่</label>
                  <input
                    id="zoneGroupId"
                    type="text"
                    value={form.groupId}
                    onChange={(event) => setForm((prev) => ({ ...prev, groupId: event.target.value }))}
                    placeholder="เช่น B06"
                  />
                </div>
                <div className="field">
                  <label htmlFor="zoneSort">ลำดับการแสดง</label>
                  <input
                    id="zoneSort"
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="zoneName">ชื่ออาคาร/พื้นที่</label>
                <input
                  id="zoneName"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="เช่น อาคารเรียน 3"
                />
              </div>
              <div className="field">
                <label htmlFor="zoneDetail">รายละเอียด</label>
                <input
                  id="zoneDetail"
                  type="text"
                  value={form.detail}
                  onChange={(event) => setForm((prev) => ({ ...prev, detail: event.target.value }))}
                  placeholder="เช่น ห้องเรียนและห้องปฏิบัติการ"
                />
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                />
                <span>เปิดรับแจ้งซ่อม</span>
              </label>
              <div className="form-actions">
                {form.id && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={resetForm}>
                    ยกเลิกการแก้ไข
                  </button>
                )}
                <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                  {busy ? "กำลังบันทึก..." : form.id ? "บันทึกการแก้ไข" : "เพิ่มพื้นที่"}
                </button>
              </div>
            </form>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>รายการอาคาร/พื้นที่</h2>
              <p>{loading ? "กำลังโหลด..." : `${zones.length} รายการ`}</p>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>ชื่อ</th>
                    <th>สถานะ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.id}>
                      <td>{zone.groupId}</td>
                      <td>
                        <strong>{zone.name}</strong>
                        {zone.detail && <div className="field-help">{zone.detail}</div>}
                      </td>
                      <td>{zone.active ? "เปิด" : "ปิด"}</td>
                      <td className="table-actions">
                        <button className="report-action" type="button" onClick={() => startEdit(zone)}>
                          แก้ไข
                        </button>
                        {zone.active && (
                          <button className="report-action report-action--danger" type="button" onClick={() => void handleDelete(zone)} disabled={busy}>
                            ปิดใช้งาน
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ZonesPage
