// Folder watcher — monitors per-course "Course Materials" folders for new
// files and emits detection events to the renderer. The renderer is
// responsible for reading the file, extracting text, and creating the Note.
// This split keeps the main process small and reuses the renderer's
// existing PDF parsing infrastructure (pdfjs-dist).
//
// Detection strategy: poll-based scan on a debounced fs.watch trigger.
// fs.watch alone is unreliable across platforms and rename/atomic-write
// patterns, so we use it as a hint and re-scan the directory on each event.

import { promises as fsp, existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { coursesService } from '../courses/coursesService';
import type { Course, MaterialsImportRecord } from '../../../shared/schema/index';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown'] as const;
const DEBOUNCE_MS = 750;

export interface FileDetectedPayload {
  courseId: string;
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
}

export type FileDetectedHandler = (payload: FileDetectedPayload) => void;

class FolderWatcherService {
  private watchers = new Map<string, FSWatcher>(); // key: courseId
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private onDetected: FileDetectedHandler | null = null;

  // Start watching all courses that have a materialsFolderPath set.
  // Safe to call multiple times — restarts cleanly.
  start(onDetected: FileDetectedHandler) {
    this.onDetected = onDetected;
    this.refresh();
  }

  // Re-read course list and reconcile watchers (start/stop as needed).
  refresh() {
    if (!this.onDetected) return;
    const courses = coursesService.list();
    const wantedCourseIds = new Set(
      courses.filter(c => !!c.materialsFolderPath && existsSync(c.materialsFolderPath!))
        .map(c => c.id)
    );

    // Stop watchers for courses no longer wanting one
    for (const [courseId, w] of this.watchers) {
      if (!wantedCourseIds.has(courseId)) {
        try { w.close(); } catch { /* noop */ }
        this.watchers.delete(courseId);
      }
    }

    // Start watchers for newly configured courses
    for (const course of courses) {
      if (!course.materialsFolderPath || !existsSync(course.materialsFolderPath)) continue;
      if (this.watchers.has(course.id)) continue;
      this.watchCourse(course);
    }

    // Run an initial scan for every active course so existing files are
    // imported on first launch after configuring a folder.
    for (const course of courses) {
      if (course.materialsFolderPath && existsSync(course.materialsFolderPath)) {
        this.scheduleScan(course.id);
      }
    }
  }

  stop() {
    for (const w of this.watchers.values()) {
      try { w.close(); } catch { /* noop */ }
    }
    this.watchers.clear();
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
  }

  // Mark a file as imported (or failed). Stored on the Course so we don't
  // re-import on restart. Called from the renderer via IPC after the
  // renderer creates the Note.
  recordImport(courseId: string, record: MaterialsImportRecord) {
    const course = coursesService.get(courseId);
    if (!course) return;
    const existing = course.materialsImportedFiles ?? [];
    // Replace any prior record for the same path
    const next = existing.filter(r => r.path !== record.path);
    next.push(record);
    coursesService.update(courseId, { materialsImportedFiles: next });
  }

  private watchCourse(course: Course) {
    if (!course.materialsFolderPath) return;
    const folderPath = course.materialsFolderPath;
    try {
      const w = watch(folderPath, { persistent: false }, () => {
        this.scheduleScan(course.id);
      });
      w.on('error', (err) => {
        console.warn(`[folderWatcher] watch error for ${folderPath}:`, err.message);
      });
      this.watchers.set(course.id, w);
      console.log(`[folderWatcher] watching ${folderPath} for course ${course.id}`);
    } catch (err: any) {
      console.warn(`[folderWatcher] failed to watch ${folderPath}:`, err.message);
    }
  }

  private scheduleScan(courseId: string) {
    const existing = this.debounceTimers.get(courseId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(courseId);
      void this.scan(courseId);
    }, DEBOUNCE_MS);
    this.debounceTimers.set(courseId, timer);
  }

  private async scan(courseId: string) {
    const course = coursesService.get(courseId);
    if (!course?.materialsFolderPath) return;
    const folderPath = course.materialsFolderPath;
    if (!existsSync(folderPath)) return;

    let entries: string[];
    try {
      entries = await fsp.readdir(folderPath);
    } catch (err: any) {
      console.warn(`[folderWatcher] readdir failed:`, err.message);
      return;
    }

    const known = new Map(
      (course.materialsImportedFiles ?? []).map(r => [r.path, r])
    );

    for (const entry of entries) {
      if (entry.startsWith('.')) continue; // skip dotfiles
      const ext = path.extname(entry).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext as typeof SUPPORTED_EXTENSIONS[number])) continue;

      const fullPath = path.join(folderPath, entry);
      let stat;
      try {
        stat = await fsp.stat(fullPath);
      } catch { continue; }
      if (!stat.isFile()) continue;

      const prior = known.get(fullPath);
      // Skip if we've already imported this exact file (same path + mtime + size)
      if (prior && prior.mtime === stat.mtimeMs && prior.size === stat.size && prior.noteId) {
        continue;
      }

      this.onDetected?.({
        courseId,
        path: fullPath,
        name: entry,
        ext,
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    }
  }
}

export const folderWatcherService = new FolderWatcherService();
