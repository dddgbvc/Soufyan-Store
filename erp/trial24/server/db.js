/**
 * Trial24 — طبقة التخزين
 * ملف JSON واحد مع كتابة ذرّية (temp file + rename) لتفادي تلف البيانات.
 * كل الحقيقة (الوقت، الحالات، السجلات) تعيش هنا على الخادم — لا في المتصفح.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_FILE = path.join(DATA_DIR, 'trial24.json');

export const EMPTY_DB = {
  meta: { version: 1, createdAt: null, updatedAt: null },
  counters: {},
  settings: {},
  users: [],
  customers: [],
  devices: [],
  trials: [],
  sales: [],
  extensionRequests: [],
  notifications: [],
  audit: [],
};

class Database {
  constructor(file = DB_FILE) {
    this.file = file;
    this.data = null;
    this._writeQueued = false;
  }

  load() {
    if (!fs.existsSync(this.file)) {
      this.data = structuredClone(EMPTY_DB);
      this.data.meta.createdAt = Date.now();
      this.persist();
      return this.data;
    }
    const raw = fs.readFileSync(this.file, 'utf8');
    try {
      this.data = JSON.parse(raw);
    } catch (err) {
      // نسخة احتياطية للملف التالف بدل حذفه
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.copyFileSync(this.file, backup);
      throw new Error(
        `ملف البيانات تالف. تم حفظ نسخة في ${backup}. أعد التهيئة عبر: node server/seed.js --force`
      );
    }
    // ضمان وجود كل المجموعات حتى بعد الترقيات
    for (const [key, value] of Object.entries(EMPTY_DB)) {
      if (this.data[key] === undefined) this.data[key] = structuredClone(value);
    }
    return this.data;
  }

  /** كتابة ذرّية فورية. */
  persist() {
    if (!this.data) return;
    this.data.meta.updatedAt = Date.now();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  /**
   * تنفيذ تعديل ثم حفظه. أي استثناء يمنع الحفظ ويُعيد البيانات كما كانت،
   * فلا تُكتب حالة نصف مكتملة على القرص.
   */
  mutate(fn) {
    const snapshot = JSON.stringify(this.data);
    let result;
    try {
      result = fn(this.data);
    } catch (err) {
      this.data = JSON.parse(snapshot);
      throw err;
    }
    this.persist();
    return result;
  }

  // ——— وصول مختصر للمجموعات ———
  get settings() {
    return this.data.settings;
  }
  collection(name) {
    return this.data[name];
  }
  find(name, id) {
    return this.data[name].find((row) => row.id === id) || null;
  }
  require(name, id, error) {
    const row = this.find(name, id);
    if (!row) throw error;
    return row;
  }
  insert(name, row) {
    this.data[name].push(row);
    return row;
  }
}

export const db = new Database();
export default db;
