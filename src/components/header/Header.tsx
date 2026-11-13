import React, { useState } from "react"
import { NavLink } from "react-router-dom"
import { useStaff } from "../../lib/staff-context"

const NAV_ITEMS = [
  { to: "/", label: "หน้าแรก" },
  { to: "/audit", label: "แจ้งซ่อม" },
  { to: "/tracker", label: "ติดตามงานซ่อม" },
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
  const { isStaff, login, logout, backendConfigured } = useStaff()
  const [error, setError] = useState<string>("")
  const [busy, setBusy] = useState(false)

  const handleStaffLogin = async () => {
    const pin = prompt("กรอกรหัส PIN เจ้าหน้าที่:", "")
    if (!pin) return

    setBusy(true)
    try {
      const ok = await login(pin)
      setError(ok ? "" : "รหัส PIN ไม่ถูกต้อง")
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
        </nav>

        <div className="head-actions">
          {isStaff ? (
            <>
              <span className="head-staff">● โหมดเจ้าหน้าที่</span>
              <button className="lang-toggle" type="button" onClick={logout}>
                ออก
              </button>
            </>
          ) : (
            <button
              className="lang-toggle"
              type="button"
              disabled={busy}
              onClick={handleStaffLogin}
            >
              {busy ? "กำลังตรวจสอบ..." : "โหมดเจ้าหน้าที่"}
            </button>
          )}
        </div>

        {!backendConfigured && (
          <div className="head-alert">
            ยังไม่ได้เชื่อมต่อ Google Sheets (ไม่ได้ตั้งค่า VITE_API_URL) — ข้อมูลจะไม่ถูกบันทึกถาวร
          </div>
        )}

        {error && <div className="head-alert">⚠ {error}</div>}
      </div>
    </header>
  )
}

export default Header
