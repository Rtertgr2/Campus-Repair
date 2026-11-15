# Deploy Campus Repair บน Ubuntu LTS (on-prem)

> **สถานะ:** ไฟล์/สคริปต์ในโฟลเดอร์นี้พร้อมใช้แล้ว แต่ขั้นตอนที่ต้องรันบนเซิร์ฟเวอร์จริง
> ยังต้องทำเมื่อได้เครื่อง Linux และ **ชื่อโดเมนจริง** (ตอนนี้ใช้ `<DOMAIN>` เป็นที่ว่าง)
>
> ตัวอย่างโดเมน: `repair.school.ac.th` — แทน `<DOMAIN>` ด้วยโดเมนของคุณทุกที่

## สถาปัตยกรรม

| ส่วน | ค่า |
| --- | --- |
| OS | Ubuntu Server LTS 22.04/24.04 |
| Web | Apache + **mod_php** (ให้ `.htaccess` เดิมทำงานครบ) |
| DB | MariaDB, ฐานข้อมูล `campus_repair`, user แยก (ไม่ใช้ root) |
| PHP | 8.1 (22.04) หรือ 8.3 (24.04) + `pdo_mysql`, `mbstring`, `gd`, `curl`, `xml` |
| Node | 20 LTS — ใช้ build บนเซิร์ฟเวอร์ |
| Path | เว็บใต้ `https://<DOMAIN>/campus-repair/` |
| TLS | Let's Encrypt แบบ **DNS-01** (ไม่ต้องเปิดพอร์ต 80 ให้ LE) |
| ข้อมูล | อยู่บนเครื่อง (on-prem) |
| Backup | รายวันไป NAS เก็บ 14 วัน |

ไฟล์ในโฟลเดอร์นี้:

| ไฟล์ | ใช้ที่ไหน | หน้าที่ |
| --- | --- | --- |
| `setup-ubuntu.sh` | เซิร์ฟเวอร์ | ติดตั้งแพ็กเกจ + สร้างโฟลเดอร์ + สิทธิ์ |
| `apache-campus-repair.conf` | เซิร์ฟเวอร์ | vhost HTTP→HTTPS + security headers |
| `update-campus-repair.sh` | เซิร์ฟเวอร์ | `npm ci` + build + copy + migrate + reload |
| `backup-campus-repair.sh` | เซิร์ฟเวอร์ | สำรอง DB + uploads ไป NAS |
| `sync-from-windows.sh` | Windows | ส่งซอร์สขึ้นเซิร์ฟเวอร์ด้วย rsync |

---

## 0) สิ่งที่ต้องเตรียม

- เครื่อง Ubuntu ที่มี sudo และออกอินเทอร์เน็ตได้ (apt/npm/Let's Encrypt)
- โดเมนที่แก้ DNS ได้ (สำหรับ DNS-01) + สิทธิ์จัดการ firewall/NAT
- NAS ที่ mount เข้าเซิร์ฟเวอร์ (เช่น `/mnt/nas`)
- **ยังไม่ต้องมีข้อมูลจริง** — แผนนี้ย้ายเฉพาะโครงสร้างตาราง

Firewall ที่ควรเป็น:

```
22/tcp   จาก IP ผู้ดูแล
80/tcp   จากวงเครือข่ายโรงเรียน/VPN (ถ้าต้องการ redirect; DNS-01 ไม่ต้องใช้)
443/tcp  จากวงเครือข่ายโรงเรียน/VPN
```

---

## 1) ติดตั้งแพ็กเกจ

คัดลอก `setup-ubuntu.sh` ขึ้นเซิร์ฟเวอร์แล้วรัน:

```bash
sudo bash setup-ubuntu.sh
```

สคริปต์จะติดตั้ง Apache + PHP (mod_php) + MariaDB + certbot + Node 20 + rsync,
เปิด `rewrite/headers/ssl`, และสร้าง `/var/www/campus-repair` กับ `/opt/campus-repair/src`

---

## 2) ฐานข้อมูล

```bash
sudo mysql
```

```sql
CREATE DATABASE campus_repair
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'campus'@'localhost' IDENTIFIED BY 'เปลี่ยนเป็นรหัสที่แข็งแรง';
GRANT ALL PRIVILEGES ON campus_repair.* TO 'campus'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> รหัสนี้ใช้ทั้งใน `api/config.php` และ `/etc/campus-repair/backup.cnf` (หัวข้อ 8)

---

## 3) ตั้งค่า `api/config.php`

หลัง deploy รอบแรก (หัวข้อ 4) ให้แก้ `/var/www/campus-repair/api/config.php`:

```php
'db' => [
    'host' => '127.0.0.1',
    'port' => 3306,
    'name' => 'campus_repair',
    'user' => 'campus',
    'password' => 'รหัสจริง',
],
'staff_pin' => 'รหัสใหม่ที่ไม่ใช่ 7391',
'pin_lock' => ['enabled' => true, 'max_attempts' => 5, 'window_minutes' => 15, 'lock_minutes' => 15],
'rate_limit' => ['enabled' => true, 'create_issue_per_minute' => 10, 'submit_assessment_per_minute' => 10],
'debug' => false,
'cors_origins' => [],   // frontend กับ API อยู่ origin เดียวกัน
```

> ไฟล์นี้ **ไม่ถูกทับ** ตอน `update-campus-repair.sh`

---

## 4) Staging: ส่งโค้ด + build

บน Windows (Git Bash):

```bash
SERVER=admin@repair.school.ac.th bash ops/linux/sync-from-windows.sh
```

บนเซิร์ฟเวอร์:

```bash
sudo bash /opt/campus-repair/src/ops/linux/update-campus-repair.sh
```

สคริปต์จะ `npm ci`, build ด้วย `VITE_BASE_PATH=/campus-repair/`,
คัดลอก `dist/` ไป `/var/www/campus-repair/`, คัดลอก `api/` (ยกเว้น `config.php`, `uploads`, `storage`),
รัน `install.php` เพื่อสร้างตาราง แล้วลบ `install.php` ออกจาก web root

จากนั้นแก้ `api/config.php` ตามหัวข้อ 3 แล้วรัน `php /var/www/campus-repair/api/install.php` อีกครั้ง
ถ้าต้องการให้ตัวติดตั้งเขียน `install.lock`

---

## 5) Apache vhost

```bash
sudo cp /opt/campus-repair/src/ops/linux/apache-campus-repair.conf \
        /etc/apache2/sites-available/campus-repair.conf
sudo sed -i 's/<DOMAIN>/repair.school.ac.th/g' /etc/apache2/sites-available/campus-repair.conf
sudo a2ensite campus-repair
sudo apachectl configtest
sudo systemctl reload apache2
```

**Staging ก่อนมี cert:** ใช้บล็อก HTTP-only ที่คอมเมนต์ไว้ท้ายไฟล์ vhost (เปลี่ยน `ServerName`)
แล้วเปิดทดสอบ `http://repair.school.ac.th/campus-repair/`

ตรวจ `.htaccess`: ต้องมี `AllowOverride All` (มีในเทมเพลตแล้ว) ไม่งั้น SPA route และการบล็อกไฟล์จะไม่ทำงาน

---

## 6) TLS ด้วย DNS-01

ติดตั้ง plugin ตาม DNS provider เช่น Cloudflare:

```bash
sudo apt install -y python3-certbot-dns-cloudflare

sudo mkdir -p /etc/letsencrypt
sudo tee /etc/letsencrypt/cloudflare.ini >/dev/null <<'EOF'
dns_cloudflare_api_token = <TOKEN>
EOF
sudo chmod 600 /etc/letsencrypt/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d repair.school.ac.th \
  --agree-tos -m admin@school.ac.th --non-interactive
```

ถ้า provider ไม่มี plugin/API ให้ใช้ manual TXT:

```bash
sudo certbot certonly --manual --preferred-challenges dns -d repair.school.ac.th
```

ต่ออายุ:

```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot   # ควรมี timer ของ certbot
```

จากนั้นสลับ vhost เป็นบล็อก HTTPS (คอมเมนต์ HTTP-only ออก) แล้ว `sudo systemctl reload apache2`

> DNS-01 ทำให้ไม่ต้องเปิดพอร์ต 80 สู่สาธารณะ ซึ่งเข้ากับ firewall allowlist

---

## 7) Cutover

1. `sudo bash /opt/campus-repair/src/ops/linux/update-campus-repair.sh` รอบสุดท้าย
2. ตรวจว่า `api/config.php` เป็นค่าจริง และ `api/install.php` ไม่มีใน web root
3. เปิด `https://repair.school.ac.th/campus-repair/` และตรวจ:
   - `/audit`, `/tracker`, `/assess`, `/print`, `/qr` เปิดตรงได้ (SPA fallback)
   - API ตอบ JSON, อัปโหลดรูปได้, รูปเดิมเปิดได้
   - PWA ติดตั้งได้ (ตอนนี้เป็น HTTPS แล้ว)
4. ทดสอบ smoke test จากเครื่องในเครือข่าย:

```bash
BASE_URL=https://repair.school.ac.th/campus-repair/api/index.php \
STAFF_PIN=<PIN จริง> \
MYSQL_EXE=/usr/bin/mysql DB_NAME=campus_repair \
UPLOADS_DIR=/var/www/campus-repair/api/uploads \
RATE_LIMIT_DIR=/var/www/campus-repair/api/storage/ratelimit \
node tests/api-smoke.mjs
```

> ต้องรันบนเครื่องที่เข้าถึง DB ได้ (หรือปรับตัวแปรให้ตรง) — ตัวทดสอบจะสร้าง/ลบข้อมูลเอง

---

## 8) สำรองข้อมูลรายวัน

```bash
sudo install -m 755 /opt/campus-repair/src/ops/linux/backup-campus-repair.sh \
  /usr/local/bin/campus-repair-backup.sh

sudo mkdir -p /etc/campus-repair
sudo tee /etc/campus-repair/backup.cnf >/dev/null <<'EOF'
[client]
user=campus
password=รหัสจริง
EOF
sudo chmod 600 /etc/campus-repair/backup.cnf
```

ตั้ง cron ของ root:

```bash
sudo crontab -e
# 0 2 * * * /usr/local/bin/campus-repair-backup.sh >> /var/log/campus-repair-backup.log 2>&1
```

ทดสอบ restore (บน DB ชั่วคราว):

```bash
zcat /mnt/nas/campus-repair/<รอบ>/db.sql.gz | sudo mysql -e 'CREATE DATABASE campus_repair_restore;'
zcat /mnt/nas/campus-repair/<รอบ>/db.sql.gz | sudo mysql campus_repair_restore
sudo mysql -e 'SHOW TABLES FROM campus_repair_restore;'
sudo mysql -e 'DROP DATABASE campus_repair_restore;'
```

---

## 9) อัปเดตในอนาคต

```bash
# Windows
SERVER=admin@repair.school.ac.th bash ops/linux/sync-from-windows.sh
# เซิร์ฟเวอร์
sudo bash /opt/campus-repair/src/ops/linux/update-campus-repair.sh
```

สคริปต์จะ build ใหม่, copy, migrate schema, ตั้งสิทธิ์ และ reload Apache โดยไม่ทับ
`api/config.php`, `api/uploads`, `api/storage`

---

## 10) ตรวจรับ (Definition of Done)

- [ ] `npm run test:api` (ชี้ staging) ผ่านครบ รวม honeypot + rate limit
- [ ] HTTPS ใช้งานได้, HTTP redirect ไป HTTPS, `certbot renew --dry-run` ผ่าน
- [ ] `/audit` `/tracker` `/assess` `/print` `/qr` เปิดตรงได้
- [ ] อัปโหลดรูปได้ และรูปเปิดได้ (content-type `image/webp` หรือ `image/jpeg`)
- [ ] `api/config.php`, `api/schema.sql`, `api/lib/bootstrap.php`, `api/storage/*` เปิดผ่านเว็บไม่ได้ (403)
- [ ] `install.php` ไม่มีใน web root / ถูกล็อกด้วย `install.lock`
- [ ] `debug=false`, เปลี่ยน `staff_pin` แล้ว, `pin_lock` + `rate_limit` เปิด
- [ ] backup cron ทำงาน และทดสอบ restore ผ่าน
- [ ] firewall อนุญาตเฉพาะวงที่กำหนด

---

## 11) Troubleshooting

| อาการ | ตรวจ |
| --- | --- |
| 404 ทุกหน้า ยกเว้น `/` | `AllowOverride All` หรือ `mod_rewrite` ไม่เปิด |
| หน้าเว็บขาว/หา assets ไม่เจอ | build ด้วย `VITE_BASE_PATH=/campus-repair/` หรือยัง |
| 403 `config.php` ไม่ขึ้น (แต่ต้องการให้ขึ้น?) | ถูกบล็อกแล้ว — ถูกต้อง |
| `เชื่อมต่อฐานข้อมูลไม่สำเร็จ` | user/รหัสใน `api/config.php`, `sudo systemctl status mariadb` |
| อัปโหลดไม่ผ่าน | สิทธิ์ `api/uploads` ต้องเป็น `www-data:www-data` 775 |
| certbot DNS ล้มเหลว | token/สิทธิ์ DNS, propagation, ชื่อ record `_acme-challenge` |
| rate limit ทำงานทั้งที่ควรผ่าน | `rate_limit` ใน config หรือล้างไฟล์ใน `api/storage/ratelimit/` |

---

## ยังค้าง (ต้องตัดสินก่อนหัวข้อ 6–7)

- **ชื่อโดเมนจริง** และ DNS provider (สำหรับ DNS-01)
- ช่วง IP/วงเครือข่ายที่ firewall อนุญาต (หรือ VPN)
- เฟสถัดไป: บัญชีเจ้าหน้าที่จริงแทน PIN ร่วม

## หมายเหตุ

- PIN เป็นรหัสร่วม 4 หลัก — ยอมรับได้เมื่อมี firewall allowlist; ควรมีบัญชีจริงในเฟสถัดไป
- ถ้าภายหลังต้องย้ายข้อมูลจริงจาก Windows MariaDB 10.11:
  `mysqldump -u root campus_repair > backup.sql` แล้ว import บนเซิร์ฟเวอร์ + คัดลอก `api/uploads/`
- build บนเซิร์ฟเวอร์กิน RAM ~1GB; ถ้าเครื่องเล็กให้ build บน Windows แล้วคัดลอก `dist/` แทน
