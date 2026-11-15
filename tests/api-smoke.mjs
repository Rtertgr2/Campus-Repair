#!/usr/bin/env node
/**
 * Smoke test ของ backend PHP (ต้องมี XAMPP + Apache + MariaDB รันอยู่)
 *
 *   npm run test:api
 *   BASE_URL=http://localhost/campus-repair/api/index.php STAFF_PIN=7391 npm run test:api
 *
 * ค่าเริ่มต้นทดสอบกับ http://localhost/campus-repair/api/index.php
 * ใช้ marker ในข้อมูลที่สร้าง เพื่อลบของทดสอบออกให้หมดเมื่อจบ (ทั้งแถวใน DB และไฟล์รูป)
 *
 * หมายเหตุ: สคริปต์ลบข้อมูลทดสอบด้วย mysql client โดยตรง
 * ถ้าเครื่องอื่นใช้ path ต่างจาก XAMPP ให้ตั้ง MYSQL_EXE / DB_NAME / UPLOADS_DIR
 */

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, unlinkSync } from "node:fs"
import path from "node:path"

const BASE_URL = process.env.BASE_URL ?? "http://localhost/campus-repair/api/index.php"
const STAFF_PIN = process.env.STAFF_PIN ?? "7391"
const DB_NAME = process.env.DB_NAME ?? "campus_repair"
const MYSQL_EXE = process.env.MYSQL_EXE ?? "C:/xampp/mysql/bin/mysql.exe"
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "C:/xampp/htdocs/campus-repair/api/uploads"
const RATE_LIMIT_DIR =
  process.env.RATE_LIMIT_DIR ?? "C:/xampp/htdocs/campus-repair/api/storage/ratelimit"

/** JPEG 1x1 (ทดสอบการอัปโหลดโดยไม่ต้องมีไฟล์ในเครื่อง) */
const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDX/wAALCAABAAEBAREA/8QAFAABAQAAAAAA" +
  "AAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AKp//9k="

const MARKER = `SMOKE-${Date.now()}`

let passed = 0
const failures = []
const createdPhotoUrls = []

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function post(payload) {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`backend ไม่ได้ตอบเป็น JSON (HTTP ${response.status}): ${text.slice(0, 200)}`)
  }
}

function thaiDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}/${date.getFullYear()}`
}

function cleanup() {
  if (existsSync(MYSQL_EXE)) {
    try {
      execFileSync(
        MYSQL_EXE,
        [
          "-u",
          "root",
          "-h",
          "127.0.0.1",
          "-P",
          "3306",
          "-e",
          `DELETE FROM ${DB_NAME}.repair_jobs WHERE location_detail LIKE '${MARKER}%';
           DELETE FROM ${DB_NAME}.assessments WHERE student_id LIKE '${MARKER}%';`,
        ],
        { stdio: "ignore" },
      )
      console.log("\n▸ ลบข้อมูลทดสอบในฐานข้อมูลแล้ว")
    } catch (error) {
      console.log(`\n! ลบข้อมูลทดสอบไม่สำเร็จ: ${error.message}`)
    }
  } else {
    console.log(`\n! ไม่พบ mysql client ที่ ${MYSQL_EXE} — ข้ามการลบข้อมูลทดสอบ`)
  }

  for (const url of createdPhotoUrls) {
    const file = path.join(UPLOADS_DIR, path.basename(new URL(url).pathname))
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch {
      // ไม่เป็นไร ไฟล์อาจถูกลบไปแล้ว
    }
  }

  clearRateLimit()
}

/** ล้างสถานะ rate limit (ต้องรันบนเครื่องเดียวกับเซิร์ฟเวอร์) */
function clearRateLimit() {
  try {
    for (const file of readdirSync(RATE_LIMIT_DIR)) {
      if (file.endsWith(".json")) unlinkSync(path.join(RATE_LIMIT_DIR, file))
    }
  } catch {
    // โฟลเดอร์อาจไม่มีหรืออยู่เครื่องอื่น — ข้าม
  }
}

async function main() {
  console.log(`Campus Repair — API smoke test\nBASE_URL: ${BASE_URL}\nMARKER: ${MARKER}\n`)

  // 1) ตรวจการเชื่อมต่อ
  const ping = await fetch(BASE_URL)
  const pingBody = await ping.json()
  check("GET แสดงสถานะ backend", pingBody.ok === true && pingBody.version >= 2, JSON.stringify(pingBody))

  // 2) สร้างงานซ่อม (ความเร่งด่วนสูง → ครบกำหนด 3 วัน) พร้อมรูป
  const created = await post({
    action: "createIssue",
    issue: {
      groupId: "B01",
      zone: "อาคารเรียน 1",
      room: "SMOKE-101",
      category: "ไฟฟ้า / หลอดไฟ",
      riskLevel: "สูง",
      locationDetail: `${MARKER} หลอดไฟดับ`,
      suggestion: "เปลี่ยนหลอด LED",
      reporterName: "ผู้ทดสอบระบบ",
      reporterContact: "0800000000",
      beforePhotoDataUrl: `data:image/jpeg;base64,${TINY_JPEG}`,
    },
  })
  check("createIssue สำเร็จ", created.ok === true && Boolean(created.issue?.id), JSON.stringify(created).slice(0, 200))
  const issue = created.issue ?? {}
  if (issue.beforePhotoUrl) createdPhotoUrls.push(issue.beforePhotoUrl)

  check("เก็บชื่อผู้แจ้ง", issue.reporterName === "ผู้ทดสอบระบบ", issue.reporterName)
  check("บันทึกห้อง", issue.room === "SMOKE-101", issue.room)
  check(
    "SLA ตามความเร่งด่วน (สูง = 3 วัน)",
    issue.dueDate === thaiDate(3),
    `ได้ ${issue.dueDate} คาดหวัง ${thaiDate(3)}`,
  )
  check("มีประวัติเริ่มต้น 1 รายการ", Array.isArray(issue.history) && issue.history.length === 1)
  check("บันทึกรูปก่อนซ่อม", Boolean(issue.beforePhotoUrl), String(issue.beforePhotoUrl))

  if (issue.beforePhotoUrl) {
    const photo = await fetch(issue.beforePhotoUrl)
    check("เปิดรูปที่อัปโหลดได้", photo.ok && (photo.headers.get("content-type") ?? "").startsWith("image/"), String(photo.status))
  }

  // 3) ค้นหา/กรอง/แบ่งหน้า
  const found = await post({ action: "listIssues", filters: { search: MARKER, pageSize: 5 } })
  check("ค้นหาด้วยคำค้นเจอรายการ", found.ok === true && found.total >= 1, `total=${found.total}`)
  check("ผลลัพธ์มี stats มาด้วย", Boolean(found.stats) && found.stats.total >= 1)

  const byRoom = await post({ action: "listIssues", filters: { zone: "อาคารเรียน 1", status: "รอแก้ไข", pageSize: 5 } })
  check("กรองตามอาคาร+สถานะทำงาน", byRoom.ok === true && byRoom.issues.every((row) => row.zone === "อาคารเรียน 1"))

  const paged = await post({ action: "listIssues", filters: { page: 1, pageSize: 2 } })
  check(
    "แบ่งหน้าคืนจำนวนตาม pageSize",
    paged.ok === true && paged.issues.length <= 2 && paged.pageSize === 2,
    `issues=${paged.issues?.length} pageSize=${paged.pageSize}`,
  )

  // 4) PIN ผิด / หมายเหตุว่าง ต้องถูกปฏิเสธ
  const wrongPin = await post({
    action: "updateStatus",
    rowIndex: issue.rowIndex,
    status: "ปิดงานแล้ว",
    pin: "0000",
    staffNote: "ทดสอบ",
  })
  check("PIN ผิดถูกปฏิเสธ", wrongPin.ok === false, JSON.stringify(wrongPin))

  const noNote = await post({
    action: "updateStatus",
    rowIndex: issue.rowIndex,
    status: "ปิดงานแล้ว",
    pin: STAFF_PIN,
    staffNote: "   ",
  })
  check("ปิดงานโดยไม่มีหมายเหตุถูกปฏิเสธ", noNote.ok === false, JSON.stringify(noNote))

  // 5) ปิดงาน + บันทึกชื่อเจ้าหน้าที่ลงประวัติ
  const closed = await post({
    action: "updateStatus",
    rowIndex: issue.rowIndex,
    status: "ปิดงานแล้ว",
    pin: STAFF_PIN,
    staffNote: "ซ่อมเสร็จโดยสคริปต์ทดสอบ",
    staffName: "ช่างทดสอบ",
  })
  check("ปิดงานสำเร็จ", closed.ok === true && closed.issue?.status === "ปิดงานแล้ว", JSON.stringify(closed).slice(0, 200))
  check("ประวัติมี 2 รายการ", closed.issue?.history?.length === 2, String(closed.issue?.history?.length))
  check(
    "ประวัติบันทึกชื่อผู้ปิดงาน",
    closed.issue?.history?.[1]?.staffName === "ช่างทดสอบ",
    closed.issue?.history?.[1]?.staffName,
  )

  // 6) เปิดงานอีกครั้ง
  const reopened = await post({
    action: "updateStatus",
    rowIndex: issue.rowIndex,
    status: "รอแก้ไข",
    pin: STAFF_PIN,
    staffName: "ช่างทดสอบ",
  })
  check("เปิดงานอีกครั้งได้", reopened.ok === true && reopened.issue?.status === "รอแก้ไข")
  check("ประวัติเพิ่มเป็น 3 รายการ", reopened.issue?.history?.length === 3, String(reopened.issue?.history?.length))

  // 7) ส่งออก CSV
  const csv = await post({ action: "exportIssues", filters: { search: MARKER } })
  check("exportIssues คืน CSV", csv.ok === true && typeof csv.csv === "string" && csv.csv.includes(issue.id ?? "GW-"))
  check("CSV มี BOM ให้ Excel อ่านไทยได้", typeof csv.csv === "string" && csv.csv.charCodeAt(0) === 0xfeff)

  // 8) แบบประเมิน
  const assessment = await post({
    action: "submitAssessment",
    assessment: {
      studentId: MARKER,
      studentName: "ผู้ทดสอบประเมิน",
      level: "ปวช.1",
      groupId: "B01",
      knowledgeCorrect: 8,
      knowledgeTotal: 10,
      awarenessPoints: 18,
      awarenessMax: 20,
    },
  })
  check("submitAssessment สำเร็จ", assessment.ok === true && Boolean(assessment.assessment?.id))
  check("คำนวณเปอร์เซ็นต์ถูก", assessment.assessment?.knowledgePercent === 80 && assessment.assessment?.awarenessPercent === 90)

  const listAssessments = await post({ action: "listAssessments" })
  check("listAssessments คืนรายการ+สรุป", listAssessments.ok === true && Array.isArray(listAssessments.assessments) && Boolean(listAssessments.summary))
  check("สรุปนับจำนวนถูก", listAssessments.summary?.total >= 1, String(listAssessments.summary?.total))

  // 9) health / cleanup (ต้องมี PIN)
  const health = await post({ action: "health", pin: STAFF_PIN })
  check("health คืนรายการคำเตือน", health.ok === true && Array.isArray(health.warnings))
  check("health บอกสถานะตัวติดตั้ง", typeof health.installLocked === "boolean")

  const healthWithoutPin = await post({ action: "health", pin: "0000" })
  check("health ปฏิเสธเมื่อ PIN ผิด", healthWithoutPin.ok === false)

  const cleanupDry = await post({ action: "cleanupPhotos", pin: STAFF_PIN, dryRun: 1 })
  check("cleanupPhotos (dry run) ทำงาน", cleanupDry.ok === true && Boolean(cleanupDry.result))

  // 10) ไฟล์ภายในต้องไม่ถูกเปิดเผย
  for (const file of ["config.php", "schema.sql", "lib/bootstrap.php"]) {
    const response = await fetch(new URL(file, BASE_URL))
    check(`บล็อก api/${file}`, response.status === 403, `HTTP ${response.status}`)
  }

  // 11) honeypot — ฟอร์มจริงส่งค่าว่าง ถ้ามีค่าต้องถูกปฏิเสธโดยไม่สร้างข้อมูล
  const hpMarker = `${MARKER}-HP`
  const hp = await post({
    action: "createIssue",
    issue: {
      groupId: "B01",
      zone: "อาคารเรียน 1",
      room: "SMOKE-HP",
      category: "อื่นๆ",
      riskLevel: "ต่ำ",
      locationDetail: `${hpMarker} spam`,
      suggestion: "",
      reporterName: "บอท",
      website: "http://spam.example",
    },
  })
  check("honeypot ปฏิเสธคำขอแจ้งซ่อม", hp.ok === false, JSON.stringify(hp).slice(0, 160))
  const hpLookup = await post({ action: "listIssues", filters: { search: hpMarker } })
  check("honeypot ไม่สร้างข้อมูล", hpLookup.total === 0, `total=${hpLookup.total}`)

  const hpAssessment = await post({
    action: "submitAssessment",
    assessment: {
      studentId: hpMarker,
      studentName: "บอท",
      level: "ปวช.1",
      groupId: "B01",
      knowledgeCorrect: 1,
      knowledgeTotal: 10,
      awarenessPoints: 1,
      awarenessMax: 12,
      website: "http://spam.example",
    },
  })
  check("honeypot ปฏิเสธแบบประเมิน", hpAssessment.ok === false)

  // 12) rate limit — ยิงเกินเพดานต่อนาทีต้องถูกปฏิเสธ (ใช้ honeypot เพื่อไม่สร้างแถว)
  clearRateLimit()
  let rateLimited = null
  for (let i = 0; i < 11; i++) {
    const response = await post({
      action: "createIssue",
      issue: {
        groupId: "B01",
        zone: "อาคารเรียน 1",
        room: "SMOKE-RL",
        category: "อื่นๆ",
        riskLevel: "ต่ำ",
        locationDetail: `${MARKER}-RL`,
        suggestion: "",
        reporterName: "rate",
        website: "http://spam.example",
      },
    })
    if (response.ok === false && String(response.error ?? "").includes("ถี่เกินไป")) {
      rateLimited = response
    }
  }
  check(
    "rate limit ทำงาน (คำขอที่เกินเพดานถูกปฏิเสธ)",
    Boolean(rateLimited),
    String(rateLimited?.error ?? "ไม่พบการปฏิเสธ"),
  )
  clearRateLimit()
}

main()
  .catch((error) => {
    console.error(`\n✗ เกิดข้อผิดพลาด: ${error.message}`)
    failures.push(error.message)
  })
  .finally(() => {
    cleanup()
    const total = passed + failures.length
    console.log(`\nผลรวม: ผ่าน ${passed}/${total}`)
    if (failures.length > 0) {
      console.log("รายการที่ไม่ผ่าน:")
      for (const item of failures) console.log(`  - ${item}`)
      process.exit(1)
    }
    console.log("ผ่านทั้งหมด ✓")
  })
