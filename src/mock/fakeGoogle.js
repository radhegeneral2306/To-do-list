// A tiny stand-in for the Google Apps Script services that backend/Code.gs uses.
// It lets the REAL backend code run inside the browser (demo mode) and in Node (tests),
// with an in-memory "spreadsheet" instead of Google Sheets.

import { sha256Bytes } from './sha256.js'

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols })
  }
  getValues() {
    const out = []
    for (let r = 0; r < this.numRows; r++) {
      const src = this.sheet.rows[this.row - 1 + r] || []
      const line = []
      for (let c = 0; c < this.numCols; c++) line.push(src[this.col - 1 + c] ?? '')
      out.push(line)
    }
    return out
  }
  setValues(values) {
    values.forEach((line, r) => {
      const idx = this.row - 1 + r
      while (this.sheet.rows.length <= idx) this.sheet.rows.push([])
      line.forEach((v, c) => { this.sheet.rows[idx][this.col - 1 + c] = storeValue(v) })
    })
    this.sheet.onChange()
    return this
  }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      const line = this.sheet.rows[this.row - 1 + r]
      if (line) for (let c = 0; c < this.numCols; c++) line[this.col - 1 + c] = ''
    }
    this.sheet.onChange()
    return this
  }
  setFontWeight() { return this }
  setNumberFormat() { return this }
}

// Google Sheets strips a leading apostrophe (it just means "plain text").
const storeValue = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v)

class FakeSheet {
  constructor(name, rows, onChange) {
    this.name = name
    this.rows = rows
    this.onChange = onChange
  }
  getLastRow() { return this.rows.length }
  getMaxRows() { return Math.max(1000, this.rows.length) }
  getRange(row, col, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols) }
  appendRow(values) {
    this.rows.push(values.map(storeValue))
    this.onChange()
  }
  deleteRow(row) {
    this.rows.splice(row - 1, 1)
    this.onChange()
  }
  setFrozenRows() {}
}

/**
 * @param {object} data   { sheetName: [[cell, ...], ...] } — mutated in place
 * @param {function} onChange  called after every write (e.g. to persist)
 */
export function createFakeGoogle(data = {}, onChange = () => {}) {
  const sheets = {}
  const getSheet = (name) => {
    if (!data[name]) return null
    if (!sheets[name]) sheets[name] = new FakeSheet(name, data[name], onChange)
    return sheets[name]
  }
  const spreadsheet = {
    getSheetByName: getSheet,
    insertSheet(name) {
      data[name] = []
      onChange()
      return getSheet(name)
    },
  }

  const uuid = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })

  // In-memory stand-in for Apps Script's CacheService (values are strings, with expiry).
  const store = new Map()
  const scriptCache = {
    get: (k) => {
      const e = store.get(k)
      if (!e || e.exp < Date.now()) return null
      return e.v
    },
    put: (k, v, seconds = 600) => { store.set(k, { v: String(v), exp: Date.now() + seconds * 1000 }) },
    remove: (k) => { store.delete(k) },
  }

  // In-memory stand-in for PropertiesService (kept inside `data` so demo mode persists it).
  const props = (data.__props ||= {})
  const scriptProps = {
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); onChange() },
  }

  return {
    CacheService: { getScriptCache: () => scriptCache },
    PropertiesService: { getScriptProperties: () => scriptProps },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ({ alert: () => {} }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, text) => sha256Bytes(text),
      getUuid: uuid,
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true }, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput(text) {
        return { getContent: () => text, setMimeType() { return this } }
      },
    },
    Logger: { log: () => {} },
  }
}

const GLOBALS = ['SpreadsheetApp', 'Utilities', 'LockService', 'ContentService', 'Logger', 'CacheService', 'PropertiesService']

/** Runs the Apps Script source against the fake services and returns its entry points. */
export function loadBackend(source, fakeGoogle) {
  const factory = new Function(...GLOBALS, `${source}\nreturn { doPost, setup };`)
  const backend = factory(...GLOBALS.map((g) => fakeGoogle[g]))
  return {
    setup: backend.setup,
    call(action, payload, token) {
      const out = backend.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } })
      return JSON.parse(out.getContent())
    },
  }
}
