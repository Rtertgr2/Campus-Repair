# Campus Repair — PHP + MySQL / phpMyAdmin

ปรับจาก Archive.zip ให้ React เรียก PHP API และบันทึก MySQL จริง
phpMyAdmin เป็นหน้าจัดการ MySQL ไม่ใช่ปลายทาง API ของแอป
รองรับแจ้งซ่อมพร้อมรูป, รายการงาน, PIN เจ้าหน้าที่, ปิด/เปิดงาน และแบบประเมิน

## ติดตั้งบน XAMPP (ใช้ไฟล์ build ที่รวมไว้แล้วได้ทันที)

1. เปิด Apache และ MySQL ใน XAMPP Control Panel
2. เข้า http://localhost/phpmyadmin สร้างฐานข้อมูล `campus_repair`
   เลือก collation `utf8mb4_unicode_ci`
3. คลิกฐานข้อมูลนี้ > Import > เลือก `db/schema.sql` > Go
   จะได้ตาราง `repair_jobs` และ `assessments` (ไม่มีข้อมูลตัวอย่าง)
4. คัดลอก **เนื้อหาทั้งหมดภายใน `dist/`** ไป `C:\xampp\htdocs\campus-repair\`
   โครงสร้างต้องเป็น `campus-repair/index.html`, `campus-repair/assets/`, `campus-repair/api/`
   อย่าอัปโหลดทั้ง source project ไปไว้บน public web root
5. ใน `htdocs/campus-repair/api/` คัดลอก `config.local.example.php` เป็น `config.local.php`
   แก้ให้ตรงกับ MySQL ของคุณ เช่น:

```php
<?php
return [
    'host' => '127.0.0.1',
    'port' => '3306',
    'database' => 'campus_repair',
    'username' => 'root',
    'password' => '',
    'staff_pin' => 'เปลี่ยนเป็นตัวเลขส่วนตัวอย่างน้อย6หลัก',
];
```

รหัสว่างของ root เป็นค่าเริ่มต้นใน XAMPP บางเครื่องเท่านั้น หากตั้งรหัสไว้ให้ใส่รหัสจริง
บัญชี MySQL อาจต่างจากบัญชีล็อกอิน phpMyAdmin
PIN ต้องเป็นตัวเลข 6 หลักขึ้นไป ไม่มี PIN เริ่มต้นสำหรับฐานข้อมูลจริง

6. เปิด **http://localhost/campus-repair/** แล้วทดลองแจ้งซ่อม
   รีเฟรชหน้า ข้อมูลต้องยังอยู่ และตรวจรายการใน phpMyAdmin ได้
7. กดโหมดเจ้าหน้าที่ ใส่ PIN ที่ตั้งไว้ ทดลองปิดงาน แนบรูปหลังซ่อม และเปิดงานกลับ

เว็บไซต์ใช้ HashRouter เช่น `/#/tracker` เพื่อทำงานในโฟลเดอร์ย่อยของ XAMPP โดยไม่ต้องตั้ง rewrite
ฐานข้อมูลใช้วันที่ ค.ศ.; API ส่งวันงานแบบ dd/mm/yyyy และกำหนดส่ง +30 วันตามเวลาไทย
เก็บภาพ JPEG/PNG/WebP เป็น data URL ในฐานข้อมูล จำกัดประมาณ 3 MB ต่อ data URL

## พัฒนา / build ใหม่

ต้องมี Node.js 20.19+ และ PHP 7.4+ (แนะนำ PHP 8.2+) พร้อมส่วนขยาย `pdo_mysql`

```bash
npm ci
# Terminal 1 (เพิ่ม path ของ php.exe ใน PATH หรือใช้ C:\xampp\php\php.exe แทน php)
npm run dev:api
# Terminal 2
npm run dev
```

เปิด URL ที่ Vite แสดง (ปกติ http://localhost:5173)
Vite จะ proxy `/api` ไป PHP ที่ 127.0.0.1:8080
ก่อนรัน API ให้คัดลอก `public/api/config.local.example.php` เป็น
`public/api/config.local.php` แล้วตั้งค่าฐานข้อมูลและ PIN
ต้องนำเข้า SQL ใน MySQL ก่อนเช่นเดียวกับการติดตั้งข้างต้น

```bash
npm run typecheck
npm run build
```

Vite คัดลอก `public/api/` เข้า `dist/api/` ทุกครั้งที่ build
ถ้าแก้ config เฉพาะใน dist ให้สำรองก่อน build ใหม่
ค่าเริ่มต้นของ frontend คือ `./api/index.php` ไม่ต้องสร้าง `.env`
หากต้องการสาธิตชั่วคราวตั้ง `VITE_API_URL=demo` ใน `.env.local` แล้วเริ่ม Vite/build ใหม่
โหมดนี้ไม่บันทึกข้อมูลถาวร ถ้า API จริงล้มเหลวจะขึ้นข้อผิดพลาด ไม่สลับไป mock อัตโนมัติ

## รูปภาพ (uploads)

รูปก่อน/หลังซ่อมถูกเก็บเป็นไฟล์ใต้ `uploads/<ปี>/<เดือน>/` ไม่เก็บ base64 ในตาราง
ฐานข้อมูลเก็บเฉพาะ path (`before_photo_path`, `after_photo_path`) และมี thumbnail
กว้าง 480px ชื่อ `<ไฟล์>-thumb.jpg` อยู่ข้างไฟล์จริง (ถ้าไม่ได้เปิดส่วนขยาย GD
ระบบจะใช้ไฟล์เต็มแทน thumbnail ให้เอง)

- โฟลเดอร์ `uploads/` ต้องให้สิทธิ์เขียนกับผู้ใช้ของ web server
- สำรองข้อมูลทั้งฐานข้อมูลและโฟลเดอร์ `uploads/` คู่กันเสมอ
- ตอน deploy ใหม่ ให้คัดลอกไฟล์ใน `dist/` ทับ และ **อย่าลบ** `uploads/` บนเซิร์ฟเวอร์
- ถ้าเก็บ uploads ไว้นอกโฟลเดอร์เว็บ ให้ตั้ง `UPLOADS_DIR` (absolute path) ให้ PHP

ถ้ายังไม่ได้ย้ายข้อมูลแล้ว deploy API ใหม่ API จะตอบ **503** พร้อมบอกให้รันสคริปต์นี้
ก่อน (ทุกคำสั่งที่แตะ `repair_jobs`) แทนที่จะพังเป็น error 500 กว้าง ๆ

ถ้าฐานข้อมูลเดิมยังเก็บ base64 ในคอลัมน์ `*_photo_data_url` ให้ย้ายข้อมูลครั้งเดียว
โดยต้องระบุโฟลเดอร์ uploads ของ **เว็บที่ deploy จริง** (โฟลเดอร์ที่มี `index.html`
และ `api/index.php` อยู่ข้าง ๆ เพราะ DB จะเก็บ path แบบ `uploads/<ปี>/<เดือน>/...`):

```bash
php db/migrate-photos.php --dry-run --uploads=/opt/lampp/htdocs/campus-repair/uploads
php db/migrate-photos.php --uploads=/opt/lampp/htdocs/campus-repair/uploads
php db/migrate-photos.php --uploads=... --drop-blobs   # ลบคอลัมน์เดิม (สำรองก่อน)
```

สคริปต์ตรวจโฟลเดอร์ปลายทางก่อนเขียน: ต้องชื่อ `uploads`, เขียนไฟล์ได้,
และต้องอยู่ในรากเว็บที่มี `index.html` + `api/index.php` ถ้ายืนยันไม่ได้จะหยุด
(exit 2) เว้นแต่ใส่ `--force` จากนั้นจะรายงานจำนวนรูปที่ย้ายและตรวจว่าไฟล์
อยู่จริงในโฟลเดอร์ปลายทาง (ถ้าหายจะ exit 1)

อย่าชี้ไปที่ `dist/uploads` เพราะ `npm run build` ล้าง `dist` ทั้งโฟลเดอร์
สคริปต์รันซ้ำได้ (ข้ามแถวที่ย้ายแล้ว) และเพิ่มคอลัมน์ path ให้เองถ้ายังไม่มี

## ตรวจความพร้อมและเก็บกวาดไฟล์

สองสคริปต์นี้รันจาก **โฟลเดอร์โปรเจกต์** (ไม่ใช่จาก `dist/` เพราะ `dist` ไม่มี `db/`)
และอ่านค่าเชื่อมต่อจาก `public/api/config.php` — ตั้ง `DB_HOST`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `STAFF_PIN` (หรือใช้ `public/api/config.local.php`) ให้ชี้ไปที่เว็บจริง
ก่อนรัน ถ้า uploads อยู่ที่อื่นให้ส่ง `--uploads=<absolute path>`; เรียกผ่านเบราว์เซอร์ไม่ได้ (ตอบ 404)

### `db/deploy-check.php` — ตรวจก่อน/หลัง deploy

```bash
php db/deploy-check.php
php db/deploy-check.php --uploads=/opt/lampp/htdocs/campus-repair/uploads
npm run deploy:check     # ทางลัด (ต้องมี PHP ในเครื่องที่รัน)
```

ตรวจ: PHP ≥ 8.0, `pdo_mysql`, `gd`, `mbstring`, ค่าคอนเนกชัน, `config.local.php`,
`STAFF_PIN`, การต่อ MySQL, ตาราง `repair_jobs` + คอลัมน์ `before_photo_path`/
`after_photo_path`, คอลัมน์ base64 เดิมเป็น NULL ได้, ตาราง `assessments`,
เขียนไฟล์ใน uploads ได้, uploads อยู่ใต้รากเว็บ, โฟลเดอร์ตัวนับ rate limit เขียนได้,
พื้นที่ดิสก์เหลือ ≥ 512 MB

- ตัวเลือก: `--uploads=<dir>` เท่านั้น นอกนั้นอ่านจาก config
- ผลลัพธ์: บรรทัดละ `PASS` / `WARN` / `FAIL` พร้อมวิธีแก้ และสรุปท้าย `ผ่าน X, เตือน Y, ต้องแก้ Z`
- **exit 0** = ไม่มี FAIL (WARN ไม่ทำให้ล้ม เช่น ไม่มี GD ก็ยังใช้รูปเต็มแทน thumbnail ได้)
- **exit 1** = มีอย่างน้อยหนึ่ง FAIL ต้องแก้ก่อนเปิดใช้

### `db/prune-uploads.php` — ลบไฟล์รูปที่ไม่มีเจ้าของ

```bash
php db/prune-uploads.php --dry-run
php db/prune-uploads.php --uploads=/opt/lampp/htdocs/campus-repair/uploads
php db/prune-uploads.php --min-age=600 --limit=100
```

ไฟล์กำพร้า = ไม่มี path ไหนใน `repair_jobs` ชี้มา (thumbnail ของรูปที่ถูกอ้างถึงนับว่ามีเจ้าของ)
ข้าม dotfile อย่าง `.htaccess` และข้ามไฟล์ที่เพิ่งเขียนภายใน `--min-age` เพราะอาจเป็นคำขอที่ยังทำงานอยู่

| ตัวเลือก | ความหมาย |
|---|---|
| `--dry-run` | พิมพ์รายการที่จะลบ (สูงสุด 20 บรรทัดแรก) ไม่ลบจริง — ควรใช้ก่อนทุกครั้ง |
| `--uploads=<dir>` | โฟลเดอร์ปลายทาง (ค่าเริ่มต้น `UPLOADS_DIR` หรือ `public/uploads`) |
| `--min-age=<วินาที>` | ข้ามไฟล์ที่ใหม่กว่านี้ (ค่าเริ่มต้น 3600, `0` = ไม่ข้าม) |
| `--limit=<n>` | ลบไม่เกิน n ไฟล์ต่อรอบ |

- **exit 0** = ทำงานจบ (ไม่พบไฟล์ หรือลบสำเร็จทั้งหมด)
- **exit 1** = หาโฟลเดอร์ไม่เจอ / อ่านฐานข้อมูลไม่ได้ / มีไฟล์ที่ลบไม่สำเร็จ (พิมพ์ path ทาง stderr)

ตั้งรันเป็นรอบ (cron) บนเครื่องที่มองเห็นทั้งฐานข้อมูลและโฟลเดอร์ uploads:

```bash
# ตรวจความพร้อมทุกวัน 03:10 และเก็บกวาดไฟล์กำพร้าทุกสัปดาห์ (อาทิตย์ 03:40)
10 3 * * *  cd /home/deploy/campus-repair && php db/deploy-check.php --uploads=/opt/lampp/htdocs/campus-repair/uploads >> /var/log/campus-api.log 2>&1
40 3 * * 0  cd /home/deploy/campus-repair && php db/prune-uploads.php --uploads=/opt/lampp/htdocs/campus-repair/uploads --min-age=86400 >> /var/log/campus-prune.log 2>&1
```

cron ไม่ได้รับ `DB_*`/`STAFF_PIN` จาก shell โดยอัตโนมัติ — ถ้าไม่ได้ export ไว้ ใน crontab
ให้ใช้ `public/api/config.local.php` แทน และรัน `--dry-run` ด้วยมือหนึ่งครั้งก่อนเปิด cron

## ความปลอดภัยของฟอร์มสาธารณะ

- **Rate limit ต่อ IP**: `createIssue` และ `submitAssessment` จำกัด 10 ครั้ง/นาที
  เก็บสถานะเป็นไฟล์ที่ `public/api/storage/ratelimit/` (แยก bucket ตาม action+IP,
  เขียนแบบ `flock`) ไม่เกี่ยวกับ PIN ของเจ้าหน้าที่ และตอบ `429` พร้อม `Retry-After: 60`
  ถ้าโฟลเดอร์เขียนไม่ได้ ระบบจะ log แล้วปล่อยผ่าน เพื่อไม่ให้ฟอร์มล่ม
- **อยู่หลัง proxy/CDN**: ตั้ง `TRUSTED_PROXIES` เป็น IP ของ proxy (คั่นด้วย comma)
  เช่น `TRUSTED_PROXIES=10.0.0.5` — API จะอ่าน `X-Forwarded-For` เฉพาะเมื่อคำขอมาจาก
  IP ที่ระบุ และใช้ IP ขวาสุดที่ไม่ใช่ proxy เป็นคีย์ของเพดาน ถ้าไม่ตั้ง (ค่าเริ่มต้น)
  header นี้จะถูกเมินทั้งหมด เพราะใครก็ส่งมาได้
- **เพดานรูปต่อ IP ต่อวัน**: `UPLOAD_DAILY_BYTES` (ค่าเริ่มต้น 50 MB, `0` = ปิด)
  นับจากขนาดรูปที่แนบมากับ `createIssue` เท่านั้น — เกินแล้วได้ `429` พร้อม
  `Retry-After` ถึงเที่ยงคืน (การปิดงานของเจ้าหน้าที่ไม่ถูกนับ)
- **Honeypot**: ฟิลด์ซ่อน `website` (absolute + off-screen) ในหน้าแจ้งซ่อม
  ถ้ามีค่า ฝั่งเซิร์ฟเวอร์ปฏิเสธด้วย `400` ข้อความกลาง ๆ "ไม่สามารถดำเนินการได้"
  โดยไม่บอกสาเหตุ (ตรวจทั้ง top-level และใน `issue`/`assessment`)
- **จำกัดความยาวฟิลด์** (นับเป็นตัวอักษร): 2,000 สำหรับ `locationDetail`, `suggestion`,
  `staffNote`; 191 สำหรับ `zone`, `category`, `riskLevel`, `studentName`;
  64 สำหรับ `groupId`, `studentId`, `level` — ค่าที่เกินขอบเขตเข้มจะถูกปฏิเสธก่อน
- ต้องให้สิทธิ์เขียนโฟลเดอร์ `public/api/storage/` กับผู้ใช้ของ web server

รัน smoke test (ต้องมี API รันอยู่และ DB ที่ migrate แล้ว):

```bash
rm -f public/api/storage/ratelimit/*.json   # ให้ตัวนับเริ่มใหม่
API_BASE=http://127.0.0.1:8080/api/index.php STAFF_PIN=123456 npm run test:api
```

## โฮสติ้ง

อัปโหลดเนื้อหาของ dist ไปยัง PHP hosting ที่เปิด PDO MySQL และตั้งค่า api/config.local.php
หรือกำหนด environment ฝั่งเซิร์ฟเวอร์: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, STAFF_PIN
ใช้ HTTPS และบัญชี MySQL เฉพาะแอปที่มีสิทธิ์ SELECT, INSERT, UPDATE ในสองตารางนี้
อย่าใส่รหัสฐานข้อมูล/PIN ลงในตัวแปร VITE_* เพราะจะถูกฝังใน JavaScript ที่ผู้ใช้เปิดดูได้
ระบบคงรูปแบบเดิมคือเปิดอ่านรายการและส่งแจ้งซ่อมได้สาธารณะ ส่วนแก้สถานะต้องใช้ PIN
หากจะเปิดสู่สาธารณะให้เพิ่มการจำกัดความถี่การลอง PIN ที่ web server/reverse proxy

## ตรวจรับและแก้ปัญหา

- แจ้งซ่อมภาษาไทยพร้อมรูป: หลังรีเฟรชต้องยังเห็นข้อมูลและรูปเดิม
- ใส่ PIN ผิด: ต้องแก้สถานะไม่ได้; PIN ถูก: ปิดงานแล้วต้องได้วันที่ปิด
- เปิดงานกลับ: ล้างวันที่ปิด แต่คงบันทึกและรูปหลังซ่อม
- API ตอบ 500: ดู Apache/PHP error log, ชื่อฐานข้อมูล, รหัสผ่าน, pdo_mysql และการนำเข้า schema
- API ตอบ 503 ตอนใช้ PIN: ยังไม่ได้ตั้ง PIN เป็นตัวเลขอย่างน้อย 6 หลัก
- API ตอบ 405 เมื่อเปิดใน browser: ปกติ API รับ POST เท่านั้น
- ถ้าเห็นข้อความ PHP เป็นโค้ด: ต้องเปิดผ่าน Apache/PHP ไม่ใช่ดับเบิลคลิกไฟล์ หรือใช้ Vite preview อย่างเดียว
- ใช้ DevTools Network ดู `api/index.php`: ควรตอบ JSON และ `ok: true`

ไฟล์ PostgreSQL เดิมเก็บไว้ใน `db/legacy-postgres/` เพื่ออ้างอิง ไม่ได้ถูกเรียกใช้งาน
ไฟล์ `apps-script/` เป็น backend เดิม ไม่จำเป็นสำหรับ PHP/MySQL
ไม่มีการย้ายข้อมูลเดิมจาก Google Sheets/Postgres อัตโนมัติ

## ผลตรวจในสภาพแวดล้อมจัดทำ

- React production build ผ่าน
- TypeScript typecheck ผ่าน
- ตรวจไวยากรณ์ไฟล์ PHP ทั้ง 3 ไฟล์ด้วย php-parser ในโหมด PHP 7.4 ผ่าน
- ยังไม่ได้รัน PHP API หรือทดสอบ CRUD กับ MySQL จริง (สภาพแวดล้อมไม่มี PHP/MySQL)
- ยังไม่ได้เชื่อมฐานข้อมูลของผู้ใช้ ต้องตั้งค่าตามขั้นตอนข้างต้นก่อน
