import React, { useState } from "react"
import { NavLink } from "react-router-dom"
import { Modal } from "react-bootstrap"
import { useStaff } from "../../lib/staff-context"

const NAV_ITEMS = [
  { to: "/", label: "หน้าแรก" },
  { to: "/audit", label: "แจ้งซ่อม" },
  { to: "/tracker", label: "ติดตามงานซ่อม" },
  { to: "/assess", label: "ประเมินความพึงพอใจ" },
]

const LeafIcon: React.FC = () => (
  <svg
    className="brand-leaf"
    style={{ inlineSize: 26, blockSize: 26, flex: "none" }}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 4c0 8-5.5 13-12 13H4c0-7 5-13 16-13Z" />
    <path d="M4 20c2-5 5.5-8 11-10" />
  </svg>
)

const Header: React.FC = () => {
  const { isStaff, name, login, logout, backendConfigured, warnings } = useStaff()
  const [open, setOpen] = useState(false)
  const [staffName, setStaffName] = useState("")
  const [pinInput, setPinInput] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const openLogin = () => {
    setStaffName("")
    setPinInput("")
    setError("")
    setOpen(true)
  }

  const handleLogin = async (event?: React.FormEvent) => {
    if (event) event.preventDefault()

    if (!/^\d{4}$/.test(pinInput)) {
      setError("กรุณากรอกรหัส PIN เจ้าหน้าที่ 4 หลัก")
      return
    }

    setBusy(true)
    try {
      const ok = await login(staffName, pinInput)
      if (ok) {
        setOpen(false)
        setPinInput("")
      } else {
        setError("รหัส PIN ไม่ถูกต้อง")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="site-head">
      <div className="wrap head-inner">
        <NavLink className="brand" to="/">
          <LeafIcon />
          <span className="brand-text">
            <span className="brand-th">แจ้งซ่อมสถานที่</span>
            <span className="brand-en">Campus Repair</span>
          </span>
        </NavLink>

        <nav className="site-nav" aria-label="เมนูหลัก">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
          {isStaff && (
            <NavLink to="/qr" className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              ป้าย QR
            </NavLink>
          )}
        </nav>

        <div className="head-actions">
          {isStaff ? (
            <>
              <span className="head-staff" title={name ? `เจ้าหน้าที่: ${name}` : "โหมดเจ้าหน้าที่"}>
                ● {name ? name : "โหมดเจ้าหน้าที่"}
              </span>
              <button className="lang-toggle" type="button" onClick={logout}>
                ออก
              </button>
            </>
          ) : (
            <button className="lang-toggle" type="button" disabled={busy} onClick={openLogin}>
              {busy ? "กำลังตรวจสอบ..." : "โหมดเจ้าหน้าที่"}
            </button>
          )}
        </div>

        {!backendConfigured && (
          <div className="head-alert">
            ยังไม่ได้เชื่อมต่อ backend (ไม่ได้ตั้งค่า VITE_API_URL) — ข้อมูลจะไม่ถูกบันทึกถาวร
          </div>
        )}

        {isStaff && warnings.length > 0 && (
          <ul className="head-alert head-alert-warn">
            {warnings.map((warning) => (
              <li key={warning.code}>⚠ {warning.message}</li>
            ))}
          </ul>
        )}
      </div>

      <Modal show={open} onHide={() => setOpen(false)} centered>
        <form onSubmit={handleLogin}>
          <Modal.Header closeButton>
            <Modal.Title>เข้าโหมดเจ้าหน้าที่</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="field-help" style={{ marginBottom: 12 }}>
              ชื่อจะถูกบันทึกไว้ในประวัติการปิดงาน เพื่อให้ตรวจสอบย้อนหลังได้ว่าใครทำรายการ
            </p>

            {error && (
              <p className="form-summary" role="alert">
                {error}
              </p>
            )}

            <div className="field">
              <label htmlFor="staffName">ชื่อเจ้าหน้าที่ (ไม่บังคับ)</label>
              <input
                id="staffName"
                type="text"
                autoComplete="name"
                placeholder="เช่น ช่างสมหมาย / งานอาคารสถานที่"
                value={staffName}
                onChange={(event) => setStaffName(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="staffPin">
                รหัส PIN เจ้าหน้าที่ <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="staffPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value.replace(/\D/g, ""))}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
              {busy ? "กำลังตรวจสอบ..." : "เข้าสู่โหมดเจ้าหน้าที่"}
            </button>
          </Modal.Footer>
        </form>
      </Modal>
    </header>
  )
}

export default Header
