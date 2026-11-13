/**
 * Green Walk Audit — Google Apps Script backend
 *
 * Persists field-audit issues to a Google Sheet, stores photos in Google Drive
 * and requires the staff PIN for status updates.
 *
 * Deploy: Extensions > Apps Script in the target spreadsheet, paste this file,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access:
 * Anyone) and put the /exec URL into VITE_API_URL in the React app.
 * Script Properties: STAFF_PIN (required), SPREADSHEET_ID (optional if bound).
 */

var SHEET_NAME = 'Issues'
var PHOTO_FOLDER_NAME = 'Green Walk Audit Photos'
var COLUMNS = [
  'id', 'createdDate', 'dueDate', 'groupId', 'zone', 'category', 'riskLevel',
  'locationDetail', 'suggestion', 'beforePhotoUrl', 'status', 'closedDate',
  'afterPhotoUrl', 'staffNote'
]

var ASSESSMENTS_SHEET = 'Assessments'
var ASSESSMENT_COLUMNS = [
  'id', 'timestamp', 'studentId', 'studentName', 'level', 'groupId',
  'knowledgeCorrect', 'knowledgeTotal', 'knowledgePercent',
  'awarenessPoints', 'awarenessMax', 'awarenessPercent'
]
var STATUS_PENDING = 'รอแก้ไข'
var STATUS_CLOSED = 'ปิดงานแล้ว'
var DUE_DAYS = 30

function doGet() {
  return json_({ ok: true, service: 'green-walk-audit', version: 1 })
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {}

    switch (body.action) {
      case 'listIssues':
        return json_({ ok: true, issues: listIssues_() })
      case 'createIssue':
        return json_({ ok: true, issue: createIssue_(body.issue || {}) })
      case 'updateStatus':
        return json_({ ok: true, issue: updateStatus_(body) })
      case 'verifyPin':
        return verifyPin_(body.pin)
          ? json_({ ok: true })
          : json_({ ok: false, error: 'รหัส PIN ไม่ถูกต้อง' })
      case 'listAssessments':
        return json_({ ok: true, assessments: listAssessments_() })
      case 'submitAssessment':
        return json_({ ok: true, assessment: submitAssessment_(body.assessment || {}) })
      default:
        return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง: ' + body.action })
    }
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) })
  }
}

/* ---------------------------------------------------------------- issues */

function listIssues_() {
  var sheet = getSheet_()
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []

  var rows = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues()
  var issues = []
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (!row[0] && !row[9] && !row[3]) continue
    issues.push(rowToIssue_(row, i + 2))
  }
  return issues
}

function createIssue_(input) {
  var groupId = String(input.groupId || '').trim()
  var zone = String(input.zone || '').trim()
  if (!groupId || !zone) throw new Error('กรุณากำหนดกลุ่มและโซน')

  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var sheet = getSheet_()
    var now = new Date()
    var id = nextIssueId_(sheet)
    var beforePhotoUrl = savePhoto_(input.beforePhotoDataUrl, input.beforePhotoName || (id + '-before'))

    var issue = {
      id: id,
      createdDate: formatDate_(now),
      dueDate: formatDate_(addDays_(now, DUE_DAYS)),
      groupId: groupId,
      zone: zone,
      category: String(input.category || ''),
      riskLevel: String(input.riskLevel || ''),
      locationDetail: String(input.locationDetail || ''),
      suggestion: String(input.suggestion || ''),
      beforePhotoUrl: beforePhotoUrl,
      status: STATUS_PENDING,
      closedDate: '',
      afterPhotoUrl: '',
      staffNote: ''
    }

    sheet.appendRow(issueToRow_(issue))
    issue.rowIndex = sheet.getLastRow()
    return issue
  } finally {
    lock.releaseLock()
  }
}

function updateStatus_(body) {
  assertPin_(body.pin)

  var rowIndex = Number(body.rowIndex)
  if (!rowIndex || rowIndex < 2) throw new Error('ไม่พบแถวข้อมูลที่ต้องการอัปเดต (rowIndex)')

  var status = body.status === STATUS_CLOSED ? STATUS_CLOSED : STATUS_PENDING
  var sheet = getSheet_()
  if (rowIndex > sheet.getLastRow()) throw new Error('ไม่พบแถวข้อมูลที่ต้องการอัปเดต (rowIndex)')

  var closing = status === STATUS_CLOSED
  var afterPhotoUrl = closing ? savePhoto_(body.afterPhotoDataUrl, body.afterPhotoName) : ''

  var range = sheet.getRange(rowIndex, 1, 1, COLUMNS.length)
  var row = range.getValues()[0]

  row[col_('status')] = status
  row[col_('closedDate')] = closing ? formatDate_(new Date()) : ''
  if (typeof body.staffNote === 'string') row[col_('staffNote')] = body.staffNote
  if (afterPhotoUrl) row[col_('afterPhotoUrl')] = afterPhotoUrl

  range.setValues([row])
  return rowToIssue_(row, rowIndex)
}

/* ------------------------------------------------------------------- pin */

function assertPin_(pin) {
  if (!verifyPin_(pin)) throw new Error('รหัส PIN ไม่ถูกต้อง')
}

function verifyPin_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty('STAFF_PIN')
  if (!expected) throw new Error('ยังไม่ได้ตั้งค่า STAFF_PIN ใน Script Properties')
  var supplied = String(pin == null ? '' : pin)
  if (supplied.length !== expected.length) return false
  var diff = 0
  for (var i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i)
  }
  return diff === 0
}

/* ----------------------------------------------------------------- sheet */

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (id) return SpreadsheetApp.openById(id)

  var ss = SpreadsheetApp.getActiveSpreadsheet()
  if (!ss) throw new Error('ไม่พบสเปรดชีต: ผูกสคริปต์กับชีตหรือตั้งค่า SPREADSHEET_ID ใน Script Properties')
  return ss
}

function getSheet_() {
  var ss = getSpreadsheet_()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME)

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS)
    sheet.setFrozenRows(1)
  }
  return sheet
}

function nextIssueId_(sheet) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return 'GW-001'

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
  var max = 0
  for (var i = 0; i < ids.length; i++) {
    var m = /^GW-(\d+)$/.exec(String(ids[i][0] || '').trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  var next = max + 1
  var padded = ('00' + next).slice(-3)
  return 'GW-' + padded
}

function rowToIssue_(row, rowIndex) {
  return {
    rowIndex: rowIndex,
    id: String(row[col_('id')] || ''),
    createdDate: asText_(row[col_('createdDate')]),
    dueDate: asText_(row[col_('dueDate')]),
    groupId: String(row[col_('groupId')] || ''),
    zone: String(row[col_('zone')] || ''),
    category: String(row[col_('category')] || ''),
    riskLevel: String(row[col_('riskLevel')] || ''),
    locationDetail: String(row[col_('locationDetail')] || ''),
    suggestion: String(row[col_('suggestion')] || ''),
    beforePhotoUrl: String(row[col_('beforePhotoUrl')] || ''),
    status: String(row[col_('status')] || STATUS_PENDING),
    closedDate: asText_(row[col_('closedDate')]),
    afterPhotoUrl: String(row[col_('afterPhotoUrl')] || ''),
    staffNote: String(row[col_('staffNote')] || '')
  }
}

function issueToRow_(issue) {
  var row = []
  for (var i = 0; i < COLUMNS.length; i++) row.push(issue[COLUMNS[i]] == null ? '' : issue[COLUMNS[i]])
  return row
}

function col_(name) {
  var index = COLUMNS.indexOf(name)
  if (index < 0) throw new Error('ไม่รู้จักคอลัมน์: ' + name)
  return index
}

/* ----------------------------------------------------------------- drive */

function getPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME)
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME)
}

function savePhoto_(dataUrl, name) {
  if (!dataUrl) return ''

  var match = /^data:([^;]+);base64,([\s\S]+)$/.exec(String(dataUrl))
  if (!match) return ''

  var mimeType = match[1]
  var bytes = Utilities.base64Decode(match[2])
  var filename = String(name || 'photo') + extensionFor_(mimeType)

  var blob = Utilities.newBlob(bytes, mimeType, filename)
  var file = getPhotoFolder_().createFile(blob)

  // Photos must be readable by the browser that displays them.
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
  } catch (err) {
    // Domain policy may block link sharing; the URL still works for staff.
  }

  return 'https://drive.google.com/uc?export=view&id=' + file.getId()
}

function extensionFor_(mimeType) {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  return '.jpg'
}

/* ----------------------------------------------------------- assessments */

function listAssessments_() {
  var sheet = getAssessmentsSheet_()
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []

  var rows = sheet.getRange(2, 1, lastRow - 1, ASSESSMENT_COLUMNS.length).getValues()
  var assessments = []
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue
    assessments.push(assessmentRowToObject_(rows[i]))
  }
  return assessments
}

function submitAssessment_(input) {
  var studentId = String(input.studentId || '').trim()
  var studentName = String(input.studentName || '').trim()
  var groupId = String(input.groupId || '').trim()
  if (!studentId || !studentName || !groupId) throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน')

  var knowledgeTotal = Math.max(1, toPositiveNumber_(input.knowledgeTotal, 10))
  var knowledgeCorrect = clamp_(toPositiveNumber_(input.knowledgeCorrect, 0), 0, knowledgeTotal)
  var awarenessMax = Math.max(1, toPositiveNumber_(input.awarenessMax, 12))
  var awarenessPoints = round1_(clamp_(toPositiveNumber_(input.awarenessPoints, 0), 0, awarenessMax))

  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var sheet = getAssessmentsSheet_()
    var assessment = {
      id: nextAssessmentId_(sheet),
      timestamp: formatDateTime_(new Date()),
      studentId: studentId,
      studentName: studentName,
      level: String(input.level || ''),
      groupId: groupId,
      knowledgeCorrect: knowledgeCorrect,
      knowledgeTotal: knowledgeTotal,
      knowledgePercent: percent_(knowledgeCorrect, knowledgeTotal),
      awarenessPoints: awarenessPoints,
      awarenessMax: awarenessMax,
      awarenessPercent: percent_(awarenessPoints, awarenessMax)
    }

    var row = []
    for (var i = 0; i < ASSESSMENT_COLUMNS.length; i++) {
      row.push(assessment[ASSESSMENT_COLUMNS[i]] == null ? '' : assessment[ASSESSMENT_COLUMNS[i]])
    }
    sheet.appendRow(row)
    return assessment
  } finally {
    lock.releaseLock()
  }
}

function getAssessmentsSheet_() {
  var ss = getSpreadsheet_()
  var sheet = ss.getSheetByName(ASSESSMENTS_SHEET)
  if (!sheet) sheet = ss.insertSheet(ASSESSMENTS_SHEET)

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ASSESSMENT_COLUMNS)
    sheet.setFrozenRows(1)
  }
  return sheet
}

function nextAssessmentId_(sheet) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return 'A-001'

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
  var max = 0
  for (var i = 0; i < ids.length; i++) {
    var m = /^A-(\d+)$/.exec(String(ids[i][0] || '').trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return 'A-' + ('00' + (max + 1)).slice(-3)
}

function assessmentRowToObject_(row) {
  var result = {}
  for (var i = 0; i < ASSESSMENT_COLUMNS.length; i++) {
    var key = ASSESSMENT_COLUMNS[i]
    var value = row[i]
    if (key === 'timestamp') value = asText_(value)
    else if (key === 'id' || key === 'studentId' || key === 'studentName' || key === 'level' || key === 'groupId') value = String(value == null ? '' : value)
    else value = Number(value) || 0
    result[key] = value
  }
  return result
}

/* ----------------------------------------------------------------- utils */

function addDays_(date, days) {
  var copy = new Date(date.getTime())
  copy.setDate(copy.getDate() + days)
  return copy
}

function formatDate_(date) {
  var tz = PropertiesService.getScriptProperties().getProperty('TIMEZONE') ||
    Session.getScriptTimeZone() || 'Asia/Bangkok'
  return Utilities.formatDate(date, tz, 'dd/MM/yyyy')
}

function asText_(value) {
  if (value instanceof Date) return formatDate_(value)
  return String(value == null ? '' : value)
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, timeZone_(), 'dd/MM/yyyy HH:mm:ss')
}

function timeZone_() {
  return PropertiesService.getScriptProperties().getProperty('TIMEZONE') ||
    Session.getScriptTimeZone() || 'Asia/Bangkok'
}

function percent_(score, max) {
  if (!max) return 0
  return Math.round((score / max) * 100)
}

function clamp_(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round1_(value) {
  return Math.round(value * 10) / 10
}

function toPositiveNumber_(value, fallback) {
  var number = Number(value)
  if (!isFinite(number) || number < 0) return fallback
  return number
}

function errorMessage_(err) {
  if (!err) return 'เกิดข้อผิดพลาดที่ไม่รู้จัก'
  return String(err.message || err)
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
}
