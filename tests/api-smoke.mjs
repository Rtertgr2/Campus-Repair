#!/usr/bin/env node
/**
 * Smoke tests for the Campus Repair API (Phase 0 hardening).
 *
 * Needs a running API with a migrated database, for example:
 *   DB_NAME=campus_repair STAFF_PIN=123456 php -S 127.0.0.1:8099 -t public
 *   API_BASE=http://127.0.0.1:8099/api/index.php STAFF_PIN=123456 node tests/api-smoke.mjs
 *
 * Optional, for the migration checks: LEGACY_API (a database that was never
 * migrated) and PARTIAL_API (one where only the path columns were added).
 *
 * The rate-limit checks assume fresh counters: delete
 * public/api/storage/ratelimit/*.json before running.
 */

import { existsSync } from "node:fs";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:8099/api/index.php";
const PIN = process.env.STAFF_PIN ?? "123456";
const LEGACY = process.env.LEGACY_API;
const PARTIAL = process.env.PARTIAL_API;
/** Disk checks only make sense when the API runs on this machine. */
const LOCAL = ["127.0.0.1", "localhost"].includes(new URL(BASE).hostname);

/** 1x1 PNG, just enough for the photo validator. */
const PHOTO =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

async function post(payload, { origin, method = "POST", body, base = BASE } = {}) {
  const res = await fetch(base, {
    method,
    // The API only accepts requests from its own origin, so default to the target's.
    headers: { "Content-Type": "application/json", Origin: origin ?? new URL(base).origin },
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
async function createIssue(extra = {}, base = BASE) {
  const res = await post(
    {
      action: "createIssue",
      issue: { groupId: "B01", zone: "อาคารเรียน 1", category: "ไฟฟ้า", riskLevel: "ปกติ", ...extra },
    },
    { base },
  );
  if (res.status === 200 && res.body?.ok) creates++;
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

/* -------------------------------------------------------------- creating */
const created = await createIssue({ locationDetail: "หลอดไฟดับ", beforePhotoDataUrl: PHOTO });
check("createIssue returns the stored row", created.status === 200 && Boolean(created.body?.issue?.id), created.body?.issue?.id);
check("photo is stored as a path", /^uploads\/\d{4}\/\d{2}\/[0-9a-f]{32}\.png$/.test(created.body?.issue?.beforePhoto ?? ""), created.body?.issue?.beforePhoto);
check("photo thumbnail is returned", /-thumb\.jpg$/.test(created.body?.issue?.beforePhotoThumb ?? ""));
check("create response carries no base64", !created.text.includes("data:image"));

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

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
