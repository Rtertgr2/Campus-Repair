#!/usr/bin/env node
/**
 * Smoke tests for the Campus Repair API.
 *
 * Needs a running API with a migrated database:
 *   DB_NAME=campus_repair STAFF_PIN=1234 php -S 127.0.0.1:8099 -t public
 *   rm -f public/api/storage/ratelimit/*.json
 *   API_BASE=http://127.0.0.1:8099/api/index.php STAFF_PIN=1234 node tests/api-smoke.mjs
 *
 * Optional:
 *   UPLOADS_DIR lets the test verify files on disk when the API runs locally.
 */

import { existsSync, rmSync } from "node:fs";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:8099/api/index.php";
const STAFF_NAME = process.env.STAFF_NAME ?? "เจ้าหน้าที่";
const PIN = process.env.STAFF_PIN ?? "1234";
const LOCAL = ["127.0.0.1", "localhost"].includes(new URL(BASE).hostname);
const UPLOADS = process.env.UPLOADS_DIR ?? "public/uploads";

const PHOTO =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

async function post(payload, { origin, method = "POST", body, base = BASE, headers = {} } = {}) {
  const res = await fetch(base, {
    method,
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

const listIssues = async (params = {}, token = "") =>
  (await post({ action: "listIssues", ...params, token })).body ?? {};
const listZones = async () => (await post({ action: "listZones" })).body?.zones ?? [];

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

const initial = await listIssues({ page: 1, pageSize: 5 });
check("listIssues answers with pagination", initial.ok === true && Array.isArray(initial.issues) && typeof initial.total === "number");

const stats = (await post({ action: "getStats" })).body?.stats;
check("getStats returns counters", stats && typeof stats.total === "number" && typeof stats.closed === "number");

const zones = await listZones();
check("default zones exist", zones.length >= 5 && zones.some((zone) => zone.groupId === "B01"));

/* --------------------------------------------------------------- login */
const wrongLogin = await post({ action: "loginStaff", staffName: STAFF_NAME, pin: "0000" });
check("wrong staff PIN is refused", wrongLogin.status === 403 && /PIN|ชื่อ/.test(wrongLogin.body?.error ?? ""));

const login = await post({ action: "loginStaff", staffName: STAFF_NAME, pin: PIN });
const token = login.body?.token ?? "";
check("staff login returns a session token", login.status === 200 && token.length > 20);

const staffList = await post({ action: "listStaff", token });
check("staff list is available to a signed-in user", staffList.status === 200 && Array.isArray(staffList.body?.staff));
const admin = staffList.body?.staff?.find((member) => member.role === "admin");
check("admin account has the admin role", Boolean(admin));

const suffix = Math.random().toString(36).slice(2, 8);
const techName = `ช่างทดสอบ-${suffix}`;
const viewerName = `ผู้ชม-${suffix}`;
const createdTech = await post({ action: "createStaff", token, name: techName, pin: "4321", role: "technician" });
check("admin can create a technician account", createdTech.status === 200 && createdTech.body?.staff?.role === "technician", createdTech.body?.error);
const createdViewer = await post({ action: "createStaff", token, name: viewerName, pin: "4322", role: "viewer" });
check("admin can create a viewer account", createdViewer.status === 200 && createdViewer.body?.staff?.role === "viewer", createdViewer.body?.error);

const selfDeactivate = await post({ action: "updateStaff", token, id: admin?.id, active: false });
check("admin cannot deactivate their own account", selfDeactivate.status === 400);
const selfDemote = await post({ action: "updateStaff", token, id: admin?.id, role: "technician" });
check("the last admin cannot demote themselves", selfDemote.status === 400);

const noToken = await post({ action: "listStaff" });
check("staff-only action without a token is refused", noToken.status === 401);

const notifications = await post({ action: "getNotifications", token });
check("notifications endpoint answers", notifications.status === 200 && Array.isArray(notifications.body?.items));

/* ------------------------------------------------------------- creating */
const created = await post({
  action: "createIssue",
  issue: {
    groupId: "B01",
    zone: "อาคารเรียน 1",
    category: "ไฟฟ้า / หลอดไฟ",
    riskLevel: "ปกติ",
    locationDetail: "หลอดไฟดับหน้าห้อง 101",
    suggestion: "ตรวจสอบสายไฟ",
    reporterName: "สมชาย ทดสอบ",
    reporterPhone: "0812345678",
    reporterEmail: "somchai@example.com",
    beforePhotoDataUrl: PHOTO,
  },
});
const issue = created.body?.issue;
check("createIssue returns the stored row", created.status === 200 && Boolean(issue?.id));
check("photo is stored as a path", /^uploads\/\d{4}\/\d{2}\/[0-9a-f]{32}\.png$/.test(issue?.beforePhoto ?? ""), issue?.beforePhoto);
check("photo thumbnail is returned", /-thumb\.jpg$/.test(issue?.beforePhotoThumb ?? ""));
check("create response carries no base64", !created.text.includes("data:image"));
check("new jobs start in the pending status", issue?.status === "รอแก้ไข");

const publicList = await listIssues({ search: issue.id });
check("public list hides reporter contact", publicList.issues?.[0]?.reporterPhone === "");
const staffListIssues = await listIssues({ search: issue.id }, token);
check("staff list includes reporter contact", staffListIssues.issues?.[0]?.reporterPhone === "0812345678");

const techLogin = await post({ action: "loginStaff", staffName: techName, pin: "4321" });
const techToken = techLogin.body?.token ?? "";
check("technician can sign in", techLogin.status === 200 && Boolean(techToken));
const viewerLogin = await post({ action: "loginStaff", staffName: viewerName, pin: "4322" });
const viewerToken = viewerLogin.body?.token ?? "";
check("viewer can sign in", viewerLogin.status === 200 && Boolean(viewerToken));

/* --------------------------------------------------------- status flow */
const techUpdate = await post({ action: "updateStatus", token: techToken, rowIndex: issue.rowIndex, status: "รับเรื่องแล้ว" });
check("technician can update a job status", techUpdate.status === 200 && techUpdate.body?.issue?.status === "รับเรื่องแล้ว");
const techDelete = await post({ action: "deleteIssue", token: techToken, rowIndex: issue.rowIndex });
check("technician cannot delete a job", techDelete.status === 403);
const techZone = await post({ action: "saveZone", token: techToken, groupId: `X${suffix}`, name: "ห้ามบันทึก" });
check("technician cannot manage zones", techZone.status === 403);
const techCreateStaff = await post({ action: "createStaff", token: techToken, name: `ห้าม-${suffix}`, pin: "5555", role: "viewer" });
check("technician cannot create staff accounts", techCreateStaff.status === 403);
const viewerUpdate = await post({ action: "updateStatus", token: viewerToken, rowIndex: issue.rowIndex, status: "กำลังซ่อม" });
check("viewer cannot update a job", viewerUpdate.status === 403);
const viewerHistory = await post({ action: "listEvents", token: viewerToken, rowIndex: issue.rowIndex });
check("viewer can read job history", viewerHistory.status === 200);

const accepted = await post({ action: "updateStatus", token, rowIndex: issue.rowIndex, status: "รับเรื่องแล้ว", assignedStaffId: admin?.id });
check("status can move to accepted", accepted.status === 200 && accepted.body?.issue?.status === "รับเรื่องแล้ว");
check("assigned staff name is returned", Boolean(accepted.body?.issue?.assignedStaffName));

const inProgress = await post({ action: "updateStatus", token, rowIndex: issue.rowIndex, status: "กำลังซ่อม", staffNote: "กำลังดำเนินการ" });
check("status can move to in progress", inProgress.status === 200 && inProgress.body?.issue?.status === "กำลังซ่อม");

const closed = await post({ action: "updateStatus", token, rowIndex: issue.rowIndex, status: "ปิดงานแล้ว", staffNote: "ซ่อมเสร็จแล้ว" });
check("closing sets a closed date", closed.status === 200 && /^\d{2}\/\d{2}\/\d{4}$/.test(closed.body?.issue?.closedDate ?? ""));

const reopened = await post({ action: "updateStatus", token, rowIndex: issue.rowIndex, status: "รอแก้ไข" });
check("reopening clears the closed date", reopened.status === 200 && reopened.body?.issue?.closedDate === "");

const events = await post({ action: "listEvents", token, rowIndex: issue.rowIndex });
check("job history includes status changes", (events.body?.events ?? []).length >= 3);

/* --------------------------------------------------------- edit/delete */
const edited = await post({
  action: "updateIssue",
  token,
  issue: {
    rowIndex: issue.rowIndex,
    groupId: "B02",
    zone: "อาคารเรียน 2",
    category: "ประปา / สุขภัณฑ์",
    riskLevel: "เร่งด่วน",
    locationDetail: "ก๊อกน้ำรั่ว",
    suggestion: "เปลี่ยนก๊อก",
    reporterName: "สมหญิง ทดสอบ",
    reporterPhone: "0899999999",
    reporterEmail: "somying@example.com",
  },
});
check("staff can edit a job and its reporter", edited.status === 200 && edited.body?.issue?.zone === "อาคารเรียน 2" && edited.body?.issue?.reporterName === "สมหญิง ทดสอบ");

const zoneCode = `T${Math.random().toString(36).slice(2, 8)}`;
const savedZone = await post({ action: "saveZone", token, groupId: zoneCode, name: "อาคารทดสอบ", detail: "ชั่วคราว", active: true, sortOrder: 99 });
check("admin can add a zone", savedZone.status === 200 && savedZone.body?.zone?.groupId === zoneCode);
const removedZone = await post({ action: "deleteZone", token, id: savedZone.body?.zone?.id });
check("admin can deactivate a zone", removedZone.status === 200);
check("deactivated zone stays in the management list", (await listZones()).some((zone) => zone.groupId === zoneCode));

const resetPin = await post({ action: "resetStaffPin", token, id: createdTech.body?.staff?.id, pin: "9999" });
check("admin can reset a staff PIN", resetPin.status === 200);
const oldTechSession = await post({ action: "listStaff", token: techToken });
check("reset PIN invalidates the old staff session", oldTechSession.status === 401);
const techRelogin = await post({ action: "loginStaff", staffName: techName, pin: "9999" });
const techToken2 = techRelogin.body?.token ?? "";
check("technician can sign in with the new PIN", techRelogin.status === 200 && Boolean(techToken2));

const deactivateTech = await post({ action: "updateStaff", token, id: createdTech.body?.staff?.id, active: false });
check("admin can deactivate a staff account", deactivateTech.status === 200 && deactivateTech.body?.staff?.active === false);
const deactivatedLogin = await post({ action: "loginStaff", staffName: techName, pin: "9999" });
check("deactivated staff cannot sign in", deactivatedLogin.status === 403);
const deactivatedSession = await post({ action: "listStaff", token: techToken2 });
check("deactivation invalidates existing sessions", deactivatedSession.status === 401);

const deleted = await post({ action: "deleteIssue", token, rowIndex: issue.rowIndex });
check("admin can delete a job", deleted.status === 200);
check("deleted job disappears from the list", (await listIssues({ search: issue.id }, token)).issues?.length === 0);

/* --------------------------------------------------------------- honeypot */
const before = (await listIssues()).total;
const bot = await post({ action: "createIssue", website: "http://spam.example", issue: { groupId: "B01", zone: "อาคารเรียน 1" } });
check("honeypot blocks createIssue", bot.status === 400);
check("honeypot refusal does not explain itself", bot.body?.error === "ไม่สามารถดำเนินการได้");
check("honeypot writes nothing", (await listIssues()).total === before);

/* ------------------------------------------------------------- rate limit */
let limited = false;
let blocked = null;
for (let i = 0; i < 20; i++) {
  const res = await post({
    action: "createIssue",
    issue: { groupId: "B01", zone: "อาคารเรียน 1", reporterName: `rate ${i}` },
  });
  if (res.status === 429) {
    limited = true;
    blocked = res;
    break;
  }
}
check("createIssue is rate limited", limited);
check("429 explains the limit", blocked?.body?.error === "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", blocked?.body?.error);
check("429 sends Retry-After", blocked?.headers.get("retry-after") === "60");

const spoofed = await post({
  action: "createIssue",
  issue: { groupId: "B01", zone: "อาคารเรียน 1", reporterName: "spoof" },
}, { headers: { "X-Forwarded-For": "203.0.113.9" } });
check("without TRUSTED_PROXIES a spoofed forwarded IP gains nothing", spoofed.status === 429, `status ${spoofed.status}`);

/* ---------------------------------------------------------------- logout */
const bye = await post({ action: "logoutStaff", token });
check("logout succeeds", bye.status === 200);
const afterLogout = await post({ action: "listStaff", token });
check("old token is refused after logout", afterLogout.status === 401);

/* ------------------------------------------------------------ file cleanup */
if (LOCAL && issue?.beforePhoto) {
  const thumb = issue.beforePhotoThumb;
  if (existsSync(`${UPLOADS}/${thumb.replace(/^uploads\//, "")}`)) {
    rmSync(`${UPLOADS}/${thumb.replace(/^uploads\//, "")}`, { force: true });
  }
  const photo = `${UPLOADS}/${issue.beforePhoto.replace(/^uploads\//, "")}`;
  check("deleted job removed its photo file", !existsSync(photo), photo);
}

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
