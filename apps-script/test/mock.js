// Simulación mínima de Apps Script para probar Code.gs en local (no se sube a Google).
const vm = require('vm');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function makeEnv() {
  const sheets = {};
  const drive = { files: {}, trashed: new Set(), folder: null };
  function makeSheet(name) {
    const sh = {
      name, data: [], maxRows: 1000,
      getMaxRows: () => 1000, getMaxColumns: () => 26,
      getRange(r, c, nr = 1, nc = 1) {
        return {
          setNumberFormat() { return this; },
          setFontWeight() { return this; }, setBackground() { return this; },
          setValues(v) { v.forEach((row, i) => { sh.data[r - 1 + i] = sh.data[r - 1 + i] || []; row.forEach((x, j) => { sh.data[r - 1 + i][c - 1 + j] = x; }); }); return this; },
          setValue(x) { sh.data[r - 1] = sh.data[r - 1] || []; sh.data[r - 1][c - 1] = x; return this; },
        };
      },
      getDataRange() { return { getValues: () => sh.data.map(r => r.slice()) }; },
      setFrozenRows() {},
      appendRow(arr) { sh.data.push(arr.slice()); },
      deleteRow(n) { sh.data.splice(n - 1, 1); },
    };
    return sh;
  }
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: s => delete sheets[s.name],
    getSpreadsheetTimeZone: () => 'Europe/Madrid',
  };
  const cacheMap = new Map();
  const ctx = {
    console, Date, JSON, Math, String, Number, parseInt, Object, Array, Error, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64Decode: s => { const b = Buffer.from(s, 'base64'); return Array.from(b).map(x => (x > 127 ? x - 256 : x)); },
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      formatDate: (d) => d.toISOString().slice(0, 10),
    },
    CacheService: { getScriptCache: () => ({ get: k => cacheMap.get(k) || null, put: (k, v) => cacheMap.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
      createFolder: n => { const f = { id: 'folder1', createFile: blob => { const id = 'file' + Object.keys(drive.files).length; drive.files[id] = blob; return { getId: () => id, setSharing() {} }; }, setSharing() {}, getId: () => 'folder1' }; drive.folder = f; return f; },
      getFolderById: () => drive.folder,
      getFileById: id => { if (!drive.files[id]) throw new Error('no existe'); return { setTrashed: () => drive.trashed.add(id) }; },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return s; } }) },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  const call = (req) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }).getContent());
  return { ctx, sheets, drive, call, ss };
}
module.exports = { makeEnv };
