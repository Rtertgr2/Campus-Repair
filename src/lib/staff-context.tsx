import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { api, isBackendConfigured, StaffMember, StaffRole } from "./api"

const STORAGE_KEY = "campus-repair-staff-session"

interface StaffContextValue {
  staff: StaffMember | null
  token: string | null
  role: StaffRole | null
  isStaff: boolean
  isAdmin: boolean
  canEdit: boolean
  backendConfigured: boolean
  login: (staffName: string, pin: string) => Promise<boolean>
  logout: () => void
}

const StaffContext = createContext<StaffContextValue | null>(null)

interface StoredSession {
  token: string
  staff: StaffMember
}

function readStoredSession(): StoredSession | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.token || !parsed.staff?.id || !parsed.staff?.name) return null
    return {
      ...parsed,
      staff: { ...parsed.staff, role: parsed.staff.role ?? "technician" },
    }
  } catch {
    return null
  }
}

export const StaffProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<StoredSession | null>(() => readStoredSession())

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  }, [session])

  const login = useCallback(async (staffName: string, pin: string) => {
    if (!/^\d{4,}$/.test(pin) || !staffName.trim()) return false
    const result = await api.loginStaff(staffName.trim(), pin)
    setSession(result)
    return true
  }, [])

  const logout = useCallback(() => {
    if (session) void api.logoutStaff(session.token).catch(() => undefined)
    setSession(null)
  }, [session])

  const value = useMemo<StaffContextValue>(
    () => ({
      staff: session?.staff ?? null,
      token: session?.token ?? null,
      role: session?.staff.role ?? null,
      isStaff: session !== null,
      isAdmin: session?.staff.role === "admin",
      canEdit: session?.staff.role === "admin" || session?.staff.role === "technician",
      backendConfigured: isBackendConfigured,
      login,
      logout,
    }),
    [session, login, logout],
  )

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
}

export function useStaff(): StaffContextValue {
  const context = useContext(StaffContext)
  if (!context) throw new Error("useStaff ต้องถูกใช้ภายใน <StaffProvider>")
  return context
}
