import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import Header from "./Header"
import { StaffProvider } from "../../lib/staff-context"

describe("Header", () => {
  it("shows the main navigation and the staff login button", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StaffProvider>
          <Header />
        </StaffProvider>
      </MemoryRouter>,
    )

    expect(html).toContain("แจ้งซ่อมสถานที่")
    expect(html).toContain("ติดตามงานซ่อม")
    expect(html).toContain("โหมดเจ้าหน้าที่")
  })
})
