import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../renderer/shared/types';
import type { AppSettings } from '../renderer/shared/types';

const INVOKE_CHANNELS = new Set<string>([
  IPC.TIMER_START,
  IPC.TIMER_PAUSE,
  IPC.TIMER_RESET,
  IPC.TIMER_SKIP_PHASE,
  IPC.TASK_SET,
  IPC.SETTINGS_GET,
  IPC.SETTINGS_SET,
  IPC.STATE_GET,
  IPC.WINDOW_RESIZE,
  'timer:toggle',
  'capture:list',
  'capture:save',
  'capture:delete',
  'capture:pin',
  'capture:update',
  'notes:list',
  'notes:get',
  'notes:create',
  'notes:update',
  'notes:delete',
  'todo:list',
  'todo:create',
  'todo:update',
  'todo:setActive',
  'todo:delete',
  'course:list',
  'course:create',
  'course:update',
  'course:archive',
  'course:get',
  'assignment:list',
  'assignment:create',
  'assignment:update',
  'assignment:delete',
  'assignment:parse',
  'assignment:markSubmitted',
  'deadline:list',
  'deadline:create',
  'deadline:update',
  'deadline:delete',
  'deadline:complete',
  'syllabus:parse',
  'syllabus:confirmImport',
  'class:start',
  'class:update',
  'class:end',
  'class:list',
  'class:get',
  'study:list',
  'study:create',
  'study:update',
  'study:review',
  'study:delete',
  'confusion:list',
  'confusion:create',
  'confusion:update',
  'confusion:resolve',
  'criticalAlerts:list',
  'criticalAlerts:snooze',
  'criticalAlerts:dismiss',
  'criticalAlerts:resolve',
  'criticalAlerts:convertToTask',
  'attentionAlerts:list',
  'attentionAlerts:snooze',
  'attentionAlerts:dismiss',
  'attentionAlerts:resolve',
  'today:get',
  'gmail:connect',
  'gmail:oauthConnect',
  'gmail:disconnect',
  'gmail:hasShippedOAuth',
  'gmail:resetOAuthCredentials',
  'gmail:fetchNow',
  'gmail:list',
  'gmail:archive',
  'focus:settings:get',
  'focus:settings:update',
  'focus:settings:setLLMKey',
  'category:list',
  'category:create',
  'category:delete',
  'permission:checkAccessibility',
  'permission:openAccessibilitySettings',
  'system:safeStorageAvailable',
  'window:openNotes',
  'window:openWorkspace',
  'window:openSettings',
  'window:getNotchHeight',
  // AI generation
  'ai:generateQuiz',
  'ai:generateFlashcards',
  'ai:generateStudyNotes',
  'ai:checkOllama',
  'ai:summarize',
]);

const SUBSCRIBE_CHANNELS = new Set<string>([
  IPC.TIMER_TICK,
  IPC.TIMER_PHASE_CHANGED,
  IPC.FREEZE_ENTER,
  IPC.FREEZE_TICK,
  IPC.FREEZE_EXIT,
  IPC.STATE_UPDATED,
  'gmail:newEmails',
  'capture:new',
  'ui:openSettings',
]);

function invokeAllowed(channel: string, req?: any) {
  if (!INVOKE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  return ipcRenderer.invoke(channel, req);
}

function onAllowed(channel: string, cb: (data: any) => void) {
  if (!SUBSCRIBE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  ipcRenderer.on(channel, (_e, data) => cb(data));
}

function offAllowed(channel: string) {
  if (!SUBSCRIBE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  ipcRenderer.removeAllListeners(channel);
}

contextBridge.exposeInMainWorld('focusAPI', {
  // ── Timer ──────────────────────────────────────────────────────────────
  startTimer:   () => ipcRenderer.invoke(IPC.TIMER_START),
  pauseTimer:   () => ipcRenderer.invoke(IPC.TIMER_PAUSE),
  resetTimer:   () => ipcRenderer.invoke(IPC.TIMER_RESET),
  skipPhase:    () => ipcRenderer.invoke(IPC.TIMER_SKIP_PHASE),
  toggleTimer:  () => ipcRenderer.invoke('timer:toggle'),
  setTask:      (task: string) => ipcRenderer.invoke(IPC.TASK_SET, task),
  getSettings:  () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  saveSettings: (s: AppSettings) => ipcRenderer.invoke(IPC.SETTINGS_SET, s),
  getState:     () => ipcRenderer.invoke(IPC.STATE_GET),
  resizeWindow: (height: number, width?: number, isIsland?: boolean) =>
    ipcRenderer.invoke(IPC.WINDOW_RESIZE, height, width, isIsland),
  getNotchHeight: () => ipcRenderer.invoke('window:getNotchHeight') as Promise<number>,

  // ── Timer push ─────────────────────────────────────────────────────────
  onTimerTick:        (cb: (d: any) => void) => ipcRenderer.on(IPC.TIMER_TICK,         (_e, d) => cb(d)),
  onPhaseChanged:     (cb: (d: any) => void) => ipcRenderer.on(IPC.TIMER_PHASE_CHANGED,(_e, d) => cb(d)),
  onFreezeEnter:      (cb: (d: any) => void) => ipcRenderer.on(IPC.FREEZE_ENTER,       (_e, d) => cb(d)),
  onFreezeTick:       (cb: (d: any) => void) => ipcRenderer.on(IPC.FREEZE_TICK,        (_e, d) => cb(d)),
  onFreezeExit:       (cb: () => void)        => ipcRenderer.on(IPC.FREEZE_EXIT,        () => cb()),
  onStateUpdated:     (cb: (d: any) => void) => ipcRenderer.on(IPC.STATE_UPDATED,      (_e, d) => cb(d)),
  removeAllListeners: (channel: string)       => offAllowed(channel),

});

contextBridge.exposeInMainWorld('electron', {
  invoke: invokeAllowed,
  on:     (channel: string, cb: (data: any) => void) => {
    onAllowed(channel, cb);
  },
  off: offAllowed,
});
