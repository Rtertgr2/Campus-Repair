-- MySQL 5.7+/8 or MariaDB 10.2+; select/create campus_repair in phpMyAdmin first.
-- For an existing database, run `php db/migrate.php` instead of importing this file.
-- Photos are files under uploads/<YYYY>/<MM>/; repair_jobs stores only paths.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS staff_users (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(191) NOT NULL,
 pin_hash VARCHAR(255) NOT NULL,
 role ENUM('admin','technician','viewer') NOT NULL DEFAULT 'technician',
 active TINYINT(1) NOT NULL DEFAULT 1,
 failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
 locked_until DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_staff_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_sessions (
 token_hash CHAR(64) NOT NULL PRIMARY KEY,
 staff_id BIGINT UNSIGNED NOT NULL,
 expires_at DATETIME NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_staff_sessions_staff (staff_id),
 KEY idx_staff_sessions_expiry (expires_at),
 CONSTRAINT fk_staff_sessions_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zones (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 group_id VARCHAR(64) NOT NULL,
 name VARCHAR(191) NOT NULL,
 detail VARCHAR(255) NOT NULL DEFAULT '',
 active TINYINT(1) NOT NULL DEFAULT 1,
 sort_order INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_zones_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO zones (group_id, name, detail, sort_order) VALUES
 ('B01', 'อาคารเรียน 1', 'ห้องเรียนและห้องปฏิบัติการ', 10),
 ('B02', 'อาคารเรียน 2', 'ห้องเรียนและห้องพักครู', 20),
 ('B03', 'อาคารอเนกประสงค์', 'ห้องประชุมและกิจกรรม', 30),
 ('B04', 'โรงอาหาร', 'พื้นที่รับประทานอาหาร', 40),
 ('B05', 'หอสมุด', 'ห้องอ่านหนังสือและคอมพิวเตอร์', 50);

CREATE TABLE IF NOT EXISTS repair_jobs (
 row_index BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 created_date DATE NOT NULL,
 due_date DATE NOT NULL,
 group_id VARCHAR(100) NOT NULL,
 zone VARCHAR(255) NOT NULL,
 category VARCHAR(255) NOT NULL DEFAULT '',
 risk_level VARCHAR(100) NOT NULL DEFAULT '',
 location_detail TEXT NOT NULL,
 suggestion TEXT NOT NULL,
 reporter_name VARCHAR(191) NOT NULL DEFAULT '',
 reporter_phone VARCHAR(64) NOT NULL DEFAULT '',
 reporter_email VARCHAR(191) NOT NULL DEFAULT '',
 before_photo_path VARCHAR(255) NOT NULL DEFAULT '',
 status ENUM('รอแก้ไข','รับเรื่องแล้ว','กำลังซ่อม','รออะไหล่','ปิดงานแล้ว','ซ่อมไม่ได้','ยกเลิก') NOT NULL DEFAULT 'รอแก้ไข',
 closed_date DATE NULL,
 after_photo_path VARCHAR(255) NOT NULL DEFAULT '',
 assigned_staff_id BIGINT UNSIGNED NULL,
 staff_note TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_repair_status (status),
 KEY idx_repair_zone (zone),
 KEY idx_repair_due (due_date),
 KEY idx_repair_created (created_date),
 KEY idx_repair_assigned (assigned_staff_id),
 CONSTRAINT fk_repair_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS repair_job_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 job_row_index BIGINT UNSIGNED NOT NULL,
 staff_id BIGINT UNSIGNED NULL,
 staff_name VARCHAR(191) NOT NULL DEFAULT '',
 action VARCHAR(50) NOT NULL,
 from_status VARCHAR(50) NOT NULL DEFAULT '',
 to_status VARCHAR(50) NOT NULL DEFAULT '',
 note TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_repair_events_job (job_row_index),
 KEY idx_repair_events_created (created_at),
 CONSTRAINT fk_repair_events_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
