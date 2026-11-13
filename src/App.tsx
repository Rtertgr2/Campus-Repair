import React, { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from "react-router-dom"
import { Container, Row, Col } from "react-bootstrap"

// Components
import Home from "./pages/home"
import AuditPage from "./pages/audit-page"
import TrackerPage from "./pages/tracker-page"
import AssessmentPage from "./pages/assessment-page"
import Header from "./components/header"
import KPI from "./components/kpi"
import ZoneMap from "./components/zone-map"

// Styles
import "./styles/global.css"
import "bootstrap/dist/bootstrap.min.css"

const App: React.FC = () => {
  const [isStaff, setIsStaff] = useState(false)
  const navigate = useNavigate()

  // Check staff PIN on load
  useEffect(() => {
    // In a real app, this would check localStorage or a cookie
    // For now, we'll simulate staff mode
    const checkPin = () => {
      const pin = prompt("กรอกรหัส PIN เจ้าหน้าที่ (หรือเว้นว่างเพื่อใช้เป็นผู้ใช้ทั่วไป):", "")
      if (pin && pin.length === 4 && /^\d+$/.test(pin)) {
        // Verify against config - in real app this would check with server
        if (pin === "1234") {
          setIsStaff(true)
        }
      }
    }
    checkPin()
  }, [])

  return (
    <Router>
      <Container fluid>
        <Header isStaff={isStaff} setIsStaff={setIsStaff} />
        <hr />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="tracker" element={<TrackerPage />} />
          <Route path="assessment" element={<AssessmentPage />} />
        </Routes>
      </Container>
    </Router>
  )
}

export default App
