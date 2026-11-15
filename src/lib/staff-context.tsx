import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { api, isBackendConfigured, HealthWarning } from "./api"

/**
 * โหมดเจ้าหน้าที่
 *
 * เก็บชื่อผู้ใช้กับ PIN ไว้ใน sessionStorage เพื่อให้รีเฟรชหน้าแล้วไม่ต้องล็อกอินใหม่
 * (ปิดแท็บ/ปิดเบราว์เซอร์แล้วหายไป — ไม่ได้เก็บข้ามเครื่องหรือข้ามวัน)
 *
 * PIN ถูกส่งไปตรวจที่ backend ทุกครั้งที่เปลี่ยนสถานะงาน จึงไม่ได้ใช้เป็นเพียง
 * สถานะในเบราว์เซอร์เท่านั้น
 */

const STORAGE_KEY = "campus-repair.staff"

interface StaffSession {
  name: string
  pin: string
}

interface StaffContextValue {
  isStaff: boolean
  name: string
  pin: string | null
  backendConfigured: boolean
  warnings: HealthWarning[]
  login: (name: string, pin: string) => Promise<boolean>
  logout: () => void
  refreshWarnings: () => Promise<void>
}

const StaffContext = createContext<StaffContextValue | null>(null)

function readStoredSession(): StaffSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StaffSession>
    if (typeof parsed?.pin === "string" && parsed.pin.length > 0) {
      return { name: typeof parsed.name === "string" ? parsed.name : "", pin: parsed.pin }
    }
    return null
  } catch {
    return null
  }
}

function storeSession(session: StaffSession | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // โหมดส่วนตัวของเบราว์เซอร์บางรุ่นปิด sessionStorage — ใช้สถานะในหน่วยความจำแทน
  }
}

export const StaffProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<StaffSession | null>(() => readStoredSession())
  const [warnings, setWarnings] = useState<HealthWarning[]>([])

  const refreshWarnings = useCallback(async () => {
    const pin = session?.pin
    if (!pin) {
      setWarnings([])
      return
    }
    try {
      const report = await api.health(pin)
      setWarnings(report.warnings)
    } catch {
      setWarnings([])
    }
  }, [session])

  useEffect(() => {
    void refreshWarnings()
  }, [refreshWarnings])

  const login = useCallback(async (name: string, pin: string) => {
    if (!/^\d{4}$/.test(pin)) return false
    const ok = await api.verifyPin(pin)
    if (!ok) return false
    const next = { name: name.trim(), pin }
    setSession(next)
    storeSession(next)
    return true
  }, [])

  const logout = useCallback(() => {
    setSession(null)
    storeSession(null)
    setWarnings([])
  }, [])

  const value = useMemo<StaffContextValue>(
    () => ({
      isStaff: session !== null,
      name: session?.name ?? "",
      pin: session?.pin ?? null,
      backendConfigured: isBackendConfigured,
      warnings,
      login,
      logout,
      refreshWarnings,
    }),
    [session, warnings, login, logout, refreshWarnings],
  )

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
}

export function useStaff(): StaffContextValue {
  const context = useContext(StaffContext)
  if (!context) throw new Error("useStaff ต้องถูกใช้ภายใน <StaffProvider>")
  return context
}
