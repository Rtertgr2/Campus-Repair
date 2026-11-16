import React from "react"
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom"

// Components
import Home from "./pages/home/Home"
import AuditPage from "./pages/audit-page/AuditPage"
import TrackerPage from "./pages/tracker-page/TrackerPage"
import ZonesPage from "./pages/zones-page/ZonesPage"
import StaffPage from "./pages/staff-page/StaffPage"
import Header from "./components/header/Header"
import { StaffProvider } from "./lib/staff-context"


const App: React.FC = () => (
  <Router>
    <StaffProvider>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="tracker" element={<TrackerPage />} />
          <Route path="zones" element={<ZonesPage />} />
          <Route path="staff" element={<StaffPage />} />
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
