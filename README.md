# Campus Repair — ระบบแจ้งซ่อมสถานที่

เว็บแจ้งซ่อมสถานที่/ของส่วนรวมที่ชำรุด สำหรับสถานศึกษา
**หน้าบ้าน:** React + TypeScript + Vite + Bootstrap · **หลังบ้าน:** PHP + MySQL/MariaDB บน **XAMPP**

ใช้ XAMPP เป็นระบบเดียว — ไม่ต้องใช้ Docker, Node server, Google Apps Script หรือฐานข้อมูลบนคลาวด์

---

## 1. สถานะปัจจุบัน (ติดตั้งบนเครื่องนี้แล้ว)

| รายการ | ค่า |
| --- | --- |
| ที่อยู่เว็บ | **http://localhost/campus-repair/** |
| โฟลเดอร์เว็บ | `C:\xampp\htdocs\campus-repair` |
| ฐานข้อมูล | `campus_repair` (utf8mb4 / utf8mb4_unicode_ci) |
| เซิร์ฟเวอร์ฐานข้อมูล | MariaDB 10.11.16 ที่ `127.0.0.1:3306`, ผู้ใช้ `root`, รหัสผ่านว่าง (ค่าเริ่มต้น XAMPP) |
| PHP | 8.3.36 (Apache ของ XAMPP พอร์ต 80 / 443) |
| phpMyAdmin | http://localhost/phpmyadmin |
| ตาราง | `repair_jobs`, `assessments`, `status_history` |
| PIN เจ้าหน้าที่ | `7391` — **ควรเปลี่ยนก่อนใช้งานจริง** (`api\config.php`) |
| ตัวติดตั้ง | ล็อกแล้ว (`api\storage\install.lock`) — เปิดผ่านเบราว์เซอร์จะได้ 403 |

หน้าเว็บทั้งหมด

| หน้า | URL |
| --- | --- |
| หน้าแรก + สรุปงานซ่อม | `/` |
| แจ้งซ่อม | `/audit` |
| ติดตามงานซ่อม (ค้นหา/กรอง/ปิดงาน) | `/tracker` |
| แบบประเมินความพึงพอใจ (+ ผลสรุปสำหรับเจ้าหน้าที่) | `/assess` |
| ใบงาน/รายงานสำหรับพิมพ์ | `/print` (หรือ `/print?id=GW-001`) |
| ป้าย QR ประจำอาคาร (โหมดเจ้าหน้าที่) | `/qr` |

ผลทดสอบล่าสุด: `npm run test:api` ผ่าน **36/36** บน Apache + PHP 8.3 + MariaDB 10.11

---

## 2. เส้นทางไฟล์ (path map)

### 2.1 โฟลเดอร์ที่รันจริงบน XAMPP

```
C:\xampp\htdocs\campus-repair\        ← ตัวเว็บที่ Apache เปิดให้บริการ
├── index.html                         หน้าเว็บหลัก (ไฟล์ static ที่ build แล้ว)
├── .htaccess                          rewrite ให้ /audit, /tracker, /assess, /print, /qr เปิดตรงได้
├── manifest.webmanifest, sw.js        PWA (ติดตั้งบนมือถือ + เปิดซ้ำได้ตอนออฟไลน์)
├── assets\index.js, index.css         JS/CSS ที่ build จาก TypeScript
├── favicon.svg, icons.svg
└── api\                               ★ backend PHP ทั้งหมด
    ├── index.php                      front controller (ทุก action มาที่นี่)
    ├── install.php                    ตัวสร้าง/อัปเดตตาราง — ลบทิ้งหลังติดตั้ง
    ├── cleanup.php                    ลบรูปตกค้าง (CLI หรือ 127.0.0.1)
    ├── config.php                     ★ ค่าฐานข้อมูล + PIN (ไม่ขึ้น git)
    ├── config.example.php             ตัวอย่าง config
    ├── schema.sql                     โครงสร้างตาราง
    ├── lib\ bootstrap.php, issues.php, assessments.php, photos.php,
    │        ratelimit.php, maintenance.php
    ├── uploads\                       ★ รูปที่อัปโหลด (ต้องเขียนได้)
    └── storage\                       สถานะ pin_lock + install.lock (ต้องเขียนได้)
```

### 2.2 โฟลเดอร์ซอร์สในโปรเจกต์นี้

```
E:\code\Campus-Repair-Master\Campus-Repair-master\
├── src\                      โค้ด TypeScript/React (แก้ UI ที่นี่)
│   ├── pages\home\            หน้าแรก + สรุปงานซ่อม
│   ├── pages\audit-page\      หน้าแจ้งซ่อม (รับ deep link จาก QR)
│   ├── pages\tracker-page\    หน้าติดตามงานซ่อม (ค้นหา/กรอง/แบ่งหน้า/ประวัติ)
│   ├── pages\assess-page\     แบบประเมิน + ผลสรุปเจ้าหน้าที่
│   ├── pages\print-page\      ใบงาน/รายงานสำหรับพิมพ์
│   ├── pages\qr-page\         สร้างป้าย QR ประจำอาคาร
│   ├── components\header\     แบรนด์ เมนู โหมดเจ้าหน้าที่ (ฟอร์ม login + คำเตือน)
│   ├── lib\api.ts             เรียก backend (หรือ mock เมื่อยังไม่ตั้งค่า)
│   ├── lib\query.ts           แปลงตัวกรอง ↔ query string
│   ├── lib\image.ts           ย่อรูปก่อนอัปโหลด
│   ├── lib\staff-context.tsx  สถานะเจ้าหน้าที่/PIN (จำใน sessionStorage)
│   ├── index.css              ธีม สี ฟอนต์ + สไตล์หน้าพิมพ์
│   └── main.tsx, App.tsx      จุดเริ่มต้น + route
├── api\                      ซอร์ส backend PHP (ต้นฉบับ — แก้ที่นี่)
├── public\.htaccess          ถูกคัดลอกไปที่รากของเว็บ
├── public\sw.js, manifest.webmanifest   ไฟล์ PWA (Vite คัดลอกเข้า dist ให้)
├── scripts\package-xampp.mjs สคริปต์ build + คัดลอกขึ้น htdocs
├── tests\api-smoke.mjs       ชุดทดสอบ backend (`npm run test:api`)
├── dist\                     ผล build (สร้างใหม่ได้, ไม่ขึ้น git)
├── deploy\campus-repair\     แพ็กเกจพร้อม deploy (สร้างใหม่ได้, ไม่ขึ้น git)
├── .tools\node-...\          Node 20 แบบ portable ที่ติดตั้งไว้ในโปรเจกต์
├── index.html, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json
└── package.json
```

> **แก้โค้ดที่ไหนแล้วต้องทำอะไรต่อ**
> - แก้ UI/หน้าเว็บ → แก้ `src\` → `npm run package:xampp -- --dest "C:/xampp/htdocs/campus-repair"`
> - แก้ logic/ฐานข้อมูล → แก้ `api\` แล้วคัดลอกไฟล์นั้นไป `C:\xampp\htdocs\campus-repair\api\`
> - แก้ schema → แก้ `api\schema.sql` แล้วรัน `php api/install.php` (จะเติมคอลัมน์/ตารางที่ขาดให้)

### 2.3 สรุปคู่ path: โปรเจกต์ → XAMPP

| ของในโปรเจกต์ | ที่อยู่จริงบน XAMPP | หมายเหตุ |
| --- | --- | --- |
| `dist\` | `htdocs\campus-repair\` (ยกเว้น `api\`) | ไฟล์ static จาก build |
| `public\.htaccess` | `htdocs\campus-repair\.htaccess` | จำเป็นสำหรับเปิดหน้าแบบ SPA |
| `public\sw.js`, `public\manifest.webmanifest` | `htdocs\campus-repair\` | Vite คัดลอกให้ตอน build |
| `api\` | `htdocs\campus-repair\api\` | ทั้งโฟลเดอร์ |
| `api\config.example.php` | `htdocs\campus-repair\api\config.php` | คัดลอกครั้งแรกครั้งเดียว |
| `deploy\campus-repair\` | ต้นแบบของทั้งเว็บ | ใช้คัดลอกด้วยมือได้ |

---

## 3. การใช้งาน

### 3.1 ฟีเจอร์หลัก

- **แจ้งซ่อม** — เลือกอาคาร/ห้อง ประเภทงาน ความเร่งด่วน แนบรูป และระบุชื่อผู้แจ้ง (บังคับ) + ช่องทางติดต่อ (ไม่บังคับ)
- **SLA ตามความเร่งด่วน** — สูง = 3 วัน, ปานกลาง = 7 วัน, ต่ำ = 30 วัน (ตั้งใน `due_days_by_risk`) งานที่เลยกำหนดจะติดป้าย "เลยกำหนด N วัน"
- **ติดตามงาน** — ค้นหาข้อความ, กรองอาคาร/ประเภท/ความเร่งด่วน/ช่วงวันที่/สถานะ, แบ่งหน้า, ดูประวัติการเปลี่ยนสถานะ, ส่งออก CSV, พิมพ์รายงาน
- **ปิด/เปิดงาน** — ปิดงานต้องมีหมายเหตุ, แนบภาพหลังซ่อมได้, ทุกครั้งถูกบันทึกใน `status_history` พร้อมชื่อผู้ทำ
- **แบบประเมินความพึงพอใจ** — ผู้ใช้ทั่วไปตอบได้; เจ้าหน้าที่เห็นผลสรุป (ค่าเฉลี่ย/ตารางผู้ตอบ)
- **ป้าย QR** — พิมพ์ติดหน้าห้อง/อาคาร ผู้แจ้งสแกนแล้วหน้าแจ้งซ่อมจะเติมอาคาร/ห้องให้อัตโนมัติ
- **PWA** — ติดตั้งบนมือถือได้ เปิดหน้าเดิมได้ตอนออฟไลน์ (ข้อมูลจาก API ต้องออนไลน์เสมอ)

### 3.2 โหมดเจ้าหน้าที่

กดปุ่ม "โหมดเจ้าหน้าที่" ที่มุมขวาบน → กรอก **ชื่อ (ไม่บังคับ) + PIN** (ค่าเริ่มต้น `7391`)
ในโหมดนี้:

- การปิด/เปิดงาน **ไม่ถาม PIN อีก** (แต่ backend ยังตรวจ PIN ทุกครั้ง)
- ชื่อผู้ทำถูกบันทึกในประวัติของงาน
- เห็นข้อมูลผู้แจ้ง ชื่อ/ช่องทางติดต่อ
- เห็นเมนู "ป้าย QR" และปุ่ม "ล้างรูปตกค้าง"
- แถบคำเตือนความปลอดภัย (PIN ค่าเริ่มต้น, debug เปิด, gd ปิด, uploads เขียนไม่ได้)

สถานะเจ้าหน้าที่เก็บใน `sessionStorage` — รีเฟรชหน้าไม่หลุด ปิดแท็บแล้วต้องเข้าใหม่

---

## 4. ติดตั้งใหม่ตั้งแต่ต้น (เครื่องอื่น)

### 4.1 สิ่งที่ต้องมี

- **XAMPP** (Apache + MySQL/MariaDB) — PHP 7.3 ขึ้นไป (ทดสอบจริง: PHP 7.3.10 + MySQL 8.0.17 และ PHP 8.3.36 + MariaDB 10.11.16)
- **Node.js 18+** — ใช้เฉพาะตอน build (ในโปรเจกต์นี้มี portable ที่ `.tools\node-v20.18.0-win-x64`)
- แนะนำ: เปิดส่วนขยาย **gd** ใน `php.ini` (`extension=gd`) เพื่อให้เซิร์ฟเวอร์ย่อรูป/แปลง WebP เอง (ถ้าไม่เปิด ระบบยังทำงานโดยเก็บรูปตามที่เบราว์เซอร์ส่งมา)

### 4.2 ขั้นตอน

```bash
# 1) ติดตั้ง dependency และ build + คัดลอกขึ้น htdocs ในคำสั่งเดียว
npm install
npm run package:xampp -- --dest "C:/xampp/htdocs/campus-repair"
```

```sql
-- 2) สร้างฐานข้อมูล (phpMyAdmin > New หรือใช้ mysql client)
CREATE DATABASE IF NOT EXISTS campus_repair
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```php
// 3) แก้ htdocs\campus-repair\api\config.php ให้ตรงกับเครื่อง
'db' => ['host' => '127.0.0.1', 'port' => 3306, 'name' => 'campus_repair',
         'user' => 'root', 'password' => ''],
'staff_pin' => 'เปลี่ยนเป็นของคุณ',
'due_days_by_risk' => ['สูง' => 3, 'ปานกลาง' => 7, 'ต่ำ' => 30],
'debug' => false,   // เปิด true เฉพาะตอนหาสาเหตุ
```

4. เปิด http://localhost/campus-repair/api/install.php → ต้องได้ `OK: applied 3 statements`
   (ทางเลือกบน command line: `php api/install.php` — รันซ้ำได้ ไม่ทำข้อมูลหาย)
5. เปิด http://localhost/campus-repair/ → ใช้งานได้
6. **ลบ `api\install.php`** และเปลี่ยน `staff_pin` ก่อนใช้งานจริง
7. ทางเลือก: ตั้งงานประจำให้ลบรูปตกค้าง เช่นทุกสัปดาห์
   `C:\xampp\php\php.exe C:\xampp\htdocs\campus-repair\api\cleanup.php`

### 4.3 ตัวเลือกอื่นของสคริปต์

```bash
npm run package:xampp                       # ได้แค่ deploy/campus-repair (ไม่แตะ htdocs)
npm run package:xampp -- --dest "<path>"    # ระบุปลายทางเอง
npm run package:xampp -- --dest "C:/xampp/htdocs" --root   # ติดตั้งที่ราก htdocs (base = /)
npm run package:xampp -- --skip-build       # ใช้ dist/ เดิม ไม่ build ซ้ำ
```

สคริปต์คำนวณ `VITE_BASE_PATH` / `VITE_API_URL` จากชื่อโฟลเดอร์ปลายทางเอง
และ **ไม่ทับ** ของเดิมใน `api\config.php`, รูปใน `api\uploads`, สถานะใน `api\storage`
(รวมถึงไม่คัดลอก `install.lock` ไปบล็อกเครื่องปลายทาง)

---

### 4.4 Deploy บน Ubuntu Server (on-prem)

สำหรับติดตั้งจริงบนเซิร์ฟเวอร์โรงเรียน (Ubuntu LTS + Apache mod_php + MariaDB,
เว็บใต้ `/campus-repair/`, TLS แบบ DNS-01, backup รายวันไป NAS) ดูคู่มือและสคริปต์ที่
[`ops/linux/README.md`](ops/linux/README.md) — ประกอบด้วย `setup-ubuntu.sh`,
`apache-campus-repair.conf`, `update-campus-repair.sh`, `backup-campus-repair.sh`
และ `sync-from-windows.sh`

> ยังต้องรอ **ชื่อโดเมนจริง** และช่วง IP ที่ firewall อนุญาตก่อนทำขั้น TLS/cutover

---

## 5. พัฒนาหน้าบ้าน (บนเครื่องนี้)

```bash
export PATH="$PWD/.tools/node-v20.18.0-win-x64:$PATH"   # ถ้ายังไม่มี node ใน PATH

npm run dev        # Vite dev server → http://localhost:5173
npm run build      # build ลง dist/
npm run test:api   # ทดสอบ backend (ต้องมี XAMPP รันอยู่)
npm run preview    # ดู dist/ แบบ static
```

| สคริปต์ | หน้าที่ |
| --- | --- |
| `npm run dev` | dev server (hot reload) — ไม่ได้ตั้ง `VITE_API_URL` จะใช้ข้อมูลตัวอย่างในหน่วยความจำ |
| `npm run build` | build ไฟล์ static ลง `dist/` |
| `npm run package:xampp` | build + จัดโฟลเดอร์พร้อมวางใน htdocs |
| `npm run test:api` | smoke test ของ API/ฐานข้อมูล (สร้างแล้วลบข้อมูลทดสอบเอง) |
| `npm run lint` | ESLint — **ยังใช้ไม่ได้** เพราะโปรเจกต์ยังไม่ได้ติดตั้ง `eslint` เป็น dependency |

`npm run dev` ใช้ดู UI ได้ทันที แต่ **ไม่ต่อฐานข้อมูลจริง** ถ้าต้องการทดสอบกับ PHP/MySQL
ให้ตั้ง `VITE_API_URL=/campus-repair/api/index.php` และเปิด CORS ชั่วคราวใน `api\config.php`:
`'cors_origins' => ['http://localhost:5173', 'http://127.0.0.1:5173']`
วิธีที่ตรงกับของจริงที่สุดคือ build แล้วเปิดผ่าน Apache (`http://localhost/campus-repair/`)

### 5.1 ชุดทดสอบ backend

```bash
npm run test:api
# กำหนดเองได้เมื่อติดตั้งที่อื่น
BASE_URL=http://localhost/campus-repair/api/index.php STAFF_PIN=7391 npm run test:api
MYSQL_EXE=... DB_NAME=campus_repair UPLOADS_DIR=... npm run test:api
```

ทดสอบ 36 รายการ: สร้างงาน + SLA + รูป, ค้นหา/กรอง/แบ่งหน้า, PIN ผิด, ปิดงานพร้อมประวัติ,
เปิดงานใหม่, CSV (มี BOM), แบบประเมิน + สรุป, health, cleanup, การบล็อกไฟล์ภายใน,
honeypot และ rate limit
ข้อมูลทดสอบถูกลบอัตโนมัติเมื่อจบ (ทั้งแถวใน DB และไฟล์รูป)

---

## 6. ฐานข้อมูล

### 6.1 ตาราง `repair_jobs` (งานแจ้งซ่อม)

| คอลัมน์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `row_index` | BIGINT UNSIGNED | PK, auto_increment |
| `id` | VARCHAR(32) | `GW-001` (สร้างจาก `row_index` หลัง insert), UNIQUE |
| `created_date`, `due_date` | DATE | วันที่แจ้ง / ครบกำหนดตาม SLA |
| `group_id`, `zone`, `room` | VARCHAR | รหัสอาคาร / ชื่ออาคาร / ห้อง |
| `category`, `risk_level` | VARCHAR | ประเภทงาน / ความเร่งด่วน |
| `location_detail`, `suggestion` | TEXT | จุดที่พบ / ข้อเสนอแนะ |
| `reporter_name`, `reporter_contact` | VARCHAR | ผู้แจ้ง + ช่องทางติดต่อ (แสดงเต็มเฉพาะเจ้าหน้าที่) |
| `before_photo_url`, `after_photo_url` | TEXT | path สัมพัทธ์ เช่น `uploads/abc.jpg` |
| `status` | VARCHAR(32) | `รอแก้ไข` หรือ `ปิดงานแล้ว` (มี `CHECK` บังคับ) |
| `closed_date` | DATE | วันที่ปิดงาน (NULL = ยังไม่ปิด) |
| `staff_note` | TEXT | หมายเหตุการซ่อม (บังคับเมื่อปิดงาน) |
| `created_at`, `updated_at` | DATETIME | อัตโนมัติ |

### 6.2 ตาราง `status_history` (ประวัติการเปลี่ยนสถานะ)

`issue_row_index` (FK → `repair_jobs`, ลบตาม), `issue_id`, `from_status` (`''` = สร้างใหม่),
`to_status`, `staff_name`, `note`, `created_at`

### 6.3 ตาราง `assessments` (ผลประเมิน)

`row_index`, `id` (`A-001`), `student_id`, `student_name`, `level`, `group_id`,
`knowledge_correct/total/percent`, `awareness_points/max/percent`, `created_at`

### 6.4 คำสั่งที่ใช้บ่อย

```bash
# เปิดใช้ mysql client ของ XAMPP (Git Bash)
MY="/c/xampp/mysql/bin/mysql.exe -u root -h 127.0.0.1 -P 3306 --default-character-set=utf8mb4"

$MY -e "select row_index,id,zone,room,status,reporter_name from campus_repair.repair_jobs;"
$MY -e "select * from campus_repair.status_history order by row_index desc limit 10;"
$MY -e "select id,student_name,knowledge_percent,awareness_percent from campus_repair.assessments;"
```

```bash
# สำรอง / กู้คืน
/c/xampp/mysql/bin/mysqldump.exe -u root campus_repair > backup-campus-repair.sql
/c/xampp/mysql/bin/mysql.exe -u root campus_repair < backup-campus-repair.sql
```

```sql
-- ล้างข้อมูลทั้งหมด แต่เก็บโครงตาราง (id จะเริ่มนับ 1 ใหม่)
TRUNCATE TABLE status_history;
TRUNCATE TABLE repair_jobs;
TRUNCATE TABLE assessments;
```

หลัง `TRUNCATE` ให้ลบรูปเก่าใน `htdocs\campus-repair\api\uploads\` ด้วย
หรือเรียก `api\cleanup.php` (ไฟล์ที่ไม่ถูกอ้างถึงและเก่ากว่า 24 ชม. จะถูกลบ)

---

## 7. API (backend PHP)

ทุกคำขอเป็น `POST` JSON ที่มีฟิลด์ `action` ส่งมาเป็น `Content-Type: text/plain`
(เลี่ยง CORS preflight) และตอบกลับเป็น `{ "ok": true|false, ... }` เสมอ
frontend อ่านข้อความผิดพลาดจากฟิลด์ `error` ไม่ใช่ HTTP status

| action | ฟิลด์ที่ส่ง | ผลลัพธ์ |
| --- | --- | --- |
| `listIssues` | `filters{search,zone,category,status,riskLevel,dateFrom,dateTo,page,pageSize,overdueOnly}` | `issues[]` (มี `history`), `total`, `page`, `pages`, `stats` |
| `stats` | — | `stats{total,pending,closed,overdue,closureRate,avgRepairDays}` |
| `createIssue` | `issue{groupId,zone,room?,category,riskLevel,locationDetail,suggestion,reporterName,reporterContact?,beforePhotoDataUrl?}` | `issue` |
| `updateStatus` | `rowIndex`, `status`, `pin`, `staffNote?`, `staffName?`, `afterPhotoDataUrl?` | `issue` |
| `verifyPin` | `pin` | `ok` |
| `exportIssues` | `filters{...}` | `csv` (UTF-8 + BOM), `filename`, `rows` |
| `listAssessments` | `limit?` | `assessments[]`, `summary{total,avgKnowledge,avgAwareness,bestKnowledge}` |
| `submitAssessment` | `assessment{studentId,studentName,level,groupId,knowledgeCorrect,knowledgeTotal,awarenessPoints,awarenessMax}` | `assessment` |
| `health` | `pin` | `warnings[]`, `installLocked`, `gdAvailable`, `uploadsWritable` |
| `cleanupPhotos` | `pin`, `dryRun?`, `maxAgeHours?` | `result{scanned,deleted,kept}` |

```bash
curl -s -H "Content-Type: text/plain" \
  -d '{"action":"listIssues","filters":{"status":"รอแก้ไข","pageSize":5}}' \
  http://localhost/campus-repair/api/index.php
```

`GET` ที่ `api/index.php` ก็ตอบ `{"ok":true,...,"version":2}` — ใช้ตรวจว่าติดตั้งสำเร็จได้

### ไฟล์ใน `api\`

| ไฟล์ | หน้าที่ |
| --- | --- |
| `index.php` | front controller + switch ทุก action |
| `install.php` | สร้าง/อัปเดตตาราง (เติมคอลัมน์ที่ขาดให้) + เขียน `install.lock` |
| `cleanup.php` | ลบรูปตกค้าง (CLI / 127.0.0.1 / `?token=`) |
| `schema.sql` | โครงสร้างตาราง (idempotent, utf8mb4) |
| `config.example.php` | ตัวอย่าง config — คัดลอกเป็น `config.php` |
| `lib\bootstrap.php` | config, PDO, JSON/CORS helper, `ApiError` |
| `lib\issues.php` | list/create/update/PIN + ตัวกรอง + stats + ประวัติ + CSV |
| `lib\assessments.php` | list/submit + สรุปผล |
| `lib\photos.php` | data URL → ไฟล์ (ย่อ/แปลง WebP ด้วย gd ถ้าเปิดไว้) |
| `lib\ratelimit.php` | ล็อกเมื่อกรอก PIN ผิด (ปิดอยู่โดยค่าเริ่มต้น) |
| `lib\maintenance.php` | คำเตือนสุขภาพระบบ, install lock, ล้างรูปตกค้าง |
| `.htaccess` (ทุกระดับ) | บล็อก `config.php`, `schema.sql`, `lib\` ไม่ให้เปิดผ่านเบราว์เซอร์ |

---

## 8. การเก็บรูป

frontend ย่อรูปก่อนส่ง (สูงสุด 1280px, JPEG) → ส่งเป็น data URL
backend เขียนไฟล์ลง `api\uploads\` และเก็บแค่ path สัมพัทธ์ (`uploads/xxxx.jpg`) ในฐานข้อมูล
จึงย้ายเครื่อง/ย้ายโฟลเดอร์ได้โดยไม่ต้องแก้ข้อมูล — รับเฉพาะ JPEG / PNG / WebP / GIF
ขนาดสูงสุดคำนวณจาก `post_max_size` ใน `php.ini` (ราว 60% ของเพดาน; ค่าเริ่มต้น XAMPP 8M ≈ 4.8 MB)

ถ้าเปิดส่วนขยาย **gd** เซิร์ฟเวอร์จะย่อรูปให้อีกชั้น (ด้านยาวสุด 1600px ตาม `photo_max_edge`)
และแปลงเป็น WebP (`photo_quality` 82) เพื่อกันคนส่งรูปใหญ่ข้ามการย่อฝั่งเบราว์เซอร์

---

## 9. ความปลอดภัย (ทำก่อนเปิดใช้จริง)

- [ ] เปลี่ยน `staff_pin` จาก `7391` เป็น PIN ของคุณใน `api\config.php`
- [ ] ลบ `api\install.php` (หรือปล่อยไว้ — ตอนนี้ล็อกแล้วด้วย `install.lock`)
- [ ] ตั้ง `'debug' => false` (ค่าเริ่มต้น) เพื่อไม่ให้ error ภายในหลุดออกไป
- [ ] ตรวจว่า `pin_lock` เปิด (ค่าเริ่มต้น): `'pin_lock' => ['enabled' => true]`
      (ผิด 5 ครั้งใน 15 นาที → ล็อก 15 นาทีต่อ IP, เก็บสถานะใน `api\storage\pin\`)
- [ ] ตรวจว่า `rate_limit` เปิด (ค่าเริ่มต้น) — จำกัด `createIssue`/`submitAssessment` 10 ครั้ง/นาทีต่อ IP
- [ ] เปิด `gd` ใน `php.ini` ถ้าต้องการให้เซิร์ฟเวอร์ย่อ/แปลงรูปเอง
- [ ] อย่าใส่ความลับในตัวแปรที่ขึ้นต้นด้วย `VITE_` (จะถูกฝังลง JS ฝั่งเบราว์เซอร์)
- [ ] ใช้ในเครือข่ายโรงเรียน ไม่ควรเปิด Apache สู่อินเทอร์เน็ตโดยตรงถ้าไม่มี HTTPS

ข้อควรรู้: API `listIssues`/`exportIssues`/`listAssessments` ส่งข้อมูลผู้แจ้ง/ผู้ประเมิน
กลับมาเฉพาะเมื่อแนบ PIN เจ้าหน้าที่ที่ถูกต้อง (คำขอสาธารณะได้ข้อมูลที่ปิดส่วนบุคคลแล้ว)
และการเดา PIN ถูกนับ/ล็อกด้วย `pin_lock` — อย่างไรก็ตาม PIN ยังเป็นรหัสร่วม ไม่ใช่บัญชีรายคน

ข้อจำกัดโดยธรรมชาติ: ยังไม่มีบัญชีผู้ใช้ — PIN เป็นรหัสเดียวที่ใช้ร่วมกัน
ชื่อเจ้าหน้าที่ที่บันทึกในประวัติเป็นการบันทึกตามที่ผู้ใช้กรอก (ไม่ใช่การยืนยันตัวตน)

---

## 10. แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
| --- | --- |
| `เชื่อมต่อฐานข้อมูลไม่สำเร็จ` | MySQL ยังไม่เริ่ม (เปิดใน XAMPP Control Panel) หรือชื่อฐานข้อมูล/ผู้ใช้/รหัสใน `api\config.php` ไม่ถูก |
| `[2054] authentication method unknown to the client` | PHP 7.x ต่อ MySQL 8 ที่ใช้ `caching_sha2_password` ไม่ได้ — `ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'รหัส';` หรือเปลี่ยนมาใช้ XAMPP 8.x |
| `ERROR 4025 ... CHECK constraint ... failed` | พยายามบันทึกสถานะอื่นนอกจาก `รอแก้ไข` / `ปิดงานแล้ว` — เป็นการป้องกันที่ถูกต้อง |
| `403 — ระบบนี้ติดตั้งเสร็จแล้ว` | ตัวติดตั้งถูกล็อก: รัน `php api/install.php` บน command line หรือลบ `api\storage\install.lock` |
| เปิด `/audit` แล้ว 404 | ไม่มี `.htaccess` ที่รากโฟลเดอร์เว็บ หรือ `mod_rewrite`/`AllowOverride All` ไม่ได้เปิด |
| หน้าเว็บขาว / หา `assets\*.js` ไม่เจอ | `VITE_BASE_PATH` ไม่ตรงกับโฟลเดอร์ที่ติดตั้ง → build ใหม่ด้วยสคริปต์ `package:xampp` |
| อัปโหลดรูปไม่สำเร็จ | `api\uploads\` ไม่มีอยู่หรือ Apache เขียนไม่ได้ |
| ขึ้นเตือน "ยังไม่ได้เชื่อมต่อ backend" | build โดยไม่ได้ตั้ง `VITE_API_URL` |
| แจ้งเตือน "PHP ยังไม่เปิดส่วนขยาย gd" | เปิด `extension=gd` ใน `C:\xampp\php\php.ini` แล้ว restart Apache (ไม่เปิดก็ใช้งานได้ แค่ไม่แปลง WebP) |
| ตารางไม่มี `CHECK` หรือขาดคอลัมน์ใหม่ | รัน `php api/install.php` — ตัวติดตั้งจะเติมคอลัมน์/index ที่ขาดให้อัตโนมัติ |

ดู log ของ Apache/PHP ที่ `C:\xampp\apache\logs\error.log`

---

## 11. ประวัติการทดสอบ (สรุป)

- **AppServ (PHP 7.3 + MySQL 8.0.17)** — วงจร CRUD, รูป, PIN, assessment, CHECK constraint, `/audit`
- **XAMPP (PHP 8.3 + MariaDB 10.11)** — ติดตั้ง schema + migrate ฐานข้อมูลเดิม, สร้างงาน, ปิดงานด้วย PIN,
  PIN ผิดถูกปฏิเสธ, CHECK บังคับใช้ (`ERROR 4025`), หน้า `/` `/audit` `/tracker` `/assess` `/print` `/qr` = 200,
  `api/config.php` = 403, `api/install.php` = 403 หลังล็อก
- **ชุดทดสอบอัตโนมัติ** — `npm run test:api` ผ่าน 36/36 (SLA, ตัวกรอง, ประวัติ, CSV, assessment, health, cleanup, การบล็อกไฟล์, honeypot, rate limit)
- **เบราว์เซอร์จริง** — หน้า tracker แสดง 6 รายการพร้อมสถิติ/ประวัติ/ตัวกรอง, ฟอร์มล็อกอินเจ้าหน้าที่
  (ชื่อ + PIN) ทำงาน, ข้อมูลผู้แจ้งแสดงเฉพาะโหมดเจ้าหน้าที่, คำเตือนความปลอดภัยแสดงถูก,
  หน้า `/assess` แสดงผลสรุป, `/print?id=GW-004` แสดงใบงานครบ, `/qr` สร้าง QR 5 ใบ,
  deep link `/audit?zone=B01&room=301` เติมอาคาร/ห้องให้อัตโนมัติ, ไม่มี console error
