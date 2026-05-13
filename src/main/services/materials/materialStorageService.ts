import { app } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MaterialsImportRecord } from '../../../shared/schema/index';

export interface StoreUploadedFileRequest {
  courseId: string;
  noteId?: string;
  filename: string;
  mime?: string;
  extension?: string;
  materialCategory?: string;
  bytes: ArrayBuffer | Uint8Array | number[] | { data?: number[] };
}

function userDataPath(): string {
  try {
    return app.getPath('userData');
  } catch {
    return path.join(process.cwd(), '.studydesk-user-data');
  }
}

function toBuffer(value: StoreUploadedFileRequest['bytes']): Buffer {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && typeof value === 'object' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  throw new Error('Uploaded file bytes were not readable.');
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function getMaterialsStorageRoot(): string {
  return path.join(userDataPath(), 'course-materials');
}

export function getCourseMaterialStorageDir(courseId: string): string {
  return path.join(getMaterialsStorageRoot(), courseId);
}

export function safeMaterialFilename(originalName: string): string {
  const fallback = 'course-material';
  const parsed = path.parse(originalName || fallback);
  const base = (parsed.name || fallback)
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || fallback;
  const ext = parsed.ext.replace(/[^\w.]/g, '').slice(0, 16);
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${base}${ext}`;
}

export function isManagedMaterialPath(candidatePath: string): boolean {
  return isPathInside(getMaterialsStorageRoot(), candidatePath);
}

export async function storeUploadedCourseMaterial(
  request: StoreUploadedFileRequest,
): Promise<MaterialsImportRecord> {
  if (!request.courseId) throw new Error('courseId is required.');
  if (!request.filename?.trim()) throw new Error('filename is required.');

  const dir = getCourseMaterialStorageDir(request.courseId);
  await fsp.mkdir(dir, { recursive: true });

  const storedPath = path.join(dir, safeMaterialFilename(request.filename));
  const buffer = toBuffer(request.bytes);
  await fsp.writeFile(storedPath, buffer);
  const stat = await fsp.stat(storedPath);
  const extension = (request.extension || path.extname(request.filename).replace(/^\./, '')).toLowerCase();

  return {
    path: storedPath,
    storedPath,
    courseId: request.courseId,
    originalFilename: request.filename,
    mime: request.mime,
    extension,
    materialCategory: request.materialCategory,
    sourceKind: 'direct_upload',
    noteId: request.noteId,
    mtime: stat.mtimeMs,
    size: stat.size,
    importedAt: Date.now(),
  };
}
