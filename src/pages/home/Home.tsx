import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api, STATUS_CLOSED } from "../../lib/api"

const Home: React.FC = () => {
  const [kpiData, setKPIData] = useState({
    totalGroups: "-",
    totalIssues: "-",
    closureRate: "0",
  })
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        const issues = await api.listIssues()
        if (cancelled) return

        const totalIssues = issues.length
        const closed = issues.filter((issue) => issue.status === STATUS_CLOSED).length
        const groups = new Set(issues.map((issue) => issue.groupId).filter(Boolean))

        setKPIData({
          totalGroups: String(groups.size),
          totalIssues: String(totalIssues),
          closureRate: String(totalIssues > 0 ? Math.round((closed / totalIssues) * 100) : 0),
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [])

  const buildings = [
    { name: "อาคารเรียน 1", detail: "ห้องเรียนและห้องปฏิบัติการ" },
    { name: "อาคารเรียน 2", detail: "ห้องเรียนและห้องพักครู" },
    { name: "อาคารอเนกประสงค์", detail: "ห้องประชุมและกิจกรรม" },
    { name: "โรงอาหาร", detail: "พื้นที่รับประทานอาหาร" },
    { name: "หอสมุด", detail: "ห้องอ่านหนังสือและคอมพิวเตอร์" },
  ]

  const steps = [
    {
      num: "ขั้นที่ 1",
      title: "ถ่ายรูปและระบุตำแหน่ง",
      body: "เลือกอาคารและจุดที่พบ ระบุประเภทงานซ่อม ความเร่งด่วน และแนบรูปสภาพที่ชำรุด",
      icon: (
        <>
          <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
          <circle cx="12" cy="12" r="2.6" />
        </>
      ),
    },
    {
      num: "ขั้นที่ 2",
      title: "ทีมช่างรับงานและซ่อม",
      body: "เจ้าหน้าที่รับแจ้งและเข้าซ่อมตามระดับความเร่งด่วน พร้อมบันทึกหมายเหตุและภาพหลังซ่อม",
      icon: (
        <>
          <path d="M14 6a4 4 0 0 0 5 5l-9 9H5v-5l9-9Z" />
          <path d="M4 20h16" />
        </>
      ),
    },
    {
      num: "ขั้นที่ 3",
      title: "ติดตามจนซ่อมเสร็จ",
      body: "ดูสถานะงานซ่อมได้ตลอด 30 วัน หากยังไม่เรียบร้อยสามารถเปิดงานซ่อมอีกครั้งเพื่อให้เข้าตรวจ",
      icon: <path d="M4 13.5 9 18.5 20 6.5" />,
    },
  ]

  const StepIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <svg
      className="step-icon"
      style={{ inlineSize: 28, blockSize: 28 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )

  return (
    <section id="view-home" className="page-view active">
      <div className="hero wrap">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              วิทยาลัยของเรา · ดูแลร่วมกัน
            </p>
            <h1>
              พบของชำรุดหรือสถานที่เสียหาย
              <br />
              แจ้งให้ทีมเข้าซ่อม
            </h1>
            <p className="lede">
              หลอดไฟดับ ก๊อกน้ำรั่ว เก้าอี้หัก หรือประตูชำรุดที่นักศึกษาแก้เองไม่ได้ —
              ถ่ายรูป ระบุอาคาร แล้วติดตามสถานะจนซ่อมเสร็จ ใช้เวลาไม่ถึงหนึ่งนาที
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/audit">
                แจ้งซ่อมตอนนี้
              </Link>
              <Link className="btn btn-ghost" to="/tracker">
                ดูรายการแจ้งซ่อม
              </Link>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>ภาพรวมงานซ่อม</h2>
              <p>สรุปข้อมูลจากรายการแจ้งซ่อมที่บันทึกไว้</p>
            </div>
            {error && <p className="form-summary">โหลดข้อมูลไม่สำเร็จ: {error}</p>}
            <div className="kpi-grid">
              <span className="od-stat">
                <span className="stat-num" id="kpi-groups">{kpiData.totalGroups}</span>
                <span className="stat-cap">อาคารที่มีการแจ้ง</span>
              </span>
              <span className="od-stat">
                <span className="stat-num" id="kpi-issues">{kpiData.totalIssues}</span>
                <span className="stat-cap">งานแจ้งซ่อม</span>
              </span>
              <span className="od-stat">
                <span className="stat-num" id="kpi-closure">{kpiData.closureRate}%</span>
                <span className="stat-cap">ซ่อมเสร็จแล้ว</span>
              </span>
              <span className="od-stat">
                <span className="stat-num">30</span>
                <span className="stat-cap">วันติดตามผล</span>
              </span>
            </div>
            <div className="chips">
              <Link className="chip" to="/tracker">ติดตามสถานะงานซ่อม</Link>
              <Link className="chip" to="/audit">แจ้งซ่อมใหม่</Link>
            </div>
          </div>
        </div>
      </div>

      <section id="how" className="steps wrap">
        <h2>แจ้งซ่อมได้ในสามขั้นตอน</h2>
        <div className="steps-grid">
          {steps.map((step) => (
            <div className="step" key={step.num}>
              <StepIcon>{step.icon}</StepIcon>
              <span className="step-num">{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace wrap">
        <div className="panel">
          <div className="panel-head">
            <h2>อาคารและพื้นที่ให้บริการ</h2>
            <p>แจ้งซ่อมได้ทุกอาคารภายในสถานศึกษา เลือกอาคารให้ตรงกับจุดที่พบ</p>
          </div>
          <div className="zone-grid">
            {buildings.map((building) => (
              <div className="zone-card" key={building.name}>
                <h3>{building.name}</h3>
                <p>{building.detail}</p>
                <p style={{ marginTop: 8 }}>
                  <span className="zone-chip">เปิดรับแจ้งซ่อม</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  )
}

export default Home
