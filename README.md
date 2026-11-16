# Campus Repair — React + PHP + MySQL

ระบบแจ้งซ่อมสถานที่สำหรับสถานศึกษา: React/Vite ฝั่งหน้าเว็บ, PHP API และ MySQL ฝั่งเซิร์ฟเวอร์

รองรับ:
- แจ้งซ่อมพร้อมรูปและข้อมูลติดต่อผู้แจ้ง
- บัญชีเจ้าหน้าที่แยกรายคน (ชื่อ + PIN) พร้อมบทบาท `admin` / `technician` / `viewer`, session และการล็อกบัญชีเมื่อลองผิดหลายครั้ง
- สถานะงานหลายขั้น, การมอบหมายผู้รับผิดชอบ และประวัติการเปลี่ยนแปลง (audit log)
- ค้นหา/กรอง/แบ่งหน้าฝั่งเซิร์ฟเวอร์ และส่งออก CSV
- แก้ไข/ลบรายการสำหรับเจ้าหน้าที่
- จัดการอาคาร/พื้นที่ผ่านหน้าเว็บ
- แจ้งเตือนในแอปเมื่องานใกล้ครบกำหนด/เลยกำหนด/ยังไม่มอบหมาย (ไม่มีการแจ้งเตือนผ่าน LINE)
- เก็บรูปเป็นไฟล์ + thumbnail, rate limit, honeypot และการจำกัดขนาดฟิลด์

## โครงสร้างหลัก

| Path | หน้าที่ |
|---|---|
| `src/pages/home` | หน้าแรก + สรุปภาพรวม |
| `src/pages/audit-page` | ฟอร์มแจ้งซ่อม |
| `src/pages/tracker-page` | รายการงาน, ค้นหา, มอบหมาย, อัปเดตสถานะ, ประวัติ, export |
| `src/pages/zones-page` | จัดการอาคาร/พื้นที่ (เฉพาะผู้ดูแลระบบ) |
| `src/pages/staff-page` | สร้าง/แก้บทบาท/รีเซ็ต PIN/ปิดใช้งานบัญชี (เฉพาะผู้ดูแลระบบ) |
| `src/lib/api.ts` | API client + โหมดสาธิต |
| `public/api/index.php` | PHP API |
| `public/api/photos.php` | เก็บรูป + thumbnail |
| `db/schema.sql` | สคีมาสำหรับฐานข้อมูลใหม่ |
| `db/migrate.php` | migrate ฐานข้อมูลใหม่/เดิม |
| `db/create-staff.php` | สร้าง/รีเซ็ตบัญชีเจ้าหน้าที่ |
| `db/deploy-check.php` | ตรวจความพร้อมก่อน deploy |
| `db/prune-uploads.php` | ลบรูปที่ไม่มีเจ้าของ |
| `db/backup.sh` | สำรองฐานข้อมูล + uploads |
| `tests/api-smoke.mjs` | smoke test ของ API |

## ติดตั้งบน XAMPP

1. เปิด Apache และ MySQL ใน XAMPP Control Panel
2. เข้า `http://localhost/phpmyadmin` สร้างฐานข้อมูล `campus_repair`
   ด้วย collation `utf8mb4_unicode_ci`
3. รัน migration จากโฟลเดอร์โปรเจกต์:
   ```bash
   php db/migrate.php
   ```
   หรือ Import `db/schema.sql` ผ่าน phpMyAdmin สำหรับฐานข้อมูลใหม่
   (แนะนำ `db/migrate.php` เพราะรองรับทั้งฐานข้อมูลใหม่และฐานข้อมูลเดิม)
4. คัดลอก **เนื้อหาทั้งหมดใน `dist/`** ไป `C:\xampp\htdocs\campus-repair\`
   โครงสร้างต้องมี `campus-repair/index.html`, `assets/`, `api/`, `uploads/`
5. ใน `htdocs/campus-repair/api/` คัดลอก `config.local.example.php` เป็น `config.local.php`
   แล้วแก้ค่าให้ตรงกับ MySQL:
   ```php
   <?php
   return [
       'host' => '127.0.0.1',
       'port' => '3306',
       'database' => 'campus_repair',
       'username' => 'root',
       'password' => '',
       'staff_name' => 'เจ้าหน้าที่',
       'staff_pin' => '1234', // เปลี่ยนก่อนใช้งานจริง
   ];
   ```
6. เปิด `http://localhost/campus-repair/` แล้วทดลองแจ้งซ่อม
7. กด “โหมดเจ้าหน้าที่” ใช้ชื่อ `เจ้าหน้าที่` และ PIN `1234`
   (บัญชีเริ่มต้นจะถูกสร้างให้อัตโนมัติเมื่อยังไม่มีบัญชีเจ้าหน้าที่)
8. สร้างบัญชีเจ้าหน้าที่คนอื่น (หรือใช้หน้า “บัญชีเจ้าหน้าที่” หลังล็อกอินเป็นแอดมิน):
   ```bash
   php db/create-staff.php --name="สมชาย" --pin=5678 --role=technician
   php db/create-staff.php --name="ผู้ดูแล" --pin=5679 --role=admin
   php db/create-staff.php --list
   ```

เว็บไซต์ใช้ `HashRouter` เช่น `/#/tracker` จึงทำงานในโฟลเดอร์ย่อยของ XAMPP ได้โดยไม่ต้องตั้ง rewrite
วันที่ในฐานข้อมูลเป็น ค.ศ.; API ส่งวันแบบ `dd/mm/yyyy` และกำหนดครบกำหนด +30 วันตามเวลาไทย

## การตั้งค่า environment

ตั้งค่าผ่าน environment ของ web server หรือ `public/api/config.local.php`

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `campus_repair` | ชื่อฐานข้อมูล |
| `DB_USER` | `root` | ผู้ใช้ MySQL |
| `DB_PASSWORD` | ว่าง | รหัสผ่าน MySQL |
| `STAFF_PIN` | ว่าง | PIN ของบัญชีเริ่มต้น (อย่างน้อย 4 หลัก) |
| `STAFF_NAME` | `เจ้าหน้าที่` | ชื่อบัญชีเริ่มต้น |
| `UPLOADS_DIR` | `public/uploads` | โฟลเดอร์เก็บรูป |
| `UPLOAD_DAILY_BYTES` | `52428800` | โควตารูปต่อ IP ต่อวัน (0 = ปิด) |
| `TRUSTED_PROXIES` | ว่าง | IP ของ proxy ที่เชื่อถือได้ คั่นด้วย comma |
| `RATE_LIMIT_DIR` | `public/api/storage/ratelimit` | ที่เก็บตัวนับ rate limit |

อย่าใส่รหัสฐานข้อมูลหรือ PIN ในตัวแปร `VITE_*` เพราะจะถูกฝังใน JavaScript ฝั่ง browser
ค่าเริ่มต้นของ frontend คือ `./api/index.php`; ถ้าต้องการชี้ไป origin อื่นให้ตั้ง `VITE_API_URL`
และถ้าต้องการสาธิตชั่วคราวให้ตั้ง `VITE_API_URL=demo`

## พัฒนา / build

ต้องมี Node.js 20.19+ และ PHP 8.0+ (แนะนำ 8.2/8.3) พร้อม `pdo_mysql`, `gd`, `mbstring`

```bash
npm ci
cp public/api/config.local.example.php public/api/config.local.php
php db/migrate.php

# Terminal 1
npm run dev:api
# Terminal 2
npm run dev
```

เปิด URL ที่ Vite แสดง (ปกติ `http://localhost:5173`) แล้วทดสอบ
ถ้าต้องการ build:

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` จะคัดลอก `public/api/` และ `public/uploads/` ไป `dist/`
อย่าลบ `uploads/` บนเซิร์ฟเวอร์จริงตอน deploy

## บัญชีเจ้าหน้าที่และความปลอดภัย

- บัญชีเจ้าหน้าที่เก็บเป็น `name` + `pin_hash` (password hash) + `role` ในตาราง `staff_users`
- ล็อกอินสำเร็จจะได้ token อายุ 12 ชั่วโมง เก็บใน `sessionStorage` ฝั่ง browser
- ลอง PIN ผิด 5 ครั้งจะล็อกบัญชี 15 นาที
- `loginStaff` ถูกจำกัด 10 ครั้ง/นาทีต่อ IP
- รีเซ็ต PIN หรือปิดใช้งานบัญชีจะยกเลิก session เดิมของบัญชีนั้น
- ทุกการเปลี่ยนสถานะ/แก้ไข/ลบจะถูกบันทึกใน `repair_job_events`
- รายการสาธารณะไม่แสดงเบอร์โทร/อีเมลผู้แจ้ง; เจ้าหน้าที่ที่ล็อกอินจะเห็นข้อมูลติดต่อ
- ต้องให้สิทธิ์เขียนโฟลเดอร์ `uploads/` และ `public/api/storage/`

### บทบาทและสิทธิ์

| บทบาท | ดูรายการ/ประวัติ | อัปเดตสถานะ/แก้ไขงาน | ลบงาน | จัดการอาคาร | จัดการบัญชี |
|---|---|---|---|---|---|
| `admin` | ได้ | ได้ | ได้ | ได้ | ได้ |
| `technician` | ได้ | ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| `viewer` | ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |

ผู้ดูแลระบบจัดการบัญชีได้ที่เมนู **บัญชีเจ้าหน้าที่** (`/#/staff`):
สร้างบัญชี เปลี่ยนบทบาท รีเซ็ต PIN และเปิด/ปิดใช้งาน
ระบบป้องกันการปิดใช้งานบัญชีตัวเอง และป้องกันไม่ให้เหลือผู้ดูแลระบบที่ใช้งานอยู่เป็นศูนย์

บัญชีเริ่มต้นที่สร้างจาก `STAFF_PIN` จะเป็น `admin` ส่วนบัญชีใหม่ที่สร้างผ่านหน้าเว็บ/CLI
ค่าเริ่มต้นเป็น `technician` (กำหนด `--role` หรือเลือกในหน้าเว็บได้)

## สถานะงาน

ลำดับสถานะที่ใช้:

1. `รอแก้ไข`
2. `รับเรื่องแล้ว`
3. `กำลังซ่อม`
4. `รออะไหล่`
5. `ปิดงานแล้ว`
6. `ซ่อมไม่ได้`
7. `ยกเลิก`

สถานะ `ปิดงานแล้ว`, `ซ่อมไม่ได้`, `ยกเลิก` ถือเป็นสถานะสิ้นสุดและจะบันทึก `closed_date`
การเปลี่ยนกลับเป็นสถานะอื่นจะล้าง `closed_date`

## อาคาร/พื้นที่

- ข้อมูลเริ่มต้น 5 อาคารอยู่ในตาราง `zones`
- ผู้ดูแลระบบจัดการเพิ่ม/แก้ไข/ปิดใช้งานได้ที่เมนู “จัดการพื้นที่”
- ฟอร์มแจ้งซ่อมและหน้าแรกดึงรายการจาก API
- การปิดใช้งานจะไม่ลบงานเดิม

## รูปภาพ (uploads)

รูปก่อน/หลังซ่อมเก็บเป็นไฟล์ใต้ `uploads/<ปี>/<เดือน>/`
ฐานข้อมูลเก็บเฉพาะ path (`before_photo_path`, `after_photo_path`)
และมี thumbnail กว้าง 480px ชื่อ `<ไฟล์>-thumb.jpg`

- โฟลเดอร์ `uploads/` ต้องให้สิทธิ์เขียนกับผู้ใช้ของ web server
- สำรองทั้งฐานข้อมูลและ `uploads/` คู่กันเสมอ
- ถ้าเก็บ uploads ไว้นอกรากเว็บ ให้ตั้ง `UPLOADS_DIR` เป็น absolute path
- ถ้ายังมีฐานข้อมูลเดิมที่เก็บ base64 ในคอลัมน์ `*_photo_data_url` ให้ใช้ `db/migrate-photos.php`:
  ```bash
  php db/migrate-photos.php --dry-run --uploads=/opt/lampp/htdocs/campus-repair/uploads
  php db/migrate-photos.php --uploads=/opt/lampp/htdocs/campus-repair/uploads
  php db/migrate-photos.php --uploads=... --drop-blobs
  ```
  ควรสำรองฐานข้อมูลก่อนใช้ `--drop-blobs`

## Migration / backup / deploy check

```bash
php db/migrate.php                 # อัปเดตสคีมา (รันซ้ำได้)
php db/create-staff.php --list     # ดูบัญชีเจ้าหน้าที่
php db/deploy-check.php            # ตรวจความพร้อม
php db/backup.sh ./backups         # สำรอง DB + uploads
```

`db/migrate.php` สร้างตารางที่ขาด เพิ่มคอลัมน์/Index และอัปเดต ENUM ของสถานะ
พร้อมบันทึกเวอร์ชันใน `schema_migrations`

`db/deploy-check.php` ตรวจ PHP/extensions, config, MySQL, ตาราง/คอลัมน์,
บัญชีเจ้าหน้าที่, สถานะ, zones, uploads, rate-limit directory และพื้นที่ดิสก์
ผลลัพธ์เป็น `PASS` / `WARN` / `FAIL`; exit 1 เมื่อมี FAIL

`db/prune-uploads.php` ลบรูปที่ไม่มี path ไหนใน `repair_jobs` ชี้มา:

```bash
php db/prune-uploads.php --dry-run
php db/prune-uploads.php --uploads=/opt/lampp/htdocs/campus-repair/uploads --min-age=86400
```

ตัวอย่าง cron:

```bash
10 3 * * *  cd /home/deploy/campus-repair && php db/deploy-check.php --uploads=/opt/lampp/htdocs/campus-repair/uploads >> /var/log/campus-api.log 2>&1
40 3 * * 0  cd /home/deploy/campus-repair && php db/prune-uploads.php --uploads=/opt/lampp/htdocs/campus-repair/uploads --min-age=86400 >> /var/log/campus-prune.log 2>&1
```

cron ไม่ได้รับ `DB_*`/`STAFF_PIN` จาก shell อัตโนมัติ ให้ใช้ `public/api/config.local.php`

## ความปลอดภัยของฟอร์มสาธารณะ

- **Rate limit ต่อ IP**: `createIssue` 10 ครั้ง/นาที (ไฟล์ใน `public/api/storage/ratelimit/`)
- **Login rate limit**: `loginStaff` 10 ครั้ง/นาที และล็อกบัญชีเมื่อลอง PIN ผิด 5 ครั้ง
- **สิทธิ์ตามบทบาท**: ตรวจที่ API ทุกครั้ง ไม่พึ่งการซ่อนปุ่มใน UI
- **Honeypot**: ฟิลด์ซ่อน `website`; ถ้ามีค่าจะตอบ `400` แบบไม่บอกสาเหตุ
- **เพดานรูปต่อ IP ต่อวัน**: `UPLOAD_DAILY_BYTES` (ค่าเริ่มต้น 50 MB)
- **จำกัดความยาวฟิลด์**: 2,000 ตัวอักษรสำหรับข้อความยาว, 191 สำหรับชื่อ/โซน/หมวด, 64 สำหรับรหัส
- **ตรวจ Origin**: API รับเฉพาะคำขอจาก origin เดียวกัน
- **X-Forwarded-For**: อ่านเฉพาะเมื่อคำขอมาจาก IP ใน `TRUSTED_PROXIES`

## การแจ้งเตือน

แจ้งเตือนเป็นแบบ **in-app** ผ่านกระดิ่งใน header สำหรับเจ้าหน้าที่:
- งานที่ยังไม่ปิดและครบกำหนดภายใน 3 วัน
- งานที่เลยกำหนด
- จำนวนงานที่ยังไม่มอบหมาย

ระบบนี้ **ไม่ส่งแจ้งเตือนผ่าน LINE** และไม่ต้องใช้ token ภายนอก
หากต้องการอีเมล/SMS/LINE ภายหลังสามารถเพิ่มภายหลังได้โดยไม่กระทบข้อมูลงาน

## ทดสอบ

```bash
npm run typecheck
npm test                 # unit tests ของ API client
npm run build

# ต้องมี API + MySQL รันอยู่
rm -f public/api/storage/ratelimit/*.json
API_BASE=http://127.0.0.1:8099/api/index.php \
STAFF_PIN=1234 \
UPLOADS_DIR="$PWD/public/uploads" \
node tests/api-smoke.mjs
```

CI อยู่ที่ `.github/workflows/ci.yml`:
- frontend: typecheck, unit test, build
- api: PHP lint, migrate, deploy-check และ smoke test กับ MariaDB 10.11

## โฮสติ้ง

อัปโหลด `dist/` ไปยัง PHP hosting ที่เปิด PDO MySQL
ตั้งค่า `api/config.local.php` หรือ environment ฝั่งเซิร์ฟเวอร์
ใช้ HTTPS และบัญชี MySQL เฉพาะแอปที่มีสิทธิ์ SELECT, INSERT, UPDATE, DELETE
ในตารางที่เกี่ยวข้อง

## ตรวจรับและแก้ปัญหา

- แจ้งซ่อมภาษาไทยพร้อมรูป: หลังรีเฟรชต้องยังเห็นข้อมูลและรูปเดิม
- PIN ผิด: ต้องอัปเดตสถานะไม่ได้; PIN ถูก: เปลี่ยนสถานะได้และมีประวัติ
- เปิดงานกลับ: ล้างวันที่ปิด แต่คงบันทึกและรูปหลังซ่อม
- API ตอบ 500: ดู PHP error log, config, `pdo_mysql` และรัน `php db/migrate.php`
- API ตอบ 503: ยังไม่มีตาราง/คอลัมน์ หรือยังไม่มีบัญชีเจ้าหน้าที่และ `STAFF_PIN`
- API ตอบ 405 เมื่อเปิดใน browser: ปกติ API รับ POST เท่านั้น
- ถ้าเห็นข้อความ PHP เป็นโค้ด: ต้องเปิดผ่าน Apache/PHP ไม่ใช่ดับเบิลคลิกไฟล์
- ใช้ DevTools Network ดู `api/index.php`: ควรตอบ JSON และ `ok: true`

## ผลตรวจในสภาพแวดล้อมจัดทำ

- React production build ผ่าน
- TypeScript typecheck ผ่าน
- Unit test ฝั่ง frontend ผ่าน (`npm test`, 10 tests)
- ตรวจไวยากรณ์ไฟล์ PHP ทั้งหมดด้วย PHP 8.3 ผ่าน
- ทดสอบ API กับ MariaDB 10.11 จริง: deploy-check ผ่าน 22 ข้อ (เตือน 1), smoke test ผ่าน 60 ข้อ
- ทดสอบสิทธิ์ admin/technician/viewer, การรีเซ็ต PIN และการปิดใช้งานบัญชีผ่าน API แล้ว
- ยังไม่ได้เชื่อมฐานข้อมูลของผู้ใช้จริง ต้องตั้งค่าตามขั้นตอนข้างต้นก่อน
