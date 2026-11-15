#!/usr/bin/env node
/**
 * Smoke tests for the Campus Repair API (Phase 0 hardening).
 *
 * Needs a running API with a migrated database, for example:
 *   DB_NAME=campus_repair STAFF_PIN=123456 php -S 127.0.0.1:8099 -t public
 *   API_BASE=http://127.0.0.1:8099/api/index.php STAFF_PIN=123456 node tests/api-smoke.mjs
 *
 * Optional, for the schema checks: LEGACY_API (a database that was never
 * migrated), PARTIAL_API (only the path columns were added) and
 * NO_ASSESSMENTS_API (migrated, but the assessments table was never imported),
 * QUOTA_API (migrated, with a tiny UPLOAD_DAILY_BYTES budget) and
 * PROXY_AWARE_API (started with TRUSTED_PROXIES pointing at the test host) and
 * NO_GD_API (started with the GD functions disabled), EDGE_API (fresh counters for
 * the photo edge cases) and PHOTO_FIXTURES (a folder with photo.jpg / photo.webp).
 *
 * The rate-limit checks assume fresh counters: delete
 * public/api/storage/ratelimit/*.json before running.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:8099/api/index.php";
const PIN = process.env.STAFF_PIN ?? "123456";
const LEGACY = process.env.LEGACY_API;
const PARTIAL = process.env.PARTIAL_API;
const NO_ASSESSMENTS = process.env.NO_ASSESSMENTS_API;
const QUOTA = process.env.QUOTA_API;
const PROXY = process.env.PROXY_AWARE_API;
const NO_GD = process.env.NO_GD_API;
const EDGE = process.env.EDGE_API;
/** Folder with photo.jpg / photo.webp fixtures, written by the test harness. */
const FIXTURES = process.env.PHOTO_FIXTURES ?? "";
/** Disk checks only make sense when the API runs on this machine. */
const LOCAL = ["127.0.0.1", "localhost"].includes(new URL(BASE).hostname);

/** 1x1 PNG, just enough for the photo validator. */
const PHOTO =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Minimal PNG writer: lets a test upload a big image that carries metadata. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function buildPng(width, height, comment) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = 20;
    row[2 + x * 3] = 60;
    row[3 + x * 3] = 90;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("tEXt", Buffer.from(`Comment\0${comment}`, "latin1")),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

async function post(payload, { origin, method = "POST", body, base = BASE, headers = {} } = {}) {
  const res = await fetch(base, {
    method,
    // The API only accepts requests from its own origin, so default to the target's.
    headers: { "Content-Type": "application/json", Origin: origin ?? new URL(base).origin, ...headers },
    body: method === "GET" ? undefined : (body ?? JSON.stringify(payload)),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON responses keep json null */
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

const listIssues = async () => (await post({ action: "listIssues" })).body?.issues ?? [];
const listAssessments = async () => (await post({ action: "listAssessments" })).body?.assessments ?? [];

let creates = 0;
async function createIssue(extra = {}, base = BASE, headers = {}) {
  const res = await post(
    {
      action: "createIssue",
      issue: { groupId: "B01", zone: "อาคารเรียน 1", category: "ไฟฟ้า", riskLevel: "ปกติ", ...extra },
    },
    { base, headers },
  );
  // Only the main endpoint matters for the rate-limit count.
  if (base === BASE && res.status === 200 && res.body?.ok) creates++;
  return res;
}

console.log(`API: ${BASE}\n`);

/* ---------------------------------------------------------------- basics */
const getRes = await post({}, { method: "GET" });
check("GET is refused with 405", getRes.status === 405, `status ${getRes.status}`);

const unknown = await post({ action: "deleteEverything" });
check("unknown action is refused", unknown.status === 400 && unknown.body?.error === "ไม่รู้จักคำสั่ง");

const brokenJson = await post(null, { body: "{" });
check("broken JSON is refused", brokenJson.status === 400 && brokenJson.body?.ok === false);

const foreign = await post({ action: "listIssues" }, { origin: "http://evil.example" });
check("foreign Origin is refused", foreign.status === 403);

const emptyList = await post({ action: "listIssues" });
check("listIssues answers ok", emptyList.status === 200 && Array.isArray(emptyList.body?.issues));

/* ------------------------------------- databases that have not been migrated */
/** A 503 that names the fix, not just a failure. */
const migrationHint = (res, pattern) => {
  const error = res.body?.error ?? "";
  return res.status === 503 && /migrate-photos\.php/.test(error) && pattern.test(error);
};

if (LEGACY) {
  const created = await createIssue({}, LEGACY);
  check(
    "un-migrated DB: createIssue answers 503 naming the missing columns",
    migrationHint(created, /before_photo_path/),
    created.body?.error ?? `status ${created.status}`,
  );

  const listed = await post({ action: "listIssues" }, { base: LEGACY });
  check(
    "un-migrated DB: listIssues explains instead of returning blank photos",
    migrationHint(listed, /before_photo_path/),
    listed.body?.error ?? `status ${listed.status}`,
  );

  const updated = await post(
    { action: "updateStatus", pin: PIN, rowIndex: 1, status: "ปิดงานแล้ว", staffNote: "x" },
    { base: LEGACY },
  );
  check(
    "un-migrated DB: updateStatus answers 503 instead of 500",
    migrationHint(updated, /before_photo_path/),
    updated.body?.error ?? `status ${updated.status}`,
  );
} else {
  console.log("SKIP  un-migrated database checks (set LEGACY_API to enable)");
}

if (PARTIAL) {
  const created = await createIssue({}, PARTIAL);
  check(
    "half-migrated DB: 503 names the NOT NULL blob columns",
    migrationHint(created, /NOT NULL/),
    created.body?.error ?? `status ${created.status}`,
  );
} else {
  console.log("SKIP  half-migrated database checks (set PARTIAL_API to enable)");
}

if (QUOTA) {
  const attempts = [];
  for (let i = 0; i < 3; i++) attempts.push(await createIssue({ beforePhotoDataUrl: PHOTO }, QUOTA));
  const accepted = attempts.filter((r) => r.status === 200).length;
  check("daily photo budget lets some uploads through", accepted >= 1, `${accepted} accepted`);
  check(
    "daily photo budget refuses the rest with 429 and a quota message",
    attempts.some((r) => r.status === 429 && /โควตาวันนี้/.test(r.body?.error ?? "")),
    attempts.map((r) => `${r.status}${r.body?.error ? ": " + r.body.error : ""}`).join(" | "),
  );

  const noPhoto = await createIssue({}, QUOTA);
  check(
    "reports without a photo are not charged by the photo budget",
    noPhoto.status === 200 && Boolean(noPhoto.body?.issue?.id),
    `status ${noPhoto.status}`,
  );
} else {
  console.log("SKIP  photo budget checks (set QUOTA_API to enable)");
}

if (NO_ASSESSMENTS) {
  const missingTable = (res) => res.status === 503 && /ยังไม่มีตาราง assessments/.test(res.body?.error ?? "") && /schema\.sql/.test(res.body?.error ?? "");

  const submitted = await post({ action: "submitAssessment", assessment: {} }, { base: NO_ASSESSMENTS });
  check(
    "missing assessments table: submitAssessment answers 503 pointing at schema.sql",
    missingTable(submitted),
    submitted.body?.error ?? `status ${submitted.status}`,
  );

  const listed = await post({ action: "listAssessments" }, { base: NO_ASSESSMENTS });
  check(
    "missing assessments table: listAssessments answers 503 too",
    missingTable(listed),
    listed.body?.error ?? `status ${listed.status}`,
  );

  const repairsStillWork = await createIssue({}, NO_ASSESSMENTS);
  check(
    "missing assessments table: repair jobs keep working",
    repairsStillWork.status === 200 && Boolean(repairsStillWork.body?.issue?.id),
    `status ${repairsStillWork.status}`,
  );
} else {
  console.log("SKIP  missing-assessments-table checks (set NO_ASSESSMENTS_API to enable)");
}

/* ------------------------------------------------ servers without GD */
if (NO_GD) {
  const res = await createIssue({ beforePhotoDataUrl: PHOTO }, NO_GD);
  const issue = res.body?.issue;
  check("without GD the upload still succeeds", res.status === 200 && Boolean(issue?.beforePhoto), `status ${res.status}`);
  check(
    "without GD the thumbnail falls back to the full photo",
    Boolean(issue?.beforePhoto) && issue.beforePhotoThumb === issue.beforePhoto,
    `${issue?.beforePhoto} / ${issue?.beforePhotoThumb}`,
  );
  if (LOCAL && issue?.beforePhoto) {
    const saved = readFileSync(`public/${issue.beforePhoto}`);
    check(
      "without GD the bytes are stored untouched",
      saved.equals(Buffer.from(PHOTO.split(",")[1], "base64")),
      `${saved.length} bytes`,
    );
  }
} else {
  console.log("SKIP  no-GD checks (set NO_GD_API to enable)");
}

/* -------------------------------------------------------------- creating */
const created = await createIssue({ locationDetail: "หลอดไฟดับ", beforePhotoDataUrl: PHOTO });
check("createIssue returns the stored row", created.status === 200 && Boolean(created.body?.issue?.id), created.body?.issue?.id);
check("photo is stored as a path", /^uploads\/\d{4}\/\d{2}\/[0-9a-f]{32}\.png$/.test(created.body?.issue?.beforePhoto ?? ""), created.body?.issue?.beforePhoto);
check("photo thumbnail is returned", /-thumb\.jpg$/.test(created.body?.issue?.beforePhotoThumb ?? ""));
check("create response carries no base64", !created.text.includes("data:image"));

/* ------------------------------------------------- re-encoding on upload */
const bigPng = buildPng(2000, 1200, "GPS 13.7563,100.5018");
const bigUpload = await createIssue({
  locationDetail: "ตรวจการย่อรูป",
  beforePhotoDataUrl: `data:image/png;base64,${bigPng.toString("base64")}`,
});
const bigPath = bigUpload.body?.issue?.beforePhoto ?? "";
check("a 2000x1200 upload is accepted", bigUpload.status === 200 && /\.png$/.test(bigPath), `status ${bigUpload.status}, ${bigPath}`);

// A separate thumbnail means GD ran, which is also when re-encoding happens.
const gdActive = Boolean(bigPath) && bigUpload.body?.issue?.beforePhotoThumb !== bigPath;
if (LOCAL && gdActive) {
  const saved = readFileSync(`public/${bigPath}`);
  const width = saved.readUInt32BE(16);
  const height = saved.readUInt32BE(20);
  check("the long side is capped at 1600 and the ratio kept", width === 1600 && height === 960, `${width}x${height}`);
  check("metadata (EXIF/GPS) is stripped", !saved.includes("GPS 13.7563"), `${saved.length} bytes`);
  check("the stored file is smaller than the upload", saved.length < bigPng.length, `${saved.length} < ${bigPng.length}`);
} else {
  console.log("SKIP  re-encode checks (need GD on the server and a local API)");
}

/* ---------------------------------------------------------- field limits */
const longText = "ก".repeat(3000);
const capped = await createIssue({ locationDetail: longText, suggestion: longText, zone: "ข".repeat(200) });
const cappedIssue = capped.body?.issue;
check("locationDetail is capped at 2000 characters", cappedIssue?.locationDetail?.length === 2000, `length ${cappedIssue?.locationDetail?.length}`);
check("suggestion is capped at 2000 characters", cappedIssue?.suggestion?.length === 2000, `length ${cappedIssue?.suggestion?.length}`);
check("zone is capped at 191 characters", cappedIssue?.zone?.length === 191, `length ${cappedIssue?.zone?.length}`);

/* --------------------------------------------------------------- honeypot */
const before = (await listIssues()).length;
const bot = await createIssue({ website: "http://spam.example" });
check("honeypot blocks createIssue", bot.status === 400);
check("honeypot refusal does not explain itself", bot.body?.error === "ไม่สามารถดำเนินการได้");
check("honeypot writes nothing", (await listIssues()).length === before);

const botAssessment = await post({
  action: "submitAssessment",
  website: "http://spam.example",
  assessment: { studentId: "S1", studentName: "x", level: "A", groupId: "G1", knowledgeCorrect: 1, knowledgeTotal: 2, awarenessPoints: 1, awarenessMax: 2 },
});
check("honeypot blocks submitAssessment", botAssessment.status === 400 && botAssessment.body?.error === "ไม่สามารถดำเนินการได้");

const nestedBot = await post({
  action: "createIssue",
  issue: { groupId: "B01", zone: "อาคารเรียน 1", website: "spam" },
});
check("honeypot also looks inside issue", nestedBot.status === 400);

/* ------------------------------------------------------------ assessments */
let assessments = 0;
async function submitAssessment(extra = {}) {
  const res = await post({
    action: "submitAssessment",
    assessment: {
      studentId: "65001",
      studentName: "สมชาย ใจดี",
      level: "ปวช.1",
      groupId: "G01",
      knowledgeCorrect: 8,
      knowledgeTotal: 10,
      awarenessPoints: 9,
      awarenessMax: 12,
      ...extra,
    },
  });
  if (res.status === 200 && res.body?.ok) assessments++;
  return res;
}

const assessment = await submitAssessment();
check("submitAssessment returns scores", assessment.status === 200 && assessment.body?.assessment?.knowledgePercent === 80, String(assessment.body?.assessment?.knowledgePercent));

// Lengths stay under the per-field hard max (100/255/100) so the caps are what truncate.
const cappedAssessment = await submitAssessment({
  studentId: "S".repeat(80),
  studentName: "น".repeat(250),
  level: "L".repeat(90),
});
check(
  "over-long assessment field is still refused",
  (await submitAssessment({ studentName: "น".repeat(300) })).status === 400,
);
check("studentId is capped at 64 characters", cappedAssessment.body?.assessment?.studentId?.length === 64, `length ${cappedAssessment.body?.assessment?.studentId?.length}`);
check("studentName is capped at 191 characters", cappedAssessment.body?.assessment?.studentName?.length === 191, `length ${cappedAssessment.body?.assessment?.studentName?.length}`);
check("level is capped at 64 characters", cappedAssessment.body?.assessment?.level?.length === 64, `length ${cappedAssessment.body?.assessment?.level?.length}`);
check("listAssessments returns stored rows", (await listAssessments()).length >= 2);

/* ------------------------------------------------------------- staff flow */
const target = created.body.issue;
const wrongPin = await post({ action: "updateStatus", pin: "000000", rowIndex: target.rowIndex, status: "ปิดงานแล้ว", staffNote: "x" });
check("wrong PIN is refused", wrongPin.status === 403 && wrongPin.body?.error === "รหัส PIN ไม่ถูกต้อง");

const closed = await post({ action: "updateStatus", pin: PIN, rowIndex: target.rowIndex, status: "ปิดงานแล้ว", staffNote: "ซ่อมแล้ว" });
check("right PIN closes the job", closed.status === 200 && /^\d{2}\/\d{2}\/\d{4}$/.test(closed.body?.issue?.closedDate ?? ""));

const reopened = await post({ action: "updateStatus", pin: PIN, rowIndex: target.rowIndex, status: "รอแก้ไข" });
check("reopening clears closedDate", reopened.status === 200 && reopened.body?.issue?.closedDate === "");

/* ---------------------------------------------- replacing a photo on close */
const closedTwice = await createIssue({ locationDetail: "ตรวจภาพหลังซ่อมซ้ำ" });
const firstClose = await post({ action: "updateStatus", pin: PIN, rowIndex: closedTwice.body?.issue?.rowIndex, status: "ปิดงานแล้ว", staffNote: "รอบแรก", afterPhotoDataUrl: PHOTO });
const firstPath = firstClose.body?.issue?.afterPhoto ?? "";
const secondClose = await post({ action: "updateStatus", pin: PIN, rowIndex: closedTwice.body?.issue?.rowIndex, status: "ปิดงานแล้ว", staffNote: "รอบสอง", afterPhotoDataUrl: PHOTO });
const secondPath = secondClose.body?.issue?.afterPhoto ?? "";
check("re-closing stores a new after photo", firstPath !== "" && secondPath !== "" && firstPath !== secondPath, `${firstPath} -> ${secondPath}`);
if (LOCAL) {
  check("old after-photo file is deleted from disk", firstPath !== "" && !existsSync(`public/${firstPath}`), `public/${firstPath}`);
  check("new after-photo file exists on disk", secondPath !== "" && existsSync(`public/${secondPath}`), `public/${secondPath}`);
}

/* ------------------------------------------------------------- rate limit */
let limited = false;
let blocked = null;
for (let i = 0; i < 20; i++) {
  const res = await createIssue({ locationDetail: `rate ${i}` });
  if (res.status === 429) {
    limited = true;
    blocked = res;
    break;
  }
}
check("createIssue is rate limited", limited, `${creates} creates in this run`);
check("limit stops at 10 per minute", creates <= 10, `${creates} creates`);
check("429 explains the limit", blocked?.body?.error === "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", blocked?.body?.error);
check("429 sends Retry-After", blocked?.headers?.get("retry-after") === "60", blocked?.headers?.get("retry-after"));

// No TRUSTED_PROXIES here, so a spoofed header must not hand out a fresh bucket.
const spoofed = await createIssue({}, BASE, { "X-Forwarded-For": "203.0.113.9" });
check(
  "without TRUSTED_PROXIES the X-Forwarded-For header buys no extra bucket",
  spoofed.status === 429,
  `status ${spoofed.status}`,
);

const otherAction = await submitAssessment({ studentId: "65002" });
check("assessment bucket is independent of createIssue", otherAction.status === 200, `status ${otherAction.status}`);

let assessmentLimited = false;
for (let i = 0; i < 20; i++) {
  const res = await submitAssessment({ studentId: `6500${i}` });
  if (res.status === 429) {
    assessmentLimited = true;
    break;
  }
}
check("submitAssessment is rate limited", assessmentLimited, `${assessments} assessments in this run`);
check("assessment limit stops at 10 per minute", assessments <= 10, `${assessments} assessments`);

/* -------------------------------------------------------- trusted proxies */
if (PROXY) {
  let perIp = 0;
  for (let i = 1; i <= 12; i++) {
    const res = await createIssue({}, PROXY, { "X-Forwarded-For": `10.0.${i}.1` });
    if (res.status === 200) perIp++;
  }
  check("trusted proxy: rotating X-Forwarded-For gets a bucket per IP", perIp === 12, `${perIp}/12 allowed`);

  const chain = [];
  for (let i = 0; i < 11; i++) {
    chain.push(await createIssue({}, PROXY, { "X-Forwarded-For": "10.0.200.7" }));
  }
  const chainedOk = chain.filter((r) => r.status === 200).length;
  check(
    "trusted proxy: one forwarded IP still hits the 10/minute limit",
    chainedOk === 10 && chain.at(-1).status === 429,
    `${chainedOk} allowed, last ${chain.at(-1).status}`,
  );

  const photos = [];
  for (let i = 0; i < 3; i++) {
    photos.push(await createIssue({ beforePhotoDataUrl: PHOTO }, PROXY, { "X-Forwarded-For": "10.0.200.8" }));
  }
  const quotaBlock = photos.find((r) => r.status === 429 && /โควตาวันนี้/.test(r.body?.error ?? ""));
  check(
    "trusted proxy: the photo budget keys off the forwarded IP",
    photos[0].status === 200 && Boolean(quotaBlock),
    photos.map((r) => r.status).join(","),
  );

  const otherIp = await createIssue({ beforePhotoDataUrl: PHOTO }, PROXY, { "X-Forwarded-For": "10.0.200.9" });
  check(
    "trusted proxy: a different forwarded IP still has its own photo budget",
    otherIp.status === 200,
    `status ${otherIp.status}`,
  );
} else {
  console.log("SKIP  trusted-proxy checks (set PROXY_AWARE_API to enable)");
}

/* ------------------------------------------------------ photo edge cases */
if (EDGE) {
  const sendPhoto = (dataUrl) => createIssue({ beforePhotoDataUrl: dataUrl }, EDGE);
  const rejected = (res, message) => res.status === 400 && message.test(res.body?.error ?? "");
  const png = buildPng(4, 4, "tiny").toString("base64");

  // The data-URL length cap is checked before anything is decoded.
  const tooBig = await sendPhoto(`data:image/png;base64,${"A".repeat(3_200_000)}`);
  check("an oversized photo is refused with a size message", rejected(tooBig, /^รูปภาพมีขนาดใหญ่เกินไป$/), `${tooBig.status} ${tooBig.body?.error}`);

  const mislabelled = await sendPhoto(`data:image/jpeg;base64,${png}`);
  check("a PNG labelled as JPEG is refused", rejected(mislabelled, /ไม่ถูกต้อง/), `${mislabelled.status} ${mislabelled.body?.error}`);

  const brokenBase64 = await sendPhoto("data:image/png;base64,!!!not-base64!!!");
  check("broken base64 is refused", rejected(brokenBase64, /JPEG, PNG หรือ WebP/), `${brokenBase64.status} ${brokenBase64.body?.error}`);

  const notAnImage = await sendPhoto(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);
  check("base64 that is not an image is refused", rejected(notAnImage, /ไม่ถูกต้อง/), `${notAnImage.status} ${notAnImage.body?.error}`);

  const wrongMime = await sendPhoto(`data:text/plain;base64,${png}`);
  check("a non-image data URL is refused", rejected(wrongMime, /JPEG, PNG หรือ WebP/), `${wrongMime.status} ${wrongMime.body?.error}`);

  // Real JPEG/WebP fixtures come from the harness; without them this part is skipped.
  let uploaded = null;
  for (const [file, mime, ext] of [
    ["photo.jpg", "jpeg", ".jpg"],
    ["photo.webp", "webp", ".webp"],
  ]) {
    const fixture = `${FIXTURES}/${file}`;
    if (!FIXTURES || !existsSync(fixture)) {
      console.log(`SKIP  ${mime} round trip (set PHOTO_FIXTURES)`);
      continue;
    }
    const res = await sendPhoto(`data:image/${mime};base64,${readFileSync(fixture).toString("base64")}`);
    const saved = res.body?.issue?.beforePhoto ?? "";
    check(
      `a ${mime} upload is stored as ${ext} with a thumbnail`,
      res.status === 200 && saved.endsWith(ext) && Boolean(res.body?.issue?.beforePhotoThumb),
      `${res.status} ${saved}`,
    );
    if (res.status === 200) uploaded = res.body.issue;
  }

  // A thumbnail that disappears must not break the list: the API returns the photo.
  const withThumb = uploaded ?? (await sendPhoto(PHOTO)).body?.issue ?? null;
  const photoPath = withThumb?.beforePhoto ?? "";
  const thumbPath = withThumb?.beforePhotoThumb ?? "";
  if (LOCAL && photoPath !== "" && thumbPath !== photoPath) {
    rmSync(`public/${thumbPath}`, { force: true });
    const listed = (await post({ action: "listIssues" }, { base: EDGE })).body?.issues ?? [];
    check("a deleted thumbnail falls back to the full photo", listed.find((issue) => issue.beforePhoto === photoPath)?.beforePhotoThumb === photoPath, thumbPath);
  } else {
    console.log("SKIP  missing-thumbnail check (needs GD and a local run)");
  }
} else {
  console.log("SKIP  photo edge cases (set EDGE_API to enable)");
}

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
