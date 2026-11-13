import React, { createContext, useCallback, useContext, useMemo, useState } from "react"
import { api, isBackendConfigured } from "./api"

interface StaffContextValue {
  isStaff: boolean
  pin: string | null
  backendConfigured: boolean
  login: (pin: string) => Promise<boolean>
  logout: () => void
}

const StaffContext = createContext<StaffContextValue | null>(null)

export const StaffProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pin, setPin] = useState<string | null>(null)

  const login = useCallback(async (candidate: string) => {
    if (!/^\d{4}$/.test(candidate)) return false
    const ok = await api.verifyPin(candidate)
    if (ok) setPin(candidate)
    return ok
  }, [])

  const logout = useCallback(() => setPin(null), [])

  const value = useMemo<StaffContextValue>(
    () => ({
      isStaff: pin !== null,
      pin,
      backendConfigured: isBackendConfigured,
      login,
      logout,
    }),
    [pin, login, logout],
  )

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
}

export function useStaff(): StaffContextValue {
  const context = useContext(StaffContext)
  if (!context) throw new Error("useStaff ต้องถูกใช้ภายใน <StaffProvider>")
  return context
}
