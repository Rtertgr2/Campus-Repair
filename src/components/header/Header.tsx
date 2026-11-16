import React, { useEffect, useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { Modal } from "react-bootstrap"
import { api, NotificationResult } from "../../lib/api"
import { useStaff } from "../../lib/staff-context"

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

const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  technician: "ช่างเทคนิค",
  viewer: "อ่านอย่างเดียว",
}

const Header: React.FC = () => {
  const { staff, token, role, isStaff, isAdmin, login, logout, backendConfigured } = useStaff()
  const [showLogin, setShowLogin] = useState(false)
  const [staffName, setStaffName] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [notifications, setNotifications] = useState<NotificationResult | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    if (!isStaff || !token) {
      setNotifications(null)
      return
    }
    let cancelled = false
    const load = () => {
      api
        .getNotifications(token)
        .then((result) => {
          if (!cancelled) setNotifications(result)
        })
        .catch(() => {
          if (!cancelled) setNotifications(null)
        })
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isStaff, token])

  const openLogin = () => {
    setStaffName("")
    setPin("")
    setError("")
    setShowLogin(true)
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!staffName.trim()) {
      setError("กรุณากรอกชื่อเจ้าหน้าที่")
      return
    }
    if (!/^\d{4,}$/.test(pin)) {
      setError("PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก")
      return
    }
    setBusy(true)
    setError("")
    try {
      const ok = await login(staffName.trim(), pin)
      if (!ok) {
        setError("ชื่อหรือ PIN ไม่ถูกต้อง")
        return
      }
      setShowLogin(false)
      setPin("")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const navItems = [
    { to: "/", label: "หน้าแรก" },
    { to: "/audit", label: "แจ้งซ่อม" },
    { to: "/tracker", label: "ติดตามงานซ่อม" },
    ...(isAdmin
      ? [
          { to: "/zones", label: "จัดการพื้นที่" },
          { to: "/staff", label: "บัญชีเจ้าหน้าที่" },
        ]
      : []),
  ]

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
          {navItems.map((item) => (
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
              <button
                className="staff-bell"
                type="button"
                aria-label="แจ้งเตือนงานซ่อม"
                aria-expanded={showNotifications}
                onClick={() => setShowNotifications((value) => !value)}
              >
                🔔
                {(notifications?.count ?? 0) > 0 && (
                  <span className="staff-bell__count">{notifications?.count}</span>
                )}
              </button>
              <span className="head-staff">
                ● {staff?.name}
                {role ? ` · ${ROLE_LABELS[role] ?? role}` : ""}
              </span>
              <button className="lang-toggle" type="button" onClick={logout}>
                ออก
              </button>
            </>
          ) : (
            <button className="lang-toggle" type="button" disabled={busy} onClick={openLogin}>
              โหมดเจ้าหน้าที่
            </button>
          )}
        </div>

        {showNotifications && isStaff && (
          <div className="notif-panel">
            <div className="notif-panel__head">
              <strong>แจ้งเตือน</strong>
              <Link to="/tracker" onClick={() => setShowNotifications(false)}>
                ดูรายการทั้งหมด
              </Link>
            </div>
            {notifications?.unassigned ? (
              <p className="notif-panel__muted">
                งานที่ยังไม่มอบหมาย {notifications.unassigned} รายการ
              </p>
            ) : null}
            {notifications && notifications.items.length > 0 ? (
              <ul>
                {notifications.items.map((item) => (
                  <li key={item.id} className={item.kind === "overdue" ? "is-overdue" : undefined}>
                    <Link to="/tracker" onClick={() => setShowNotifications(false)}>
                      <strong>{item.id}</strong> • {item.zone}
                    </Link>
                    <span>
                      {item.kind === "overdue"
                        ? `เลยกำหนด ${Math.abs(item.daysLeft)} วัน`
                        : `ครบกำหนด ${item.dueDate}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notif-panel__muted">ยังไม่มีงานใกล้ครบกำหนด</p>
            )}
          </div>
        )}

        {!backendConfigured && (
          <div className="head-alert">
            ยังไม่ได้เชื่อมต่อ PHP API/MySQL — ข้อมูลจะไม่ถูกบันทึกถาวร
          </div>
        )}
      </div>

      <Modal show={showLogin} onHide={() => setShowLogin(false)} centered>
        <form onSubmit={handleLogin}>
          <Modal.Header closeButton>
            <Modal.Title>เข้าสู่ระบบเจ้าหน้าที่</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && (
              <p className="form-summary" role="alert">
                {error}
              </p>
            )}
            <div className="field">
              <label htmlFor="staffName">ชื่อเจ้าหน้าที่</label>
              <input
                id="staffName"
                type="text"
                autoFocus
                autoComplete="username"
                value={staffName}
                onChange={(event) => setStaffName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="staffPin">PIN</label>
              <input
                id="staffPin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={128}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
              />
              <p className="field-help">บัญชีเริ่มต้นใช้ชื่อ “เจ้าหน้าที่” และ PIN 1234</p>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowLogin(false)}>
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
              {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
            </button>
          </Modal.Footer>
        </form>
      </Modal>
    </header>
  )
}

export default Header
