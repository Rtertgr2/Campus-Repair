import React from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"

// Components
import Home from "./pages/home/Home"
import AuditPage from "./pages/audit-page/AuditPage"
import TrackerPage from "./pages/tracker-page/TrackerPage"
import AssessPage from "./pages/assess-page/AssessPage"
import PrintPage from "./pages/print-page/PrintPage"
import QrPage from "./pages/qr-page/QrPage"
import Header from "./components/header/Header"
import { StaffProvider } from "./lib/staff-context"


// base path ที่ build ไว้ (ดู vite.config.ts) — จำเป็นเมื่อติดตั้งในโฟลเดอร์ย่อยของ Apache
// เช่น VITE_BASE_PATH=/campus-repair/ -> basename "/campus-repair"
const APP_BASE = import.meta.env.BASE_URL || "/"
const BASENAME = APP_BASE === "/" ? "/" : APP_BASE.replace(/\/+$/, "")

const App: React.FC = () => (
  <Router basename={BASENAME}>
    <StaffProvider>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="tracker" element={<TrackerPage />} />
          <Route path="assess" element={<AssessPage />} />
          <Route path="print" element={<PrintPage />} />
          <Route path="qr" element={<QrPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="site-foot wrap">
        <p>Campus Repair • ระบบแจ้งซ่อมสถานที่และของส่วนรวมที่ชำรุด</p>
        <p>
          แจ้งซ่อมได้ทุกอาคารภายในสถานศึกษา และติดตามสถานะงานซ่อมได้ตลอด 30 วัน
        </p>
      </footer>
    </StaffProvider>
  </Router>
)

export default App
