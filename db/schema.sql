-- MySQL 5.7+/8 or MariaDB 10.2+; select/create campus_repair in phpMyAdmin first.
-- Photos are files under uploads/<YYYY>/<MM>/; these tables store only paths.
SET NAMES utf8mb4;
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
 before_photo_path VARCHAR(255) NOT NULL DEFAULT '',
 status ENUM('รอแก้ไข','ปิดงานแล้ว') NOT NULL DEFAULT 'รอแก้ไข',
 closed_date DATE NULL,
 after_photo_path VARCHAR(255) NOT NULL DEFAULT '',
 staff_note TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 -- No secondary indexes: the app reads the whole list and filters in the browser.
 -- Add them together with server-side filtering.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS assessments (
 row_index BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 student_id VARCHAR(100) NOT NULL,
 student_name VARCHAR(255) NOT NULL,
 level VARCHAR(100) NOT NULL DEFAULT '',
 group_id VARCHAR(100) NOT NULL,
 knowledge_correct INT UNSIGNED NOT NULL,
 knowledge_total INT UNSIGNED NOT NULL,
 awareness_points INT UNSIGNED NOT NULL,
 awareness_max INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
