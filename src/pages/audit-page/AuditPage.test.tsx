import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import AuditPage from "./AuditPage"

describe("AuditPage", () => {
  it("renders the building selector and reporter contact fields", () => {
    const html = renderToStaticMarkup(<AuditPage />)

    expect(html).toContain("เลือกอาคาร/พื้นที่")
    expect(html).toContain("ชื่อผู้แจ้ง")
    expect(html).toContain("เบอร์โทร")
    expect(html).toContain("อีเมล")
    expect(html).toContain("ส่งเรื่องแจ้งซ่อม")
  })
})
