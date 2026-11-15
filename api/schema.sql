-- Campus Repair — MySQL / MariaDB schema
-- ใช้ได้กับ MySQL 5.7+ , 8.0 และ MariaDB 10.2+
--
-- วิธีใช้งาน
--   import ผ่าน phpMyAdmin หรือเปิด http://localhost/campus-repair/api/install.php
--   (install.php ยังเติมคอลัมน์ที่เพิ่มภายหลังให้ฐานข้อมูลเดิมโดยอัตโนมัติ)
--
-- ทุกคำสั่งเป็น CREATE TABLE IF NOT EXISTS จึงรันซ้ำได้ปลอดภัย
--
-- status ตรงกับค่าคงที่ใน src/lib/api.ts และ api/lib/issues.php
--   'รอแก้ไข'    = STATUS_PENDING (ยังไม่ปิดงาน)
--   'ปิดงานแล้ว' = STATUS_CLOSED  (ปิดงานแล้ว)
--
-- รูปภาพเก็บเป็น path สัมพัทธ์ (uploads/xxxx.jpg) ไม่ใช่ base64 ในฐานข้อมูล
-- เพื่อให้ย้ายเครื่อง/ย้ายโดเมนได้โดยไม่ต้องแก้ข้อมูล

CREATE TABLE IF NOT EXISTS repair_jobs (
  row_index        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- ตั้งค่าเป็น 'GW-001' หลัง insert (มาจาก row_index) จึงปล่อยให้เป็น NULL ก่อน
  id               VARCHAR(32)     NULL DEFAULT NULL,
  created_date     DATE            NOT NULL,
  due_date         DATE            NOT NULL,
  group_id         VARCHAR(64)     NOT NULL,
  zone             VARCHAR(191)    NOT NULL,
  room             VARCHAR(64)     NOT NULL DEFAULT '',
  category         VARCHAR(191)    NOT NULL DEFAULT '',
  risk_level       VARCHAR(64)     NOT NULL DEFAULT '',
  location_detail  TEXT            NOT NULL,
  suggestion       TEXT            NOT NULL,
  -- ผู้แจ้ง (แสดงเต็มเฉพาะโหมดเจ้าหน้าที่)
  reporter_name    VARCHAR(191)    NOT NULL DEFAULT '',
  reporter_contact VARCHAR(64)     NOT NULL DEFAULT '',
  before_photo_url TEXT            NOT NULL,
  status           VARCHAR(32)     NOT NULL DEFAULT 'รอแก้ไข',
  closed_date      DATE            NULL DEFAULT NULL,
  after_photo_url  TEXT            NOT NULL,
  staff_note       TEXT            NOT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (row_index),
  -- กันสถานะแปลกๆ จากการแก้ฐานข้อมูลด้วยมือ
  -- (MySQL 5.7 อ่าน CHECK แต่ไม่บังคับ, MySQL 8.0.16+/MariaDB 10.2+ บังคับจริง)
  CONSTRAINT repair_jobs_status_check CHECK (status IN ('รอแก้ไข', 'ปิดงานแล้ว')),
  UNIQUE KEY repair_jobs_id_unique (id),
  KEY repair_jobs_status_idx (status),
  KEY repair_jobs_zone_idx (zone),
  KEY repair_jobs_due_idx (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessments (
  row_index          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id                 VARCHAR(32)     NULL DEFAULT NULL,
  student_id         VARCHAR(64)     NOT NULL,
  student_name       VARCHAR(191)    NOT NULL,
  level              VARCHAR(64)     NOT NULL DEFAULT '',
  group_id           VARCHAR(64)     NOT NULL,
  knowledge_correct  DECIMAL(6,1)    NOT NULL DEFAULT 0,
  knowledge_total    DECIMAL(6,1)    NOT NULL DEFAULT 10,
  knowledge_percent  INT             NOT NULL DEFAULT 0,
  awareness_points   DECIMAL(6,1)    NOT NULL DEFAULT 0,
  awareness_max      DECIMAL(6,1)    NOT NULL DEFAULT 12,
  awareness_percent  INT             NOT NULL DEFAULT 0,
  -- แอปส่ง created_at เป็นเวลาตาม APP_TIMEZONE (ไม่พึ่งเขตเวลาของ MySQL)
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (row_index),
  UNIQUE KEY assessments_id_unique (id),
  KEY assessments_group_idx (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการเปลี่ยนสถานะ (ใครเปลี่ยน จากอะไร เป็นอะไร เมื่อไร)
-- from_status = '' หมายถึง "สร้างรายการใหม่"
CREATE TABLE IF NOT EXISTS status_history (
  row_index       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  issue_row_index BIGINT UNSIGNED NOT NULL,
  issue_id        VARCHAR(32)     NOT NULL DEFAULT '',
  from_status     VARCHAR(32)     NOT NULL DEFAULT '',
  to_status       VARCHAR(32)     NOT NULL DEFAULT '',
  staff_name      VARCHAR(191)    NOT NULL DEFAULT '',
  note            TEXT            NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (row_index),
  KEY status_history_issue_idx (issue_row_index),
  CONSTRAINT status_history_issue_fk FOREIGN KEY (issue_row_index)
    REFERENCES repair_jobs (row_index) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
