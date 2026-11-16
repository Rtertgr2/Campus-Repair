import React, { useCallback, useEffect, useState } from "react"
import { Modal } from "react-bootstrap"
import { api, StaffMember, StaffRole } from "../../lib/api"
import { useStaff } from "../../lib/staff-context"

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "ผู้ดูแลระบบ",
  technician: "ช่างเทคนิค",
  viewer: "อ่านอย่างเดียว",
}

const ROLE_HINTS: Record<StaffRole, string> = {
  admin: "จัดการบัญชีเจ้าหน้าที่ อาคาร และลบงานได้",
  technician: "รับงาน แก้ไขรายละเอียด และอัปเดตสถานะได้",
  viewer: "ดูรายการและประวัติได้ แต่แก้ไขไม่ได้",
}

const StaffPage: React.FC = () => {
  const { staff, token, isStaff, isAdmin } = useStaff()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ variant: string; text: string } | null>(null)
  const [createForm, setCreateForm] = useState<{ name: string; pin: string; role: StaffRole }>({
    name: "",
    pin: "",
    role: "technician",
  })
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null)
  const [resetPin, setResetPin] = useState("")

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setMembers(await api.listStaff(token))
    } catch (err) {
      setMessage({ variant: "danger", text: "โหลดบัญชีไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) return
    if (!createForm.name.trim()) {
      setMessage({ variant: "warning", text: "กรุณากรอกชื่อเจ้าหน้าที่" })
      return
    }
    if (!/^\d{4,}$/.test(createForm.pin)) {
      setMessage({ variant: "warning", text: "PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก" })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await api.createStaff(token, createForm.name.trim(), createForm.pin, createForm.role)
      setMessage({ variant: "success", text: `สร้างบัญชี ${createForm.name.trim()} แล้ว` })
      setCreateForm({ name: "", pin: "", role: "technician" })
      await load()
    } catch (err) {
      setMessage({ variant: "danger", text: "สร้างบัญชีไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  const handleRoleChange = async (member: StaffMember, role: StaffRole) => {
    if (!token || member.role === role) return
    setBusy(true)
    setMessage(null)
    try {
      const updated = await api.updateStaff(token, member.id, { role })
      setMembers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setMessage({ variant: "success", text: `เปลี่ยนบทบาทของ ${member.name} เป็น ${ROLE_LABELS[role]} แล้ว` })
    } catch (err) {
      setMessage({ variant: "danger", text: "เปลี่ยนบทบาทไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  const handleActiveToggle = async (member: StaffMember) => {
    if (!token) return
    const nextActive = member.active === false
    if (!window.confirm(`${nextActive ? "เปิดใช้งาน" : "ปิดใช้งาน"} ${member.name} ใช่หรือไม่?`)) return
    setBusy(true)
    setMessage(null)
    try {
      const updated = await api.updateStaff(token, member.id, { active: nextActive })
      setMembers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setMessage({
        variant: "success",
        text: `${nextActive ? "เปิดใช้งาน" : "ปิดใช้งาน"} ${member.name} แล้ว`,
      })
    } catch (err) {
      setMessage({ variant: "danger", text: "เปลี่ยนสถานะบัญชีไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  const openReset = (member: StaffMember) => {
    setResetTarget(member)
    setResetPin("")
    setMessage(null)
  }

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || !resetTarget) return
    if (!/^\d{4,}$/.test(resetPin)) {
      setMessage({ variant: "warning", text: "PIN ใหม่ต้องเป็นตัวเลขอย่างน้อย 4 หลัก" })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await api.resetStaffPin(token, resetTarget.id, resetPin)
      setMessage({ variant: "success", text: `รีเซ็ต PIN ของ ${resetTarget.name} แล้ว` })
      setResetTarget(null)
      setResetPin("")
      await load()
    } catch (err) {
      setMessage({ variant: "danger", text: "รีเซ็ต PIN ไม่สำเร็จ: " + (err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  if (!isStaff || !isAdmin) {
    return (
      <section className="page-view active">
        <div className="page-intro wrap">
          <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />บัญชีเจ้าหน้าที่</p>
          <h1>จัดการบัญชีเจ้าหน้าที่</h1>
          <p className="lede">
            {isStaff ? "หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" : "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ"}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />บัญชีเจ้าหน้าที่</p>
        <h1>จัดการบัญชีเจ้าหน้าที่</h1>
        <p className="lede">สร้างบัญชี กำหนดบทบาท รีเซ็ต PIN และเปิด/ปิดการใช้งาน</p>
      </div>

      <div className="workspace wrap">
        {message && (
          <p className={`form-summary${message.variant === "success" ? " success" : ""}`} role="alert">
            {message.text}
          </p>
        )}

        <div className="workspace-grid">
          <div className="panel">
            <div className="panel-head">
              <h2>เพิ่มบัญชีใหม่</h2>
              <p>PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก และชื่อต้องไม่ซ้ำกับบัญชีเดิม</p>
            </div>
            <form onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="newStaffName">ชื่อเจ้าหน้าที่</label>
                <input
                  id="newStaffName"
                  type="text"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="เช่น สมชาย ใจดี"
                  autoComplete="off"
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="newStaffPin">PIN</label>
                  <input
                    id="newStaffPin"
                    type="password"
                    inputMode="numeric"
                    minLength={4}
                    value={createForm.pin}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, pin: event.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label htmlFor="newStaffRole">บทบาท</label>
                  <select
                    id="newStaffRole"
                    value={createForm.role}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value as StaffRole }))}
                  >
                    <option value="technician">ช่างเทคนิค</option>
                    <option value="viewer">อ่านอย่างเดียว</option>
                    <option value="admin">ผู้ดูแลระบบ</option>
                  </select>
                </div>
              </div>
              <p className="field-help">{ROLE_HINTS[createForm.role]}</p>
              <div className="form-actions">
                <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                  {busy ? "กำลังบันทึก..." : "สร้างบัญชี"}
                </button>
              </div>
            </form>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>บัญชีทั้งหมด</h2>
              <p>{loading ? "กำลังโหลด..." : `${members.length} บัญชี`}</p>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>บทบาท</th>
                    <th>สถานะ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.id === staff?.id
                    return (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.name}</strong>
                          {isSelf && <div className="field-help">บัญชีที่กำลังใช้งาน</div>}
                          {member.failedAttempts ? (
                            <div className="field-help">ลองผิด {member.failedAttempts} ครั้ง</div>
                          ) : null}
                        </td>
                        <td>
                          <select
                            aria-label={`บทบาทของ ${member.name}`}
                            value={member.role}
                            disabled={busy}
                            onChange={(event) => void handleRoleChange(member, event.target.value as StaffRole)}
                          >
                            <option value="admin">ผู้ดูแลระบบ</option>
                            <option value="technician">ช่างเทคนิค</option>
                            <option value="viewer">อ่านอย่างเดียว</option>
                          </select>
                          <div className="field-help">{ROLE_HINTS[member.role]}</div>
                        </td>
                        <td>
                          <span className={`role-badge ${member.active === false ? "role-badge--off" : "role-badge--on"}`}>
                            {member.active === false ? "ปิดใช้งาน" : "ใช้งาน"}
                          </span>
                        </td>
                        <td className="table-actions">
                          <button className="report-action" type="button" onClick={() => openReset(member)} disabled={busy}>
                            รีเซ็ต PIN
                          </button>
                          <button
                            className={`report-action${member.active === false ? "" : " report-action--danger"}`}
                            type="button"
                            onClick={() => void handleActiveToggle(member)}
                            disabled={busy || isSelf}
                            title={isSelf ? "ปิดใช้งานบัญชีของตัวเองไม่ได้" : undefined}
                          >
                            {member.active === false ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <Modal show={!!resetTarget} onHide={() => setResetTarget(null)} centered>
        <form onSubmit={handleReset}>
          <Modal.Header closeButton>
            <Modal.Title>รีเซ็ต PIN — {resetTarget?.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="field">
              <label htmlFor="resetPin">PIN ใหม่</label>
              <input
                id="resetPin"
                type="password"
                inputMode="numeric"
                minLength={4}
                autoFocus
                value={resetPin}
                onChange={(event) => setResetPin(event.target.value)}
                autoComplete="new-password"
              />
              <p className="field-help">อย่างน้อย 4 หลัก; บัญชีนี้จะถูกบังคับให้เข้าสู่ระบบใหม่</p>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setResetTarget(null)}>
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึก PIN ใหม่"}
            </button>
          </Modal.Footer>
        </form>
      </Modal>
    </section>
  )
}

export default StaffPage
