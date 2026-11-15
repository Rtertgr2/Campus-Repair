/**
 * Service worker ของ Campus Repair
 *
 * กลยุทธ์
 *   - หน้าเว็บ (navigate): เอาจากเครือข่ายก่อน ถ้าออฟไลน์ใช้แคช (หรือ index.html ที่แคชไว้)
 *   - ไฟล์ static (js/css/รูป/ฟอนต์): cache-first
 *   - ไม่แตะ /api/ เลย (ข้อมูลต้องสดเสมอ)
 *
 * ไฟล์นี้ถูกติดตั้งที่ base path ของเว็บ เช่น /campus-repair/sw.js
 */

const CACHE_NAME = "campus-repair-v1"
const SCOPE = new URL(self.registration ? self.registration.scope : "./", self.location.href)

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // แคชหน้าเริ่มต้นไว้เปิดได้ตอนออฟไลน์
      try {
        await cache.add(new URL("index.html", SCOPE).toString())
      } catch {
        // ออฟไลน์ครั้งแรกแล้วแคชไม่ได้ — ปล่อยผ่าน ไม่ทำให้ติดตั้งล้ม
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.indexOf("/api/") !== -1) return

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, response.clone())
          return response
        } catch {
          const cache = await caches.open(CACHE_NAME)
          const cached = (await cache.match(request)) || (await cache.match(new URL("index.html", SCOPE).toString()))
          return cached || Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })(),
  )
})
