import React, { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { api, BUILDINGS, Issue, STATUS_CLOSED } from "../../lib/api"
import { queryToFilters } from "../../lib/query"
import { useStaff } from "../../lib/staff-context"

const statusLabel = (status: string) =>
  status === STATUS_CLOSED ? "ซ่อมเสร็จแล้ว" : "รอซ่อม"

const buildingName = (groupId: string, zone: string) =>
  BUILDINGS.find((building) => building.id === groupId)?.name ?? zone

/**
 * หน้างานพิมพ์
 *   /print?id=GW-001   → ใบงานเดี่ยว
 *   /print?...filters  → ตารางรายการตามตัวกรองเดียวกับหน้า tracker
 */
const PrintPage: React.FC = () => {
  const { pin } = useStaff()
  const [params] = useSearchParams()
  const id = params.get("id") ?? ""
  // URLSearchParams ถูกสร้างใหม่ทุกครั้งที่ render — ใช้สตริงเป็น dependency แทน
  const query = params.toString()

  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const filters = queryToFilters(query)
        const result = await api.listIssues({ ...filters, page: 1, pageSize: 100 }, pin ?? undefined)
        if (cancelled) return
        setIssues(id ? result.issues.filter((issue) => issue.id === id) : result.issues)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id, query, pin])

  const printedAt = new Date().toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const single = id ? issues[0] : undefined

  return (
    <section className="print-view">
      <div className="print-toolbar no-print">
        <Link className="chip" to="/tracker">
          ← กลับหน้าติดตามงาน
        </Link>
        <button className="chip" type="button" onClick={() => window.print()}>
          🖨 พิมพ์หน้านี้
        </button>
      </div>

      {error && <p className="form-summary">โหลดข้อมูลไม่สำเร็จ: {error}</p>}

      {loading ? (
        <p className="field-help">กำลังโหลด...</p>
      ) : id ? (
        single ? (
          <article className="work-order">
            <header className="work-order-head">
              <div>
                <p className="work-order-kicker">Campus Repair — ใบงานซ่อม</p>
                <h1>{single.id}</h1>
              </div>
              <div className="work-order-meta">
                <p>พิมพ์เมื่อ {printedAt}</p>
                <p className={`work-order-status${single.status === STATUS_CLOSED ? " is-done" : ""}`}>
                  {statusLabel(single.status)}
                </p>
              </div>
            </header>

            <dl className="work-order-grid">
              <div>
                <dt>อาคาร/พื้นที่</dt>
                <dd>
                  {buildingName(single.groupId, single.zone)}
                  {single.room ? ` • ห้อง ${single.room}` : ""}
                </dd>
              </div>
              <div>
                <dt>ประเภทงาน</dt>
                <dd>{single.category || "-"}</dd>
              </div>
              <div>
                <dt>ความเร่งด่วน</dt>
                <dd>{single.riskLevel || "-"}</dd>
              </div>
              <div>
                <dt>วันที่แจ้ง</dt>
                <dd>{single.createdDate}</dd>
              </div>
              <div>
                <dt>ครบกำหนด</dt>
                <dd>{single.dueDate}</dd>
              </div>
              <div>
                <dt>วันที่ปิดงาน</dt>
                <dd>{single.closedDate || "-"}</dd>
              </div>
              <div>
                <dt>ผู้แจ้ง</dt>
                <dd>
                  {single.reporterName || "-"}
                  {single.reporterContact ? ` • ${single.reporterContact}` : ""}
                </dd>
              </div>
              <div>
                <dt>เลขที่งาน</dt>
                <dd>{single.id}</dd>
              </div>
            </dl>

            <section className="work-order-block">
              <h2>จุดที่พบ / อาการเสีย</h2>
              <p>{single.locationDetail || "-"}</p>
            </section>

            {single.suggestion && (
              <section className="work-order-block">
                <h2>ข้อเสนอแนะ</h2>
                <p>{single.suggestion}</p>
              </section>
            )}

            <section className="work-order-block">
              <h2>ผลการซ่อม</h2>
              <p>{single.staffNote || "— ยังไม่บันทึกผลการซ่อม —"}</p>
            </section>

            {(single.beforePhoto || single.afterPhoto) && (
              <section className="work-order-block">
                <h2>รูปภาพประกอบ</h2>
                <div className="work-order-photos">
                  {single.beforePhoto && (
                    <figure className="work-order-photo">
                      <a href={single.beforePhoto} target="_blank" rel="noreferrer">
                        <img src={single.beforePhoto} alt="ภาพก่อนซ่อม" />
                      </a>
                      <figcaption>ภาพก่อนซ่อม</figcaption>
                    </figure>
                  )}
                  {single.afterPhoto && (
                    <figure className="work-order-photo">
                      <a href={single.afterPhoto} target="_blank" rel="noreferrer">
                        <img src={single.afterPhoto} alt="ภาพหลังซ่อม" />
                      </a>
                      <figcaption>ภาพหลังซ่อม</figcaption>
                    </figure>
                  )}
                </div>
              </section>
            )}

            <section className="work-order-block">
              <h2>ประวัติการเปลี่ยนสถานะ</h2>
              {single.history.length === 0 ? (
                <p>— ไม่มีประวัติ —</p>
              ) : (
                <ul className="work-order-history">
                  {single.history.map((entry, index) => (
                    <li key={`${single.id}-h${index}`}>
                      {entry.createdAt} • {entry.fromStatus || "สร้างงาน"} → {entry.toStatus}
                      {entry.staffName ? ` • ${entry.staffName}` : ""}
                      {entry.note ? ` • ${entry.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <footer className="work-order-sign">
              <div>
                <span>ผู้แจ้ง / เจ้าหน้าที่รับแจ้ง</span>
                <em>ลงชื่อ ...................................................</em>
              </div>
              <div>
                <span>ผู้ซ่อม / ผู้ตรวจรับ</span>
                <em>ลงชื่อ ...................................................</em>
              </div>
            </footer>
          </article>
        ) : (
          <p className="form-summary">ไม่พบงานซ่อมเลขที่ {id}</p>
        )
      ) : (
        <article className="work-order">
          <header className="work-order-head">
            <div>
              <p className="work-order-kicker">Campus Repair — รายงานงานซ่อม</p>
              <h1>รายการแจ้งซ่อม</h1>
            </div>
            <div className="work-order-meta">
              <p>พิมพ์เมื่อ {printedAt}</p>
              <p>ทั้งหมด {issues.length} รายการ</p>
            </div>
          </header>

          {issues.length === 0 ? (
            <p>— ไม่มีรายการตามเงื่อนไข —</p>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>เลขงาน</th>
                  <th>วันที่แจ้ง</th>
                  <th>อาคาร/ห้อง</th>
                  <th>ประเภท</th>
                  <th>ความเร่งด่วน</th>
                  <th>จุดที่พบ</th>
                  <th>ผู้แจ้ง</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.id}</td>
                    <td>{issue.createdDate}</td>
                    <td>
                      {buildingName(issue.groupId, issue.zone)}
                      {issue.room ? ` / ${issue.room}` : ""}
                    </td>
                    <td>{issue.category}</td>
                    <td>{issue.riskLevel}</td>
                    <td>{issue.locationDetail}</td>
                    <td>{issue.reporterName}</td>
                    <td>
                      {statusLabel(issue.status)}
                      {issue.overdueDays > 0 ? ` (เลย ${issue.overdueDays} วัน)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <footer className="work-order-sign">
            <div>
              <span>ผู้จัดทำรายงาน</span>
              <em>ลงชื่อ ...................................................</em>
            </div>
            <div>
              <span>ผู้ตรวจสอบ</span>
              <em>ลงชื่อ ...................................................</em>
            </div>
          </footer>
        </article>
      )}
    </section>
  )
}

export default PrintPage
