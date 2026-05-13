import { ipcMain, screen, dialog, shell } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { IPC } from '../renderer/shared/types';
import type { AppSettings } from '../renderer/shared/types';
import { stateStore } from './stateStore';
import { TimerEngine } from './timerEngine';
import { freezeController } from './freezeController';
import { windowManager } from './windowManager';
import { showPhaseNotification } from './notificationManager';
import { playAlertSound } from './soundManager';
// ── Focus OS services ───────────────────────────────────────────────────────
import { focusStore } from './services/store';
import { secureStore } from './services/keychain/secureStore';
import { checkAccessibilityPermission, openAccessibilitySettings } from './services/capture/permissionCheck';
import { notesService } from './services/notes/notesService';
import { todoService } from './services/todo/todoService';
import { gmailService } from './services/gmail/gmailService';
import { coursesService } from './services/courses/coursesService';
import { assignmentService } from './services/assignments/assignmentService';
import { deadlineService } from './services/deadlines/deadlineService';
import { syllabusParserService } from './services/syllabus/syllabusParserService';
import { classSessionService } from './services/classes/classSessionService';
import { studyService } from './services/study/studyService';
import { confusionService } from './services/study/confusionService';
import { criticalEmailService } from './services/gmail/criticalEmailService';
import { todayService } from './services/today/todayService';
import { attentionAlertService } from './services/attention/attentionAlertService';
import { folderWatcherService } from './services/folders/folderWatcherService';
import { isManagedMaterialPath, storeUploadedCourseMaterial, type StoreUploadedFileRequest } from './services/materials/materialStorageService';
import { revisionsService } from './services/revisions/revisionsService';
import { exportNoteToPdf } from './services/export/pdfExport';
import { buildRevealHtml } from './services/export/slideExport';
import { publishStaticSite } from './services/export/staticSiteExport';
import { flashcardSyncService } from './services/study/flashcardSyncService';
import { buildICS, defaultFilename } from './services/calendar/icsExport';
import { generateQuiz, generateFlashcards, generateStudyNotes, summarizeContent, checkOllamaHealth } from './services/llm/generationService';
import { randomUUID } from 'node:crypto';
import { significantWords, calendarDay, hasWordOverlap } from './services/syllabus/dedup';
import { allTextFromTipTapJson, parseTipTapJson } from '../shared/tiptap';

// Stop words for auto-tag keyword extraction (module-level for readability)
const AUTO_TAG_STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','can','could',
  'i','you','he','she','it','we','they','my','your','his','her','its','our','their',
  'this','that','these','those','and','but','or','nor','for','yet','so','in','on',
  'at','to','from','by','with','of','about','into','through','during','before',
  'after','above','below','between','out','off','over','under','again','further',
  'then','once','here','there','when','where','why','how','all','each','every',
  'both','few','more','most','other','some','such','no','not','only','same','than','too','very',
]);

let timerEngine: TimerEngine;

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function isAllowedMaterialSourcePath(candidatePath: string): boolean {
  if (isManagedMaterialPath(candidatePath)) return true;
  const courses = coursesService.list();
  return courses.some(c =>
    c.materialsFolderPath && isPathInside(c.materialsFolderPath, candidatePath)
  );
}

export function setupIPC() {
  timerEngine = new TimerEngine(stateStore.getSnapshot().settings);

  // ── Timer engine events → renderer ────────────────────────────────────
  timerEngine.on('tick', (data) => {
    stateStore.updateSilent({
      remainingSeconds: data.remainingSeconds,
      phase: data.phase,
      isRunning: data.isRunning,
    });
    windowManager.sendToFloating(IPC.TIMER_TICK, data);
    try {
      windowManager.updateTrayProgress(data.remainingSeconds, timerEngine.totalSeconds, data.phase);
    } catch { /* ignore */ }
  });

  timerEngine.on('stateChanged', () => {
    stateStore.update({
      remainingSeconds: timerEngine.remainingSeconds,
      totalSeconds:     timerEngine.totalSeconds,
      phase:            timerEngine.phase,
      isRunning:        timerEngine.isRunning,
      cycleCount:       timerEngine.cycleCount,
    });
  });

  timerEngine.on('phaseComplete', ({ newPhase }) => {
    const settings = stateStore.getSnapshot().settings;
    try { showPhaseNotification(newPhase, settings); } catch { /* ignore */ }
    try { playAlertSound(settings); }               catch { /* ignore */ }

    if (newPhase === 'break' || newPhase === 'longBreak') {
      if (settings.freezeDuration > 0) {
        const dur = Math.floor(newPhase === 'break' ? settings.breakDuration : settings.longBreakDuration);
        timerEngine.start();
        freezeController.enter(newPhase, dur, () => {
          timerEngine.resetToPhase('focus');
          if (settings.autoStartFocus) timerEngine.start();
        });
      } else if (settings.autoStartBreaks) {
        timerEngine.start();
      }
    } else if (newPhase === 'focus' && settings.autoStartFocus) {
      timerEngine.start();
    }
  });

  stateStore.on('changed', (state) => {
    windowManager.sendToAll(IPC.STATE_UPDATED, state);
  });

  // ── Core timer IPC ────────────────────────────────────────────────────
  ipcMain.handle(IPC.TIMER_START,      () => timerEngine.start());
  ipcMain.handle(IPC.TIMER_PAUSE,      () => timerEngine.pause());
  ipcMain.handle(IPC.TIMER_RESET,      () => {
    timerEngine.reset();
    stateStore.update({ remainingSeconds: timerEngine.remainingSeconds, isRunning: false });
  });
  ipcMain.handle(IPC.TIMER_SKIP_PHASE, () => timerEngine.skipPhase());
  ipcMain.handle(IPC.TASK_SET, (_e, task: string) => stateStore.update({ currentTask: task }));
  ipcMain.handle(IPC.SETTINGS_GET, () => stateStore.getSnapshot().settings);
  ipcMain.handle(IPC.SETTINGS_SET, (_e, s: AppSettings) => {
    stateStore.saveSettings(s);
    stateStore.update({ settings: s });
    timerEngine.updateSettings(s);
  });
  ipcMain.handle(IPC.STATE_GET,    () => stateStore.getSnapshot());
  ipcMain.handle(IPC.WINDOW_RESIZE, (_e, h: number, w?: number, isIsland?: boolean) => {
    windowManager.resizeFloating(Math.round(h), w ? Math.round(w) : undefined, isIsland);
  });

  // Returns the menu-bar / hardware-notch inset for the primary display,
  // using the same floor (24) as windowManager so every layer agrees.
  ipcMain.handle('window:getNotchHeight', () => {
    const display = screen.getPrimaryDisplay();
    return Math.max(display.workArea.y - display.bounds.y, 24);
  });

  // Timer toggle push event from renderer shortcut
  ipcMain.handle('timer:toggle', () => {
    if (timerEngine.isRunning) timerEngine.pause(); else timerEngine.start();
  });

  // ── Focus OS: Captures ────────────────────────────────────────────────
  ipcMain.handle('capture:list', (_e, req: { limit?: number; category?: string }) => {
    let items = focusStore.get('captures');
    if (req?.category) items = items.filter(c => c.category === req.category);
    if (req?.limit)    items = items.slice(0, req.limit);
    return items;
  });

  ipcMain.handle('capture:save', (_e, req: { text: string; source: 'highlight' | 'manual' | 'shortcut'; courseId?: string; category?: string }) => {
    const capture = {
      id: randomUUID(),
      text: req.text,
      source: req.source,
      courseId: req.courseId,
      category: req.category,
      createdAt: Date.now(),
      pinned: false,
    };
    focusStore.addCapture(capture);
    // Notify any open windows so the captures list refreshes immediately
    windowManager.sendToFloating('capture:new', capture);
    windowManager.notesWindow?.webContents?.send('capture:new', capture);
    return capture;
  });

  ipcMain.handle('capture:delete', (_e, req: { id: string }) => {
    focusStore.set('captures', focusStore.get('captures').filter(c => c.id !== req.id));
  });

  ipcMain.handle('capture:pin', (_e, req: { id: string; pinned: boolean }) => {
    focusStore.updateCapture(req.id, { pinned: req.pinned });
    return focusStore.get('captures').find(c => c.id === req.id)!;
  });

  ipcMain.handle('capture:update', (_e, req) => {
    focusStore.updateCapture(req.id, req.patch);
    return focusStore.get('captures').find(c => c.id === req.id)!;
  });

  // ── Focus OS: Capture Linking ──────────────────────────────────────────
  ipcMain.handle('capture:unlinked', (_e, req: { courseId?: string; limit?: number }) => {
    const captures = focusStore.get('captures');
    const notes = notesService.list();
    // Collect all captureIds that are already linked to any note
    const linkedIds = new Set<string>();
    for (const note of notes) {
      if (note.capturedFromIds) {
        for (const cid of note.capturedFromIds) linkedIds.add(cid);
      }
    }
    let unlinked = captures.filter(c => !linkedIds.has(c.id));
    if (req?.courseId) unlinked = unlinked.filter(c => c.courseId === req.courseId);
    // Sort newest first
    unlinked.sort((a, b) => b.createdAt - a.createdAt);
    if (req?.limit) unlinked = unlinked.slice(0, req.limit);
    return unlinked;
  });

  ipcMain.handle('capture:linkToNote', (_e, req: { captureIds: string[]; noteId: string }) => {
    const note = notesService.get(req.noteId);
    if (!note) throw new Error(`Note not found: ${req.noteId}`);
    const existing = new Set(note.capturedFromIds || []);
    const captures = focusStore.get('captures');
    let linked = 0;

    // Build TipTap content to append
    const newBlocks: any[] = [];
    for (const cid of req.captureIds) {
      if (existing.has(cid)) continue; // idempotent: skip duplicates
      const capture = captures.find(c => c.id === cid);
      if (!capture) continue;
      existing.add(cid);
      linked++;
      // Append as a sourceQuote node (matches existing TipTap extension)
      newBlocks.push({
        type: 'sourceQuote',
        attrs: { captureId: cid, source: capture.sourceApp || capture.source },
        content: [{ type: 'text', text: capture.text }],
      });
    }

    // Merge into existing TipTap JSON content
    const content = parseTipTapJson(note.content) ?? { type: 'doc', content: [] };
    if (!content.content) content.content = [];
    content.content.push(...newBlocks);

    const updated = notesService.update(req.noteId, {
      capturedFromIds: Array.from(existing),
      content: JSON.stringify(content),
    });
    return { note: updated, linked };
  });

  // ── Focus OS: Notes ───────────────────────────────────────────────────
  ipcMain.handle('notes:list',   ()              => notesService.list());
  ipcMain.handle('notes:get',    (_e, r)         => notesService.get(r.id));
  ipcMain.handle('notes:create', (_e, r)         => notesService.create(r));
  ipcMain.handle('notes:update', (_e, r) => {
    // Attic revisions (DokuWiki port): snapshot the PRIOR state before
    // applying the patch — only when content actually changes (other
    // patches like documentType / tags don't warrant a snapshot). The
    // service's MIN_GAP_MS debounces rapid saves so we don't churn the
    // disk during typing.
    if (r.patch?.content !== undefined) {
      const prior = notesService.get(r.id);
      if (prior && prior.content !== r.patch.content) {
        revisionsService.snapshot(prior);
      }
    }
    const updated = notesService.update(r.id, r.patch);
    // Auto-sync flashcards: any time a note's content changes, re-derive its
    // heading-based cards. Stable cardKey preserves SM-2 review state.
    if (r.patch?.content !== undefined) {
      try { flashcardSyncService.syncNote(r.id); } catch (e: any) {
        console.warn('[flashcardSync] syncNote failed:', e.message);
      }
    }
    return updated;
  });

  // List & restore note revisions (Attic port)
  ipcMain.handle('notes:listRevisions', (_e, r: { noteId: string }) => {
    return revisionsService.listFor(r.noteId);
  });
  ipcMain.handle('notes:restoreRevision', (_e, r: { noteId: string; timestamp: number }) => {
    const prior = revisionsService.read(r.noteId, r.timestamp);
    if (!prior) throw new Error(`Revision not found: ${r.timestamp}`);
    // Snapshot the CURRENT state before overwriting it, so a restore is
    // itself reversible.
    const current = notesService.get(r.noteId);
    if (current) revisionsService.snapshot(current);
    return notesService.update(r.noteId, { content: prior.content, title: prior.title });
  });
  ipcMain.handle('notes:delete', (_e, r)         => notesService.delete(r.id));

  // ── Focus OS: Todos ───────────────────────────────────────────────────
  ipcMain.handle('todo:list',      ()     => todoService.list());
  ipcMain.handle('todo:create',    (_e, r) => todoService.create(r));
  ipcMain.handle('todo:update',    (_e, r) => todoService.update(r.id, r.patch));
  ipcMain.handle('todo:setActive', (_e, r) => todoService.setActive(r.id));
  ipcMain.handle('todo:delete',    (_e, r) => todoService.delete(r.id));

  // ── Focus OS Student: Courses ─────────────────────────────────────────
  ipcMain.handle('course:list', (_e, r) => coursesService.list(r));
  ipcMain.handle('course:create', (_e, r) => coursesService.create(r));
  ipcMain.handle('course:update', (_e, r) => coursesService.update(r.id, r.patch));
  ipcMain.handle('course:archive', (_e, r) => coursesService.archive(r.id));
  ipcMain.handle('course:get', (_e, r) => coursesService.get(r.id));

  // ── Folder watcher: per-course Materials folder ──────────────────────
  // Opens a folder picker, persists the chosen path on the course, and
  // refreshes the watcher. Returns the updated course (or null if user cancelled).
  ipcMain.handle('course:pickMaterialsFolder', async (_e, r: { courseId: string }) => {
    const win = windowManager.notesWindow ?? windowManager.floatingWindow;
    const result = await dialog.showOpenDialog(win!, {
      title: 'Pick a Course Materials folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const folderPath = result.filePaths[0];
    const updated = coursesService.update(r.courseId, { materialsFolderPath: folderPath });
    folderWatcherService.refresh();
    return updated;
  });

  // Detach the folder from the course and stop watching it. Imported notes
  // are kept (the user can delete them manually).
  ipcMain.handle('course:clearMaterialsFolder', (_e, r: { courseId: string }) => {
    const updated = coursesService.update(r.courseId, { materialsFolderPath: undefined });
    folderWatcherService.refresh();
    return updated;
  });

  // Read a file's bytes for the renderer (used by folder watcher import flow
  // and app-managed direct upload previews). Restricted to course material
  // source paths to prevent arbitrary filesystem reads from a compromised renderer.
  ipcMain.handle('folder:readFile', async (_e, r: { path: string }) => {
    if (!isAllowedMaterialSourcePath(r.path)) {
      throw new Error('Path not inside an authorized course materials location');
    }
    const buf = await fsp.readFile(r.path);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  // Store an original file uploaded directly through the renderer into
  // StudyDesk-managed course material storage. Renderer wiring is separate:
  // this IPC only makes the backend capable of preserving originals.
  ipcMain.handle('materials:storeUploadedFile', async (_e, r: StoreUploadedFileRequest) => {
    const course = coursesService.get(r.courseId);
    if (!course) throw new Error('Course not found');
    const record = await storeUploadedCourseMaterial(r);
    folderWatcherService.recordImport(r.courseId, record);
    return record;
  });

  // Renderer reports completion of an auto-import so the file isn't re-imported next scan.
  ipcMain.handle('folder:recordImport', (_e, r: { courseId: string; record: any }) => {
    folderWatcherService.recordImport(r.courseId, r.record);
    return true;
  });

  // Open a source file (PDF / TXT / MD) in the user's default application.
  // Used by the SourceQuote TipTap node to "jump to source" — click a quote
  // in a note to open the original document. Same path-restriction policy
  // as folder:readFile: only files inside a configured course materials
  // folder are allowed, so a malicious renderer can't tell the OS to open
  // arbitrary files (e.g. ~/.ssh/id_rsa).
  // Export a single note to PDF (mdne-electron port). Renders via an
  // offscreen BrowserWindow + webContents.printToPDF.
  ipcMain.handle('notes:exportPdf', async (_e, r: { noteId: string }) => {
    const note = notesService.get(r.noteId);
    if (!note) throw new Error('Note not found');
    const win = windowManager.notesWindow ?? windowManager.floatingWindow;
    const safeBase = (note.title || 'note').replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/_+/g, '_');
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export note as PDF',
      defaultPath: `${safeBase}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const doc = parseTipTapJson(note.content) ?? { type: 'doc', content: [] };
    const out = await exportNoteToPdf({ title: note.title || 'note', doc, outPath: result.filePath });
    return { written: true, path: out.path, bytes: out.bytes };
  });

  // Publish a folder as a browsable static site (MkDocs port).
  // Generates one HTML file per note + an index page + JSON search index
  // + a tiny in-page search.js. No third-party dep — substring scoring
  // is fast enough for a few hundred notes.
  ipcMain.handle('notes:publishStaticSite', async (_e, r: { courseId?: string }) => {
    const win = windowManager.notesWindow ?? windowManager.floatingWindow;
    const result = await dialog.showOpenDialog(win!, {
      title: 'Pick an output folder for the static site',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const outDir = result.filePaths[0];
    const out = await publishStaticSite({
      notes: notesService.list(),
      courses: coursesService.list(),
      courseId: r?.courseId,
      outDir,
    });
    return { written: true, ...out };
  });

  // Export a note as a reveal.js slide deck (CodiMD slide-mode port).
  // Splits on horizontal-rule nodes; output is a single HTML file
  // using reveal.js from a CDN.
  ipcMain.handle('notes:exportSlides', async (_e, r: { noteId: string }) => {
    const note = notesService.get(r.noteId);
    if (!note) throw new Error('Note not found');
    const win = windowManager.notesWindow ?? windowManager.floatingWindow;
    const safeBase = (note.title || 'slides').replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/_+/g, '_');
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export note as slide deck',
      defaultPath: `${safeBase}-slides.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const doc = parseTipTapJson(note.content) ?? { type: 'doc', content: [] };
    const html = buildRevealHtml({ title: note.title || 'Slides', doc });
    await fsp.writeFile(result.filePath, html, 'utf-8');
    return { written: true, path: result.filePath, bytes: Buffer.byteLength(html, 'utf-8') };
  });

  // Export a note to a .md file. Renderer serializes the TipTap JSON
  // to markdown and passes it as a string; main shows a save dialog and
  // writes the file. No path restriction here since the user explicitly
  // picks the destination via the native dialog.
  ipcMain.handle('notes:exportMarkdown', async (_e, r: { title: string; markdown: string }) => {
    const win = windowManager.notesWindow ?? windowManager.floatingWindow;
    const safeBase = (r.title || 'note').replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/_+/g, '_');
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export note as Markdown',
      defaultPath: `${safeBase}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fsp.writeFile(result.filePath, r.markdown, 'utf-8');
    return { written: true, path: result.filePath, bytes: Buffer.byteLength(r.markdown, 'utf-8') };
  });

  ipcMain.handle('shell:openSourceFile', async (_e, r: { path: string; page?: number; timestamp?: string }) => {
    if (!isAllowedMaterialSourcePath(r.path)) {
      throw new Error('Path not inside an authorized course materials location');
    }
    // T6: best-effort page/timestamp anchors. macOS Preview accepts
    // file://...#page=N via shell.openExternal but flakily; we try
    // it for PDFs, fall back to plain shell.openPath for everything
    // else. shell.openExternal honors fragment for many apps that
    // shell.openPath would strip — that's why we branch.
    if (r.page && r.page > 0 && r.path.toLowerCase().endsWith('.pdf')) {
      const fileUrl = 'file://' + encodeURI(r.path).replace(/'/g, "%27") + '#page=' + r.page;
      try {
        await shell.openExternal(fileUrl);
        return true;
      } catch {
        // fall through to plain open
      }
    }
    // Audio/video timestamp seeking would require launching a custom
    // player with a CLI flag. The system default player rarely accepts
    // such args, so for now we just open the file — the timestamp is
    // visible in the quote chrome so the user can scrub manually.
    const errMsg = await shell.openPath(r.path);
    if (errMsg) throw new Error(errMsg);
    return true;
  });

  // Manually trigger a folder rescan (e.g. after user edits a folder externally).
  ipcMain.handle('folder:rescan', () => {
    folderWatcherService.refresh();
    return true;
  });

  // ── Focus OS Student: Assignments ─────────────────────────────────────
  ipcMain.handle('assignment:list', (_e, r) => assignmentService.list(r));
  ipcMain.handle('assignment:create', (_e, r) => assignmentService.create(r));
  ipcMain.handle('assignment:update', (_e, r) => assignmentService.update(r.id, r.patch));
  ipcMain.handle('assignment:delete', (_e, r) => assignmentService.delete(r.id));
  ipcMain.handle('assignment:parse', (_e, r) => assignmentService.parse(r));
  ipcMain.handle('assignment:markSubmitted', (_e, r) => assignmentService.markSubmitted(r.id));

  // ── Focus OS Student: Deadlines ───────────────────────────────────────
  ipcMain.handle('deadline:list', (_e, r) => deadlineService.list(r));
  ipcMain.handle('deadline:create', (_e, r) => deadlineService.create(r));
  ipcMain.handle('deadline:update', (_e, r) => deadlineService.update(r.id, r.patch));
  ipcMain.handle('deadline:delete', (_e, r) => deadlineService.delete(r.id));
  ipcMain.handle('deadline:complete', (_e, r) => deadlineService.complete(r.id));

  // ── .ics calendar export (Syllabus-to-Calendar inspired, RFC 5545) ────
  // Builds an .ics from current deadlines + courses, prompts the user for a
  // save location, writes the file. Returns { written, path, count } or null
  // if cancelled.
  ipcMain.handle('calendar:exportDeadlines', async (_e, r: { courseId?: string; includeCompleted?: boolean }) => {
    const deadlines = focusStore.get('academicDeadlines');
    const courses = focusStore.get('courses');
    const targetCourse = r?.courseId ? courses.find(c => c.id === r.courseId) : undefined;
    const ics = buildICS(deadlines, courses, {
      courseId: r?.courseId,
      includeCompleted: r?.includeCompleted,
    });
    const win = windowManager.notesWindow ?? windowManager.floatingWindow;
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export deadlines to calendar',
      defaultPath: defaultFilename(targetCourse),
      filters: [{ name: 'iCalendar', extensions: ['ics'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fsp.writeFile(result.filePath, ics, 'utf-8');
    // Count VEVENTs to report back accurately (after filtering).
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    return { written: true, path: result.filePath, count };
  });

  // ── Focus OS Student: Syllabus ────────────────────────────────────────
  ipcMain.handle('syllabus:parse', (_e, r) => syllabusParserService.parse(r));
  ipcMain.handle('syllabus:confirmImport', (_e, r) => {
    // 1. Course — create or reuse
    let courseId: string = r.courseId;
    if (!courseId && r.course?.name) {
      courseId = coursesService.create(r.course).id;
    }

    // 2. Syllabus note — create if sourceText provided, or update existing note
    let syllabusNoteId: string | undefined = r.syllabusNoteId;
    if (!syllabusNoteId && r.sourceText) {
      const note = notesService.create({ title: r.course?.name ? `${r.course.code ?? ''} ${r.course.name} Syllabus`.trim() : 'Syllabus', content: r.sourceText });
      notesService.update(note.id, { documentType: 'syllabus', courseId });
      syllabusNoteId = note.id;
    } else if (syllabusNoteId) {
      notesService.update(syllabusNoteId, { documentType: 'syllabus', courseId });
    }

    // 3. Assignments — create from confirmed assignment items
    //    assignmentService.create auto-creates a deadline, so skip those in step 4
    const assignmentDeadlineIds = new Set<string>();
    const assignments = (r.assignments ?? [])
      .filter((a: any) => a.confirmed !== false)
      .map((a: any) => {
        const created = assignmentService.create({
          title: a.title,
          courseId,
          dueDate: a.dueDate,
          sourceType: 'syllabus',
          sourceId: syllabusNoteId,
          description: a.description,
        });
        assignmentDeadlineIds.add(created.id);
        return created;
      });

    // 4. Deadlines — create from confirmed deadline items, skip duplicates of assignment-created deadlines
    //    assignmentService.create auto-creates a deadline when dueDate exists.
    //    Filter out any standalone deadline that matches a created assignment by date + title overlap.
    const assignmentFingerprints: Array<{ day: string; words: Set<string> }> = assignments
      .filter((a: any) => a.dueDate)
      .map((a: any) => ({
        day: calendarDay(a.dueDate),
        words: significantWords(a.title),
      }));

    const deadlines = (r.deadlines ?? [])
      .filter((d: any) => d.confirmed !== false)
      .filter((d: any) => {
        if (!d.deadlineAt) return true;
        const dDay = calendarDay(d.deadlineAt);
        const dWords = significantWords(d.title);
        // Skip if same calendar day AND significant title word overlap with any assignment
        return !assignmentFingerprints.some(af =>
          af.day === dDay && hasWordOverlap(af.words, dWords)
        );
      })
      .map((d: any) => deadlineService.create({
        ...d,
        courseId: d.courseId ?? courseId,
        sourceType: 'syllabus',
        sourceId: d.sourceId ?? syllabusNoteId,
      }));

    // 5. Class session placeholders — SKIPPED.
    //    classSessionService.start() sets startedAt=now which is wrong for future classes.
    //    ClassSession is designed for live/completed sessions, not scheduled placeholders.
    //    Schedule rows are already captured as deadlines (type 'meeting') or in the parse result.

    // 6. Setup task alerts — write directly to store
    const setupAlerts: any[] = [];
    for (const task of (r.setupTasks ?? [])) {
      if (task.confirmed === false) continue;
      const alert = {
        id: randomUUID(),
        sourceType: 'setup' as const,
        sourceId: syllabusNoteId,
        courseId,
        title: task.title,
        reason: `Setup task from syllabus import: ${task.category ?? 'general'}`,
        actionLabel: 'Complete setup',
        priority: 'medium' as const,
        status: 'new' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      focusStore.addAttentionAlert(alert);
      setupAlerts.push(alert);
    }

    return {
      courseId,
      syllabusNoteId,
      counts: {
        deadlines: deadlines.length,
        assignments: assignments.length,
        setupAlerts: setupAlerts.length,
      },
      deadlines,
      assignments,
    };
  });

  // ── Focus OS Student: Class Mode ──────────────────────────────────────
  ipcMain.handle('class:start', (_e, r) => classSessionService.start(r));
  ipcMain.handle('class:update', (_e, r) => classSessionService.update(r.id, r.patch));
  ipcMain.handle('class:end', (_e, r) => classSessionService.end(r.id, r.patch));
  ipcMain.handle('class:list', (_e, r) => classSessionService.list(r));
  ipcMain.handle('class:get', (_e, r) => classSessionService.get(r.id));

  // ── Focus OS Student: Study ───────────────────────────────────────────
  ipcMain.handle('study:list', (_e, r) => studyService.list(r));
  ipcMain.handle('study:create', (_e, r) => studyService.create(r));
  ipcMain.handle('study:update', (_e, r) => studyService.update(r.id, r.patch));
  ipcMain.handle('study:review', (_e, r) => studyService.review(r.id, r.difficulty));
  ipcMain.handle('study:delete', (_e, r) => studyService.delete(r.id));

  // ── Flashcard sync (StudyMD-style note → cards) ──────────────────────
  ipcMain.handle('study:syncNote',    (_e, r: { noteId: string; headingLevel?: number }) =>
    flashcardSyncService.syncNote(r.noteId, r.headingLevel));
  ipcMain.handle('study:syncAllNotes', (_e, r: { headingLevel?: number }) =>
    flashcardSyncService.syncAllNotes(r?.headingLevel));
  ipcMain.handle('study:cardsFromNote', (_e, r: { noteId: string }) =>
    flashcardSyncService.cardsFromNote(r.noteId));
  ipcMain.handle('study:syncCapture',  (_e, r: { capture: any; back?: string }) =>
    flashcardSyncService.syncCapture(r.capture, { back: r.back }));

  // ── Focus OS Student: Confusions ──────────────────────────────────────
  ipcMain.handle('confusion:list', (_e, r) => confusionService.list(r));
  ipcMain.handle('confusion:create', (_e, r) => confusionService.create(r));
  ipcMain.handle('confusion:update', (_e, r) => confusionService.update(r.id, r.patch));
  ipcMain.handle('confusion:resolve', (_e, r) => confusionService.resolve(r.id));

  // ── Focus OS Student: Critical Alerts ─────────────────────────────────
  ipcMain.handle('criticalAlerts:list', (_e, r) => criticalEmailService.list(r));
  ipcMain.handle('criticalAlerts:snooze', (_e, r) => criticalEmailService.snooze(r.id, r.snoozedUntil));
  ipcMain.handle('criticalAlerts:dismiss', (_e, r) => criticalEmailService.dismiss(r.id));
  ipcMain.handle('criticalAlerts:resolve', (_e, r) => criticalEmailService.resolve(r.id));
  ipcMain.handle('criticalAlerts:convertToTask', (_e, r) => criticalEmailService.convertToTask(r.id));

  // ── StudyDesk: Local Attention Alerts ─────────────────────────────────
  ipcMain.handle('attentionAlerts:list', (_e, r) => {
    attentionAlertService.refreshGenerated();
    return attentionAlertService.list(r);
  });
  ipcMain.handle('attentionAlerts:snooze', (_e, r) => attentionAlertService.snooze(r.id, r.snoozedUntil));
  ipcMain.handle('attentionAlerts:dismiss', (_e, r) => attentionAlertService.dismiss(r.id));
  ipcMain.handle('attentionAlerts:resolve', (_e, r) => attentionAlertService.resolve(r.id));

  // ── Focus OS Student: Today ───────────────────────────────────────────
  ipcMain.handle('today:get', () => todayService.get());

  // ── Focus OS: Gmail ───────────────────────────────────────────────────
  ipcMain.handle('gmail:connect', async (_e, r: { email: string; appPassword: string }) => {
    const result = await gmailService.connect(r.email, r.appPassword);
    if (result.ok) {
      gmailService.startPolling((items) => windowManager.sendToFloating('gmail:newEmails', items));
      gmailService.fetchNow()
        .then((items) => windowManager.sendToFloating('gmail:newEmails', items))
        .catch((err) => console.error('[gmailService] Initial fetch failed:', err));
    }
    return result;
  });
  // OAuth2 path — works for Workspace accounts where App Passwords are blocked
  ipcMain.handle('gmail:oauthConnect', async (_e, r: { clientId: string; clientSecret: string }) => {
    const result = await gmailService.oauthConnect(r.clientId, r.clientSecret);
    if (result.ok) {
      gmailService.startPolling((items) => windowManager.sendToFloating('gmail:newEmails', items));
      // Kick an immediate fetch so the user sees their inbox right away
      // instead of waiting for the next 15-min poll tick.
      gmailService.fetchNow()
        .then((items) => windowManager.sendToFloating('gmail:newEmails', items))
        .catch((err) => console.error('[gmailService] Initial fetch failed:', err));
    }
    return result;
  });
  ipcMain.handle('gmail:disconnect', () => {
    gmailService.disconnect();
    return { ok: true };
  });
  ipcMain.handle('gmail:hasShippedOAuth', () => gmailService.hasShippedOAuth());
  // Wipe stored Client ID + Secret so a fresh paste isn't fighting stale values
  ipcMain.handle('gmail:resetOAuthCredentials', () => {
    focusStore.updateSettings({
      gmailEnabled: false,
      gmailEmail: undefined,
      gmailOauthClientId: undefined,
      gmailOauthClientSecretEncrypted: undefined,
      gmailOauthRefreshTokenEncrypted: undefined,
      gmailOauthAccessTokenEncrypted: undefined,
      gmailOauthAccessTokenExpiresAt: undefined,
    });
    return { ok: true };
  });
  ipcMain.handle('gmail:fetchNow', async () => {
    const items = await gmailService.fetchNow();
    windowManager.sendToFloating('gmail:newEmails', items);
    return items;
  });
  ipcMain.handle('gmail:list',    ()      => gmailService.list());
  ipcMain.handle('gmail:archive', (_e, r) => gmailService.archive(r.id));

  // ── Focus OS: Settings ────────────────────────────────────────────────
  ipcMain.handle('focus:settings:get',    () => focusStore.getSettings());
  ipcMain.handle('focus:settings:update', (_e, r) => focusStore.updateSettings(r));
  ipcMain.handle('focus:settings:setLLMKey', (_e, r: { provider: 'anthropic' | 'openai'; key: string; model: string }) => {
    const encrypted = secureStore.encrypt(r.key);
    focusStore.updateSettings({
      llmProvider:          r.provider,
      llmApiKeyEncrypted:   encrypted,
      llmModel:             r.model,
    });
  });

  // ── Focus OS: Categories ──────────────────────────────────────────────
  ipcMain.handle('category:list',   ()      => focusStore.get('categories'));
  ipcMain.handle('category:create', (_e, r) => {
    const cat = { id: randomUUID(), name: r.name, description: r.description, color: r.color, createdAt: Date.now() };
    focusStore.set('categories', [...focusStore.get('categories'), cat]);
    return cat;
  });
  ipcMain.handle('category:delete', (_e, r) => {
    focusStore.set('categories', focusStore.get('categories').filter(c => c.id !== r.id));
  });

  // ── Focus OS: Permissions ─────────────────────────────────────────────
  ipcMain.handle('permission:checkAccessibility',    () => checkAccessibilityPermission());
  ipcMain.handle('permission:openAccessibilitySettings', () => openAccessibilitySettings());
  ipcMain.handle('system:safeStorageAvailable',       () => secureStore.isAvailable());

  // ── AI Generation (Ollama / cloud LLM) ────────────────────────────────
  ipcMain.handle('ai:generateQuiz', async (_e, req) => generateQuiz(req.noteContent, req.count));
  ipcMain.handle('ai:generateFlashcards', async (_e, req) => generateFlashcards(req.noteContent, req.count));
  ipcMain.handle('ai:generateStudyNotes', async (_e, req) => generateStudyNotes(req.noteContent));
  ipcMain.handle('ai:summarize', async (_e, req: { content: string; maxLength?: number }) => summarizeContent(req.content, req.maxLength));
  ipcMain.handle('ai:checkOllama', async (_e, req) => checkOllamaHealth(req?.endpoint));

  // ── Notes: Auto-tag ─────────────────────────────────────────────────────
  ipcMain.handle('notes:autoTag', async (_e, req: { noteId: string }) => {
    const note = notesService.get(req.noteId);
    if (!note) throw new Error(`Note not found: ${req.noteId}`);
    const text = allTextFromTipTapJson(note.content, note.title || '').slice(0, 8000);
    // Simple keyword extraction: word frequency minus stop words
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !AUTO_TAG_STOP_WORDS.has(w));
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    // Top 3 keywords by frequency
    const tags = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);
    // Also include course name as a tag if available
    if (note.courseId) {
      const course = coursesService.get(note.courseId);
      if (course) {
        const courseTag = course.code?.toLowerCase() || course.name.toLowerCase().split(' ')[0];
        if (courseTag && !tags.includes(courseTag)) tags.unshift(courseTag);
      }
    }
    // Update the note
    notesService.update(note.id, { tags });
    return { tags };
  });

  // ── Focus OS: Window control ──────────────────────────────────────────
  ipcMain.handle('window:openNotes', (_e, r: { noteId?: string }) => {
    windowManager.openNotesWindow(r?.noteId);
  });
  ipcMain.handle('window:openWorkspace', (_e, r: { noteId?: string }) => {
    windowManager.openNotesWindow(r?.noteId);
  });
  ipcMain.handle('window:openSettings', () => {
    windowManager.sendToFloating('ui:openSettings', undefined);
  });

}

export function toggleTimer() {
  if (timerEngine.isRunning) timerEngine.pause(); else timerEngine.start();
}
export function isTimerRunning() { return timerEngine?.isRunning || false; }
export function pauseTimer()  { if (timerEngine?.isRunning)  timerEngine.pause(); }
export function resumeTimer() { if (!timerEngine?.isRunning) timerEngine.start(); }
