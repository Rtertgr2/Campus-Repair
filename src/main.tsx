import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "bootstrap/dist/css/bootstrap.min.css"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA: ให้ติดตั้งบนมือถือได้และเปิดหน้าเดิมได้ตอนออฟไลน์
// ลงทะเบียนเฉพาะ production build (dev server ไม่ต้องมี service worker มาขวางการโหลด)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(swUrl).catch(() => {
      // ลงทะเบียนไม่สำเร็จไม่ทำให้เว็บใช้งานไม่ได้
    })
  })
}
