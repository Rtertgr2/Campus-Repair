# Campus Repair — ระบบแจ้งซ่อมสถานที่

เว็บแจ้งซ่อมสถานที่/ของส่วนรวมที่ชำรุด (Vite + React + TypeScript + Bootstrap)

## เริ่มใช้งาน

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

ถ้าไม่ตั้งค่า `VITE_API_URL` แอปจะใช้ข้อมูลตัวอย่างในหน่วยความจำ (ดู `.env.example`)

## หน้าและไฟล์

| หน้า | URL | ไฟล์ |
| --- | --- | --- |
| หน้าแรก (ภาพรวมงานซ่อม + อาคารที่ให้บริการ) | `/` | `src/pages/home/Home.tsx` |
| แจ้งซ่อม (ฟอร์ม + แนบรูป) | `/audit` | `src/pages/audit-page/AuditPage.tsx` |
| ติดตามงานซ่อม (รายการ + ปิด/เปิดงาน) | `/tracker` | `src/pages/tracker-page/TrackerPage.tsx` |

เส้นทางอื่นทั้งหมดถูก redirect กลับ `/` (กำหนดใน `src/App.tsx`)

## ไฟล์ที่ใช้ร่วมกัน

- `src/App.tsx` — route และโครงหน้า
- `src/components/header/Header.tsx` — แบรนด์ เมนู และโหมดเจ้าหน้าที่
- `src/index.css` — ธีม สี ฟอนต์ และคอมโพเนนต์
- `src/lib/api.ts` — เรียก Apps Script backend หรือใช้ mock
- `src/lib/image.ts` — ย่อรูปก่อนอัปโหลด
- `src/lib/staff-context.tsx` — สถานะเจ้าหน้าที่/PIN

## ฐานข้อมูล (เตรียมไว้ ยังไม่ใช้งาน)

โค้ดฝั่ง server อยู่ใน `db/` (Neon Postgres) ยังไม่ถูกเรียกจากแอป:
ตั้ง `DATABASE_URL` แล้วรัน `npm run db:init` เมื่อพร้อมใช้งาน
