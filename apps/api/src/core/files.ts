import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { copyFile, mkdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { validation } from './errors';

// Uploaded files (organisation logos, …) — on the API server's disk, served read-only at /fs/{key}.
// A key is "{folder}/{name}-{random}.{ext}": every upload gets a new name, so the files can be cached for good.
// Later the same keys can move to object storage (S3) behind /fs/ without touching the database.

export const FS_ROOT = resolve(process.env.FS_ROOT ?? join(__dirname, '..', '..', 'storage', 'fs'));
export const FS_PREFIX = '/fs/';
/** Logo of an organisation that has none (the loans.ge logo) — always at /fs/default/org-logo.png. */
export const DEFAULT_ORG_LOGO = 'default/org-logo.png';

/** Puts the default logo into the storage if it is not there yet (a fresh server, a cleaned folder). */
export async function ensureDefaults() {
  const target = resolve(FS_ROOT, DEFAULT_ORG_LOGO);
  if (await stat(target).then(() => true, () => false)) return;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(__dirname, '..', '..', 'assets', 'default-org-logo.png'), target);
}

/** Images allowed as logos — detected by content, not by the file name. */
const sniff = (b: Buffer): string | null => {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  const head = b.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
};

@Injectable()
export class FileStore {
  /** Checks an uploaded image and stores it; returns its key. */
  async saveImage(folder: string, name: string, file: { buffer: Buffer; size: number } | undefined, maxBytes: number) {
    if (!file?.buffer?.length) throw validation([{ field: 'File', message: 'ფაილი არ არის' }]);
    if (file.size > maxBytes) throw validation([{ field: 'File', message: `მაქსიმუმ ${Math.round(maxBytes / 1024)} KB` }]);
    const ext = sniff(file.buffer);
    if (!ext) throw validation([{ field: 'File', message: 'დასაშვებია PNG, JPG, WebP ან SVG' }]);
    // an SVG is shown through <img> (no scripts run there) and served with a sandboxing CSP — scripts are refused anyway
    if (ext === 'svg' && /<script|\bon[a-z]+\s*=|javascript:/i.test(file.buffer.toString('utf8'))) throw validation([{ field: 'File', message: 'SVG სკრიპტს არ უნდა შეიცავდეს' }]);
    const key = `${folder}/${name}-${randomBytes(6).toString('hex')}.${ext}`;
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer);
    return key;
  }

  /** Removes a stored file (a missing one is fine). */
  async remove(key: string | null | undefined) {
    if (!key) return;
    await unlink(this.path(key)).catch(() => undefined);
  }

  /** Absolute path of a key — never outside the storage root. */
  private path(key: string) {
    const p = resolve(FS_ROOT, key);
    if (!p.startsWith(FS_ROOT)) throw validation([{ field: 'File', message: 'არასწორი ფაილი' }]);
    return p;
  }
}
