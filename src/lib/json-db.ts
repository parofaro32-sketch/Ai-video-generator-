import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type Row = Record<string, any>;

type Store = {
  user: Row[];
  session: Row[];
  generationJob: Row[];
  jobEvent: Row[];
  video: Row[];
  videoProject: Row[];
  providerHealth: Row[];
  providerMetric: Row[];
  cleanupSetting: Row[];
};

const MODEL_KEYS: (keyof Store)[] = [
  'user', 'session', 'generationJob', 'jobEvent', 'video', 'videoProject', 'providerHealth', 'providerMetric', 'cleanupSetting',
];

function emptyStore(): Store {
  return {
    user: [], session: [], generationJob: [], jobEvent: [], video: [], videoProject: [], providerHealth: [], providerMetric: [], cleanupSetting: [],
  };
}

function now() { return new Date(); }

function genId() {
  // cuid-like enough for fallback
  return 'c' + crypto.randomBytes(12).toString('base64url');
}

function getByPath(obj: any, key: string) {
  return obj?.[key];
}

function matchScalar(value: any, cond: any): boolean {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    if ('in' in cond) {
      const arr = cond.in as any[];
      return arr.some((v) => isEqualVal(value, v));
    }
    if ('gt' in cond) {
      return toTime(value) > toTime(cond.gt);
    }
    if ('gte' in cond) {
      return toTime(value) >= toTime(cond.gte);
    }
    if ('lt' in cond) {
      return toTime(value) < toTime(cond.lt);
    }
    if ('lte' in cond) {
      return toTime(value) <= toTime(cond.lte);
    }
    if ('equals' in cond) {
      return isEqualVal(value, cond.equals);
    }
    if ('not' in cond) {
      if (cond.not === null) return value != null;
      return !isEqualVal(value, cond.not);
    }
  }
  return isEqualVal(value, cond);
}

function toTime(v: any): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' || typeof v === 'number') {
    const t = new Date(v).getTime();
    return isNaN(t) ? Number(v) || 0 : t;
  }
  if (v == null) return 0;
  return Number(v) || 0;
}

function isEqualVal(a: any, b: any): boolean {
  if (a instanceof Date || b instanceof Date) return toTime(a) === toTime(b);
  if (a === b) return true;
  if (a == null && b == null) return true;
  return false;
}

function matchesWhere(row: Row, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND)) return where.AND.every((w: any) => matchesWhere(row, w));
  if (Array.isArray(where.OR)) return where.OR.some((w: any) => matchesWhere(row, w));
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'AND' || k === 'OR' || k === 'NOT') continue;
    const val = getByPath(row, k);
    if (!matchScalar(val, cond)) return false;
  }
  return true;
}

function compareVals(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const ta = toTime(a), tb = toTime(b);
  if ((a instanceof Date || b instanceof Date) || (!isNaN(ta) && !isNaN(tb) && (typeof a === 'string' || a instanceof Date) && (typeof b === 'string' || b instanceof Date))) {
    if (ta < tb) return -1; if (ta > tb) return 1; return 0;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a), sb = String(b);
  if (sa < sb) return -1; if (sa > sb) return 1; return 0;
}

function applyOrderBy(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const ord of orders) {
      const [k, dir] = Object.entries(ord)[0] as [string, string];
      const c = compareVals(a[k], b[k]);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
  return copy;
}

function applySelect(row: Row | null, args: any): Row | null {
  if (!row) return row;
  // include handled separately; select not heavily used
  return { ...row };
}

class JsonDb {
  private store: Store = emptyStore();
  private filePath: string;
  private ready = false;

  constructor() {
    const dir = process.env.LOCAL_STORAGE_DIR
      ? path.resolve(process.env.LOCAL_STORAGE_DIR)
      : path.join(process.cwd(), '.data');
    const candidates = [path.join(dir, 'db.json'), path.join('/tmp', 'cineforge-db.json')];
    this.filePath = candidates[0];
    for (const c of candidates) {
      try {
        fs.mkdirSync(path.dirname(c), { recursive: true });
        // try write test lazily; pick first writable dir
        this.filePath = c;
        break;
      } catch {}
    }
  }

  private load() {
    if (this.ready) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.store = { ...emptyStore(), ...parsed };
      } else {
        this.store = emptyStore();
      }
    } catch {
      this.store = emptyStore();
    }
    // revive dates
    for (const key of MODEL_KEYS) {
      this.store[key] = (this.store[key] || []).map((r) => reviveDates(r));
    }
    this.ready = true;
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.store), 'utf8');
    } catch {
      // try /tmp fallback
      try {
        const alt = path.join('/tmp', 'cineforge-db.json');
        if (this.filePath !== alt) {
          this.filePath = alt;
          fs.mkdirSync(path.dirname(alt), { recursive: true });
        }
        fs.writeFileSync(this.filePath, JSON.stringify(this.store), 'utf8');
      } catch {}
    }
  }

  private table(name: keyof Store): Row[] {
    this.load();
    if (!this.store[name]) this.store[name] = [];
    return this.store[name];
  }

  private applyDefaults(model: string, data: Row): Row {
    const d = { ...data };
    if (!d.id) d.id = genId();
    const t = now();
    if (d.createdAt == null && hasCreatedAt(model)) d.createdAt = t;
    if (hasUpdatedAt(model)) d.updatedAt = t;
    // model-specific defaults
    if (model === 'generationJob') {
      if (d.status == null) d.status = 'queued';
      if (d.aspectRatio == null) d.aspectRatio = 'ratio_16_9';
      if (d.attemptCount == null) d.attemptCount = 0;
    }
    if (model === 'video') {
      if (d.mimeType == null) d.mimeType = 'video/mp4';
    }
    if (model === 'providerHealth') {
      if (d.available == null) d.available = false;
      if (d.consecutiveFailures == null) d.consecutiveFailures = 0;
      if (d.supportedTypes == null) d.supportedTypes = [];
    }
    if (model === 'providerMetric') {
      // has createdAt
    }
    if (model === 'cleanupSetting') {
      if (d.keepFailedJobs == null) d.keepFailedJobs = true;
    }
    return d;
  }

  private handleNestedCreate(model: string, data: any): Row {
    const { events, ...rest } = data || {};
    const row = this.applyDefaults(model, rest);
    // push row first so relations can reference
    this.table(model as keyof Store).push(row);
    if (model === 'generationJob' && events && events.create) {
      const creates = Array.isArray(events.create) ? events.create : [events.create];
      for (const ev of creates) {
        const evRow = this.applyDefaults('jobEvent', { ...ev, jobId: row.id });
        this.table('jobEvent').push(evRow);
      }
    }
    return row;
  }

  private includeRelations(model: string, row: Row, include: any): Row {
    if (!include) return row;
    const out = { ...row };
    if (model === 'session' && include.user) {
      out.user = this.table('user').find((u) => u.id === row.userId) || null;
    }
    if (model === 'generationJob') {
      if (include.outputVideo) {
        out.outputVideo = row.outputVideoId ? (this.table('video').find((v) => v.id === row.outputVideoId) || null) : null;
      }
      if (include.events) {
        let evs = this.table('jobEvent').filter((e) => e.jobId === row.id);
        const evArgs = include.events === true ? {} : include.events;
        evs = applyOrderBy(evs, evArgs.orderBy);
        if (typeof evArgs.take === 'number') evs = evs.slice(0, evArgs.take);
        out.events = evs;
      }
    }
    if (model === 'videoProject') {
      if (include.videos) {
        let vids = this.table('video').filter((v) => v.projectId === row.id);
        const vArgs = include.videos === true ? {} : include.videos;
        if (vArgs.where) vids = vids.filter((v) => matchesWhere(v, vArgs.where));
        vids = applyOrderBy(vids, vArgs.orderBy);
        if (typeof vArgs.take === 'number') vids = vids.slice(0, vArgs.take);
        out.videos = vids;
      }
      if (include.jobs) {
        let jobs = this.table('generationJob').filter((j) => j.projectId === row.id);
        const jArgs = include.jobs === true ? {} : include.jobs;
        if (jArgs.where) jobs = jobs.filter((j) => matchesWhere(j, jArgs.where));
        jobs = applyOrderBy(jobs, jArgs.orderBy);
        if (typeof jArgs.take === 'number') jobs = jobs.slice(0, jArgs.take);
        out.jobs = jobs;
      }
    }
    return out;
  }

  model(name: keyof Store) {
    const self = this;
    return {
      async findUnique(args: any) {
        const rows = self.table(name);
        const row = rows.find((r) => matchesWhere(r, args.where)) || null;
        if (!row) return null;
        return self.includeRelations(name, row, args.include);
      },
      async findFirst(args: any = {}) {
        let rows = self.table(name).filter((r) => matchesWhere(r, args.where));
        rows = applyOrderBy(rows, args.orderBy);
        const row = rows[0] || null;
        if (!row) return null;
        return self.includeRelations(name, row, args.include);
      },
      async findMany(args: any = {}) {
        let rows = self.table(name).filter((r) => matchesWhere(r, args.where));
        rows = applyOrderBy(rows, args.orderBy);
        if (typeof args.skip === 'number') rows = rows.slice(args.skip);
        if (typeof args.take === 'number') rows = rows.slice(0, args.take);
        return rows.map((r) => self.includeRelations(name, r, args.include));
      },
      async create(args: any) {
        const row = self.handleNestedCreate(name, args.data || {});
        self.save();
        return self.includeRelations(name, row, args.include);
      },
      async update(args: any) {
        const rows = self.table(name);
        const idx = rows.findIndex((r) => matchesWhere(r, args.where));
        if (idx < 0) throw new Error(`Record not found for update in ${name}`);
        rows[idx] = applyUpdate(name, rows[idx], args.data || {});
        self.save();
        return self.includeRelations(name, rows[idx], args.include);
      },
      async updateMany(args: any) {
        const rows = self.table(name);
        let count = 0;
        for (let i = 0; i < rows.length; i++) {
          if (matchesWhere(rows[i], args.where)) {
            rows[i] = applyUpdate(name, rows[i], args.data || {});
            count++;
          }
        }
        if (count) self.save();
        return { count };
      },
      async delete(args: any) {
        const rows = self.table(name);
        const idx = rows.findIndex((r) => matchesWhere(r, args.where));
        if (idx < 0) throw new Error(`Record not found for delete in ${name}`);
        const [removed] = rows.splice(idx, 1);
        self.save();
        return removed;
      },
      async deleteMany(args: any) {
        const rows = self.table(name);
        const before = rows.length;
        const kept = rows.filter((r) => !matchesWhere(r, args.where));
        self.store[name] = kept;
        const count = before - kept.length;
        if (count) self.save();
        return { count };
      },
      async upsert(args: any) {
        const rows = self.table(name);
        const idx = rows.findIndex((r) => matchesWhere(r, args.where));
        if (idx >= 0) {
          rows[idx] = applyUpdate(name, rows[idx], args.update || {});
          self.save();
          return self.includeRelations(name, rows[idx], args.include);
        } else {
          const row = self.handleNestedCreate(name, args.create || {});
          self.save();
          return self.includeRelations(name, row, args.include);
        }
      },
    };
  }
}

function hasCreatedAt(model: string) {
  return ['user','session','generationJob','jobEvent','video','videoProject','providerHealth','providerMetric','cleanupSetting'].includes(model);
}
function hasUpdatedAt(model: string) {
  return ['user','generationJob','videoProject','providerHealth','cleanupSetting'].includes(model);
}

function applyUpdate(model: string, row: Row, data: any): Row {
  const out = { ...row };
  for (const [k, v] of Object.entries(data || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if ('increment' in (v as any)) {
        out[k] = (Number(out[k]) || 0) + Number((v as any).increment || 0);
        continue;
      }
      if ('decrement' in (v as any)) {
        out[k] = (Number(out[k]) || 0) - Number((v as any).decrement || 0);
        continue;
      }
      if ('set' in (v as any)) {
        out[k] = (v as any).set;
        continue;
      }
    }
    out[k] = v as any;
  }
  if (hasUpdatedAt(model)) out.updatedAt = now();
  return out;
}

const DATE_KEYS = new Set(['createdAt','updatedAt','expiresAt','startedAt','completedAt','deletedAt','lastCheckedAt','lastSuccessAt','lastErrorAt','cooldownUntil']);

function reviveDates(row: Row): Row {
  const out: Row = { ...row };
  for (const k of Object.keys(out)) {
    if (DATE_KEYS.has(k) && typeof out[k] === 'string') {
      const d = new Date(out[k]);
      if (!isNaN(d.getTime())) out[k] = d;
    }
  }
  return out;
}

let _jsonDb: JsonDb | null = null;
export function getJsonDb(): any {
  if (!_jsonDb) _jsonDb = new JsonDb();
  const db = _jsonDb;
  const proxy: any = {};
  for (const m of MODEL_KEYS) {
    proxy[m] = db.model(m);
  }
  return proxy;
}
