import React, { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { BUILDINGS, CATEGORIES } from "../../lib/api"
import { useStaff } from "../../lib/staff-context"

/** ลิงก์เต็มของหน้าแจ้งซ่อม (คำนึงถึง base path ที่ติดตั้ง) */
function auditUrl(zone: string, room: string, category: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL || "/"}`
  const url = new URL("audit", base)
  url.searchParams.set("zone", zone)
  if (room.trim()) url.searchParams.set("room", room.trim())
  if (category) url.searchParams.set("category", category)
  return url.toString()
}

/**
 * หน้าสร้างป้าย QR สำหรับติดหน้าห้อง/อาคาร
 * ผู้แจ้งสแกนแล้วเปิดหน้าแจ้งซ่อมที่เติมอาคาร/ห้องให้อัตโนมัติ
 */
const QrPage: React.FC = () => {
  const { isStaff } = useStaff()
  const [room, setRoom] = useState("")
  const [category, setCategory] = useState("")
  const [copied, setCopied] = useState("")

  const cards = useMemo(
    () =>
      BUILDINGS.map((building) => ({
        ...building,
        url: auditUrl(building.zone, room, category),
      })),
    [room, category],
  )

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      window.setTimeout(() => setCopied(""), 1500)
    } catch {
      setCopied("")
    }
  }

  return (
    <section className="page-view active">
      <div className="page-intro wrap">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          ป้าย QR
        </p>
        <h1>ป้าย QR สำหรับแจ้งซ่อม</h1>
        <p className="lede">
          พิมพ์ป้ายนี้ติดไว้ที่ห้องหรือจุดที่มักชำรุด ผู้แจ้งสแกนแล้วจะเข้าสู่หน้าแจ้งซ่อม
          ที่เลือกอาคารและห้องให้เรียบร้อย
        </p>
      </div>

      <div className="workspace wrap">
        <div className="panel no-print">
          <div className="filter-row">
            <div className="field">
              <label htmlFor="qrRoom">ห้อง/จุด (ใส่เพื่อให้ทุกป้ายเติมค่านี้)</label>
              <input
                id="qrRoom"
                type="text"
                placeholder="เช่น 301 หรือ ห้องน้ำชายชั้น 1"
                value={room}
                onChange={(event) => setRoom(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="qrCategory">ประเภทงาน (ไม่บังคับ)</label>
              <select
                id="qrCategory"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">ไม่ระบุ</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="chips">
            <button className="chip" type="button" onClick={() => window.print()}>
              🖨 พิมพ์ป้ายทั้งหมด
            </button>
          </div>

          {!isStaff && (
            <p className="field-help" style={{ marginTop: 12 }}>
              ป้าย QR เปิดให้เฉพาะโหมดเจ้าหน้าที่ (ข้อมูลอาคารเดียวกันกับหน้าแจ้งซ่อม)
            </p>
          )}
        </div>

        <div className="qr-grid">
          {cards.map((card) => (
            <article className="qr-card" key={card.id}>
              <QRCodeSVG value={card.url} size={168} level="M" includeMargin />
              <h2>{card.name}</h2>
              <p className="field-help">
                สแกนเพื่อแจ้งซ่อม{room.trim() ? ` • ห้อง ${room.trim()}` : ""}
                {category ? ` • ${category}` : ""}
              </p>
              <button className="chip no-print" type="button" onClick={() => void copy(card.url)}>
                {copied === card.url ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default QrPage
