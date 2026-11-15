<?php
/**
 * ค่า config ของ backend PHP (api/)
 *
 * วิธีใช้บน XAMPP
 *   1. คัดลอกไฟล์นี้เป็น api/config.php
 *   2. แก้ db.name / db.user / db.password ให้ตรงกับ MySQL ของเครื่อง
 *   3. เปลี่ยน staff_pin ก่อนใช้งานจริง
 *
 * ไฟล์ api/config.php ไม่ถูก commit ขึ้น git (ดู .gitignore)
 * environment variable (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, STAFF_PIN,
 * APP_TIMEZONE, APP_DEBUG) จะ override ค่าในไฟล์นี้เสมอ
 */
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        // ต้องสร้างฐานข้อมูลนี้ก่อน (phpMyAdmin > New) หรือแก้ให้ตรงกับที่มีอยู่
        'name' => 'campus_repair',
        'user' => 'root',
        'password' => '',
    ],

    // PIN สำหรับเปลี่ยนสถานะงานซ่อม (ตรวจฝั่งเซิร์ฟเวอร์เท่านั้น)
    // ค่าเริ่มต้นนี้เป็นเพียงตัวอย่าง — ควรเปลี่ยนก่อนใช้งานจริง
    'staff_pin' => '7391',

    // ล็อกเมื่อกรอก PIN ผิดหลายครั้ง (เปิดใช้เป็นค่าเริ่มต้น)
    // ผิดครบ max_attempts ครั้งภายใน window_minutes จะถูกล็อก lock_minutes นาที
    'pin_lock' => [
        'enabled' => true,
        'max_attempts' => 5,
        'window_minutes' => 15,
        'lock_minutes' => 15,
    ],

    // จำกัดจำนวนคำขอต่อ IP สำหรับ endpoint ที่ไม่ต้องล็อกอิน (กันสแปม/abus)
    // หน่วยเป็น "ครั้งต่อนาที" — ตั้ง enabled=false เพื่อปิด
    'rate_limit' => [
        'enabled' => true,
        'create_issue_per_minute' => 10,
        'submit_assessment_per_minute' => 10,
    ],

    'timezone' => 'Asia/Bangkok',

    // วันครบกำหนดของงานซ่อม = วันที่แจ้ง + N วัน
    // ใช้เมื่อความเร่งด่วนไม่ตรงกับคีย์ใน due_days_by_risk
    'due_days' => 30,

    // วันครบกำหนดตามความเร่งด่วน (SLA)
    // คีย์ต้องตรงกับค่าที่หน้าเว็บส่งมา (riskLevel)
    'due_days_by_risk' => [
        'สูง' => 3,        // ฉุกเฉิน/อันตราย — ต้องเข้าไปดูเร็ว
        'ปานกลาง' => 7,
        'ต่ำ' => 30,
    ],

    // การย่อ/แปลงรูปฝั่งเซิร์ฟเวอร์ด้วย gd (ทำงานเมื่อ php เปิดส่วนขยาย gd)
    'photo_max_edge' => 1600,   // ด้านยาวสุด (px)
    'photo_quality' => 82,      // คุณภาพ WebP/JPEG (40-95)

    // origin ของ frontend ที่อนุญาตให้เรียก API ข้ามโดเมน
    // ค่าเริ่มต้น: ไม่มีเลย (ปลอดภัยที่สุด — frontend กับ API อยู่โฟลเดอร์เดียวกัน)
    // ถ้าจะทดสอบด้วย `npm run dev` (Vite พอร์ต 5173) ให้เปิดรายการนี้ชั่วคราว:
    //   'cors_origins' => ['http://localhost:5173', 'http://127.0.0.1:5173'],
    'cors_origins' => [],

    // token สำหรับเรียก api/install.php จากเครื่องอื่น
    // '' = เรียกได้เฉพาะจากเครื่องเซิร์ฟเวอร์เอง (127.0.0.1)
    'install_token' => '',

    // ลบรูปที่ไม่มีในฐานข้อมูลแล้วได้ที่ api/cleanup.php (CLI หรือ 127.0.0.1)

    // true = แสดงข้อความ error จริงใน JSON response (ใช้ตอนติดตั้งเท่านั้น)
    'debug' => false,
];
