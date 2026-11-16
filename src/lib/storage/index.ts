import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type StoredFile = {
  key: string;
  url: string;
  sizeBytes?: number;
  contentType?: string;
};

export interface StorageAdapter {
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

function localBaseDir() {
  return path.join(process.cwd(), '.data', 'storage');
}

class LocalStorageAdapter implements StorageAdapter {
  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<StoredFile> {
    const full = path.join(localBaseDir(), key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const buf = Buffer.from(data);
    await fs.writeFile(full, buf);
    return { key, url: `/api/storage/${key}`, sizeBytes: buf.length, contentType };
  }
  async delete(key: string): Promise<void> {
    const full = path.join(localBaseDir(), key);
    await fs.unlink(full).catch(() => {});
  }
  getPublicUrl(key: string): string {
    return `/api/storage/${key}`;
  }
  async read(key: string): Promise<Buffer> {
    const full = path.join(localBaseDir(), key);
    return fs.readFile(full);
  }
}

class VercelBlobStorageAdapter implements StorageAdapter {
  private token: string;
  constructor(token: string) { this.token = token; }
  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<StoredFile> {
    const { put } = await import('@vercel/blob');
    const blob = await put(key, Buffer.from(data), { access: 'public', contentType, token: this.token, addRandomSuffix: false });
    // @vercel/blob doesn't always return size in all versions; store what we know
    return { key, url: blob.url, sizeBytes: Buffer.from(data).length, contentType };
  }
  async delete(key: string): Promise<void> {
    const { del } = await import('@vercel/blob');
    // del takes url(s); we try best-effort by listing not feasible; store url in DB normally. Here delete by key not directly supported without url.
    // Caller should handle; no-op fallback.
    void key;
    void del;
  }
  getPublicUrl(key: string): string {
    // Not knowable without stored URL; DB stores canonical URL.
    return key;
  }
}

let _adapter: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  _adapter = token ? new VercelBlobStorageAdapter(token) : new LocalStorageAdapter();
  return _adapter;
}

export function isLocalStorage() {
  return !process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readLocalStorage(key: string): Promise<Buffer | null> {
  if (!isLocalStorage()) return null;
  const adapter = getStorage() as LocalStorageAdapter & { read: (k: string) => Promise<Buffer> };
  try {
    return await adapter.read(key);
  } catch {
    return null;
  }
}

export function makeStorageKey(prefix: string, ext: string) {
  const id = crypto.randomUUID();
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  return `${prefix}/${id}.${safeExt}`;
}

export async function downloadToBuffer(url: string, timeoutMs = 120000): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer: Buffer.from(ab), contentType };
}
