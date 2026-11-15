#!/usr/bin/env node
/**
 * เตรียมโฟลเดอร์สำหรับวางใน htdocs ของ XAMPP
 *
 *   npm run package:xampp
 *   npm run package:xampp -- --dest "C:/xampp/htdocs/campus-repair"
 *   npm run package:xampp -- --dest "C:/xampp/htdocs" --root
 *
 * สคริปต์จะ
 *   1. build frontend ด้วย VITE_BASE_PATH / VITE_API_URL ที่คำนวณจากชื่อโฟลเดอร์ปลายทาง
 *   2. คัดลอก dist/ + public/.htaccess + api/ ไปยังโฟลเดอร์ปลายทาง
 *   3. สร้าง api/config.php จาก config.example.php เฉพาะเมื่อยังไม่มี (ไม่ทับของเดิม)
 *
 * ไฟล์เดิมในโฟลเดอร์ปลายทาง (api/config.php, รูปใน api/uploads, สถานะใน api/storage)
 * จะไม่ถูกเขียนทับหรือลบ
 */

import { copyFile, mkdir, readdir, readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = process.cwd()

function printHelp() {
  console.log(`
เตรียมโฟลเดอร์ Campus Repair สำหรับ XAMPP

  npm run package:xampp                                  -> deploy/campus-repair
  npm run package:xampp -- --dest <path>                 -> ระบุโฟลเดอร์ปลายทาง
  npm run package:xampp -- --dest <path> --root          -> ติดตั้งที่ราก htdocs (base path = /)
  npm run package:xampp -- --skip-build                  -> ใช้ dist/ ที่ build ไว้แล้ว

ตัวเลือก
  -d, --dest <path>   โฟลเดอร์ปลายทาง (ค่าเริ่มต้น deploy/campus-repair)
      --root          ไม่มีชื่อโฟลเดอร์ย่อย (base path เป็น /)
      --skip-build    ข้ามขั้นตอน build
  -h, --help          แสดงข้อความนี้
`)
}

function parseArgs(argv) {
  const args = { dest: '', root: false, skipBuild: false, help: false }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dest' || arg === '-d') {
      args.dest = argv[i + 1] ?? ''
      i += 1
    } else if (arg.startsWith('--dest=')) {
      args.dest = arg.slice('--dest='.length)
    } else if (arg === '--root') {
      args.root = true
    } else if (arg === '--skip-build') {
      args.skipBuild = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`ไม่รู้จักตัวเลือก: ${arg}`)
    }
  }

  return args
}

async function exists(target) {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** คัดลอกโฟลเดอร์แบบเรียกซ้ำ (ข้ามไฟล์ตาม filter ได้) */
async function copyTree(from, to, skip = null) {
  await mkdir(to, { recursive: true })

  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)

    if (skip && skip(entry.name, source)) continue

    if (entry.isDirectory()) {
      await copyTree(source, target, skip)
    } else if (entry.isFile()) {
      await copyFile(source, target)
    }
  }
}

/** อ่าน base path ที่ dist/index.html ถูก build ไว้จริง (คืน null ถ้าอ่านไม่ได้) */
async function detectBuiltBase() {
  const html = await readFile(path.join(ROOT, 'dist', 'index.html'), 'utf8')
  const match = /(?:src|href)="([^"]*?)assets\/index\.(?:js|css)"/.exec(html)
  if (!match) return null

  const found = match[1] || '/'
  return found === '' ? '/' : found
}

/** true เมื่อไฟล์อยู่ใต้โฟลเดอร์ที่กำหนด */
function isInside(filePath, folder) {
  return filePath.includes(`${path.sep}${folder}${path.sep}`)
}

/** ไม่คัดลอก config ของเครื่องนี้ รูปที่อัปโหลดแล้ว และสถานะชั่วคราว */
function skipApiFile(name, source) {
  if (name === 'config.php') return true
  if (isInside(source, 'uploads') && /\.(jpe?g|png|webp|gif)$/i.test(name)) return true
  if (isInside(source, 'storage') && name.endsWith('.json')) return true
  // install.lock เป็นของเครื่องนั้น ๆ — ไม่ต้องคัดลอกไปบล็อกตัวติดตั้งปลายทาง
  if (isInside(source, 'storage') && name === 'install.lock') return true
  return false
}

async function runNpm(npmArgs, env) {
  // บน Windows การ spawn ไฟล์ .cmd ตรง ๆ จะได้ EINVAL (Node 20+)
  // จึงเรียก npm ผ่าน npm-cli.js ด้วย node ตัวที่กำลังรันอยู่
  const npmCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  )
  const useCli = await exists(npmCli)

  const command = useCli ? process.execPath : 'npm'
  const args = useCli ? [npmCli, ...npmArgs] : npmArgs

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env,
      shell: !useCli && process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`npm ${npmArgs.join(' ')} ล้มเหลว (exit ${code})`))
    })
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    return
  }

  if (!(await exists(path.join(ROOT, 'api', 'schema.sql')))) {
    throw new Error('ไม่พบโฟลเดอร์ api/ ของโปรเจกต์ — รันสคริปต์นี้จากรากโปรเจกต์')
  }

  const dest = path.resolve(ROOT, args.dest || path.join('deploy', 'campus-repair'))

  if (dest === ROOT) {
    throw new Error('โฟลเดอร์ปลายทางต้องไม่ใช่รากโปรเจกต์ (เลือกโฟลเดอร์ย่อยหรือ htdocs)')
  }

  // base path ที่ frontend จะถูกติดตั้ง
  const base = args.root ? '/' : `/${path.basename(dest)}/`
  const apiUrl = `${base}api/index.php`

  if (args.skipBuild) {
    console.log('▸ ข้ามขั้นตอน build (ใช้ dist/ ที่มีอยู่)')
  } else {
    console.log(`\n▸ build frontend`)
    console.log(`  VITE_BASE_PATH = ${base}`)
    console.log(`  VITE_API_URL   = ${apiUrl}\n`)

    await runNpm(['run', 'build'], {
      ...process.env,
      VITE_BASE_PATH: base,
      VITE_API_URL: apiUrl,
    })
  }

  if (!(await exists(path.join(ROOT, 'dist', 'index.html')))) {
    throw new Error('ไม่พบ dist/index.html — รัน build ก่อน หรือไม่ต้องใช้ --skip-build')
  }

  // กันกรณี --skip-build แล้ว dist/ ถูก build ด้วย base อื่น (ได้เว็บที่ path ผิด)
  const builtBase = await detectBuiltBase()
  if (builtBase === null) {
    throw new Error('อ่าน base path จาก dist/index.html ไม่ได้ — ลอง build ใหม่โดยไม่ต้องใช้ --skip-build')
  }
  if (builtBase !== base) {
    throw new Error(
      `dist/ ถูก build ไว้ที่ base "${builtBase}" แต่โฟลเดอร์ปลายทางนี้ต้องใช้ "${base}" — ` +
        'รันใหม่โดยไม่ต้องใส่ --skip-build เพื่อให้ build ตรงกับ path ที่จะวางจริง',
    )
  }

  // 1) ไฟล์เว็บที่ build แล้ว
  await mkdir(dest, { recursive: true })
  await copyTree(path.join(ROOT, 'dist'), dest)

  // 2) rewrite rule สำหรับ SPA (คัดลอกตรง ๆ ไม่พึ่งการ copy public/ ของ Vite)
  await copyFile(path.join(ROOT, 'public', '.htaccess'), path.join(dest, '.htaccess'))

  // 3) backend PHP
  await copyTree(path.join(ROOT, 'api'), path.join(dest, 'api'), skipApiFile)

  // 4) config สำหรับเครื่องนี้ (ไม่ทับของเดิม)
  const destConfig = path.join(dest, 'api', 'config.php')
  if (await exists(destConfig)) {
    console.log('▸ พบ api/config.php เดิมในโฟลเดอร์ปลายทาง — ไม่ทับ')
  } else {
    await copyFile(path.join(ROOT, 'api', 'config.example.php'), destConfig)
    console.log('▸ สร้าง api/config.php จาก config.example.php (แก้ db/staff_pin ตามเครื่อง)')
  }

  const appUrl = base === '/' ? '/' : base

  console.log(`\n✓ พร้อมใช้งาน: ${dest}`)
  console.log(`  base path : ${base}`)
  console.log(`  API URL   : ${apiUrl}`)
  console.log('\nขั้นต่อไป')
  console.log('  1) ถ้ายังไม่ได้ชี้ --dest ไปที่ htdocs ให้คัดลอกโฟลเดอร์นี้ไปวางใน C:\\xampp\\htdocs')
  console.log(`  2) เปิด http://localhost${appUrl}api/install.php เพื่อสร้างตาราง (ครั้งเดียว)`)
  console.log(`  3) เปิด http://localhost${appUrl}`)
  console.log('\nหมายเหตุ: หลังติดตั้งเสร็จควรลบ api/install.php และเปลี่ยน staff_pin ใน api/config.php')
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
