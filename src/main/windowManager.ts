import { BrowserWindow, screen, Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import { IPC } from '../renderer/shared/types';
import type { TimerPhase } from '../renderer/shared/types';
import { PHASE_LABELS } from '../renderer/shared/constants';

const PHASE_TRAY_COLORS: Record<string, string> = {
  focus: '#ef4444', break: '#22c55e', longBreak: '#3b82f6',
};

// macOS clamps borderless utility windows below the menu bar when y === bounds.y.
// Offset from the absolute display top so the visible notch cap touches y=0.
const NOTCH_TOP_EDGE_COMPENSATION = 0;

function getRendererUrl(page: string): string {
  return `file://${path.join(__dirname, '..', '..', 'renderer', 'src', 'renderer', page, 'index.html')}`;
}
function getPreloadPath(name: string): string {
  return path.join(__dirname, '..', 'preload', `${name}.js`);
}

/** Resolve app icon for window taskbar/title bar. Returns the file path or
 *  undefined if not found — Electron treats undefined as "use default". */
function getWindowIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'assets', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'assets', 'icon.png'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
  ];
  // require here to avoid top-of-file `fs` import churn — safe, runs once at boot
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

function makeTrayIcon(progress: number, color: string): Electron.NativeImage {
  try {
    const size = 32, r = 12, cx = size / 2, cy = size / 2;
    const c = 2 * Math.PI * r;
    const dash = c * Math.max(0, Math.min(1, progress));
    const gap  = c - dash;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="3"
        stroke-dasharray="${dash} ${gap}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>
    </svg>`;
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  } catch {
    return nativeImage.createEmpty();
  }
}

export class WindowManager {
  floatingWindow: BrowserWindow | null = null;
  notesWindow:    BrowserWindow | null = null;
  quickCaptureWindow: BrowserWindow | null = null;
  private freezeWindows: BrowserWindow[] = [];
  tray: Tray | null = null;
  private savedBounds: Electron.Rectangle | null = null;
  private freezeActive = false;
  private islandSavedBounds: Electron.Rectangle | null = null;
  private lastTrayProgress = -1;
  private lastTrayPhase: TimerPhase | null = null;

  // ── StudyDesk notch surface ───────────────────────────────────────────
  // Top-center and attached to the absolute display bounds, so the surface
  // visually grows from the physical notch/menu-bar edge instead of floating
  // below the macOS work area.
  createFloatingWindow(): BrowserWindow {
    const display = screen.getPrimaryDisplay();
    const { bounds } = display;
    const { x: dx, y: dy, width: dw } = bounds;

    // Use the hardware notch / menu-bar height as the shell height so it
    // matches pixel-for-pixel (38 on M-series Pro, 32 on Air, etc.).
    const NOTCH_H = Math.max(display.workArea.y - display.bounds.y, 32);
    // Match notchSizing.ts PHYSICAL_NOTCH_WIDTH so the BrowserWindow is
    // born at the same 180px the React app will resize it to on idle.
    // The previous 360px initial width painted a wide ghost bar during
    // the brief window between mount and the first resizeNotch('idle')
    // call — which the user kept calling out.
    const BAR_W = 180;
    const BAR_H = NOTCH_H;
    const x = dx + Math.round((dw - BAR_W) / 2);
    const y = dy - NOTCH_TOP_EDGE_COMPENSATION;

    const win = new BrowserWindow({
      width: BAR_W, height: BAR_H,
      x, y,
      type: 'panel',
      frame: false, transparent: true, hasShadow: false,
      alwaysOnTop: true, skipTaskbar: true,
      resizable: false,
      movable: false, // pinned to the notch — never user-draggable
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: getPreloadPath('floatingPreload'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    // Don't follow the user into fullscreen apps — the HUD is already
    // always-on-top across regular Spaces, which is plenty. Painting it
    // over fullscreen video / fullscreen IDE was the "always appears"
    // complaint.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    win.loadURL(getRendererUrl('floating'));

    const applyNotchPanel = () => {
      try {
        const addonPath = path.join(__dirname, '..', '..', '..', 'build', 'Release', 'notch_helper.node');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const notchHelper = require(addonPath);
        const result = notchHelper.makePanel(win.getNativeWindowHandle());
        console.log('[main] Native makePanel result:', result);
      } catch (e) {
        console.warn('[main] Native addon failed to load or makePanel:', e);
      }
    };

    // The HUD is now created lazily by the user (Cmd+Shift+P or tray),
    // so when ready-to-show fires we DO want it visible — that's the
    // user explicitly invoking the panel.
    win.once('ready-to-show', () => {
      win.show()
      applyNotchPanel()
    })
    // Forward renderer console + crash diagnostics to the terminal log.
    win.webContents.on('console-message', (_e, level, msg, line, src) => {
      if (level >= 2) console.log(`[renderer:${level}] ${msg} (${src}:${line})`);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[renderer:GONE]', details);
    });

    this.floatingWindow = win;

    return win;
  }

  // ── StudyDesk workspace window (persistent desktop doc — hide on close) ──
  createNotesWindow(): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay();

    const win = new BrowserWindow({
      width: 1440, height: 880,
      minWidth: 1024, minHeight: 640,
      x: workArea.x + 20, y: workArea.y + 30,
      title: 'StudyDesk Workspace',
      icon: getWindowIcon(),
      frame: true, transparent: false,
      resizable: true, movable: true,
      // Don't show in dock as a separate app — pill owns the dock presence
      skipTaskbar: false,
      webPreferences: {
        preload: getPreloadPath('notesPreload'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });

    win.loadURL(getRendererUrl('notes'));

    // Hide instead of close — preserves state, feels like a real desktop app
    win.on('close', (e) => {
      if (!(app as any).isQuitting) {
        e.preventDefault();
        win.hide();
      }
    });

    this.notesWindow = win;
    return win;
  }

  /** Tiny quick-capture window — port of electron-markdownify's tray
   *  capture pattern. Frameless, always-on-top, ~360x180, opens at the
   *  cursor and disappears on submit/escape. UI loaded from a data URL
   *  so we don't add another Vite entry point. Reuses the floating
   *  preload bridge for IPC access. */
  createQuickCaptureWindow(): BrowserWindow {
    const cursor = screen.getCursorScreenPoint();
    const W = 360, H = 180;
    const win = new BrowserWindow({
      width: W, height: H,
      x: cursor.x - Math.round(W / 2),
      y: cursor.y - Math.round(H / 2),
      type: 'panel',
      frame: false, transparent: true, hasShadow: true,
      alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: getPreloadPath('floatingPreload'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Inline UI — no Vite entry point needed. The preload's `electron`
    // bridge is available so we can call capture:save without IPC plumbing.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:13px -apple-system,system-ui,sans-serif;color:#f5f5f7;
       -webkit-app-region:drag;overflow:hidden;background:transparent}
  .card{background:rgba(20,20,24,0.94);backdrop-filter:blur(28px) saturate(1.6);
        -webkit-backdrop-filter:blur(28px) saturate(1.6);
        border:1px solid rgba(255,255,255,0.10);border-radius:14px;
        box-shadow:0 18px 48px rgba(0,0,0,0.55),0 1px 2px rgba(0,0,0,0.30);
        height:100vh;display:flex;flex-direction:column;overflow:hidden}
  .hdr{display:flex;justify-content:space-between;align-items:center;
       padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.06);
       font-size:10px;font-weight:700;letter-spacing:0.10em;
       text-transform:uppercase;color:rgba(255,255,255,0.55)}
  .hdr .hint{color:rgba(255,255,255,0.40);letter-spacing:0.04em;
             font-weight:500;text-transform:none;font-size:10.5px}
  textarea{flex:1;width:100%;padding:10px 14px;border:0;outline:0;
           background:transparent;color:#fff;font:inherit;font-size:13px;
           line-height:1.5;resize:none;-webkit-app-region:no-drag}
  textarea::placeholder{color:rgba(255,255,255,0.30);font-style:italic}
</style></head><body>
<div class="card">
  <div class="hdr"><span>📝 Quick capture</span><span class="hint">⌘↵ save · esc close</span></div>
  <textarea id="t" autofocus placeholder="What's on your mind?"></textarea>
</div>
<script>
  const t = document.getElementById('t');
  t.focus();
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { window.close(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      const text = t.value.trim();
      if (text) {
        try { await window.electron?.invoke('capture:save', { text, source: 'manual' }); } catch (_) {}
      }
      window.close();
    }
  });
</script></body></html>`;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    win.once('ready-to-show', () => { win.show(); win.focus(); });
    win.on('blur', () => { try { win.close() } catch { /* */ } });
    win.on('closed', () => { this.quickCaptureWindow = null; });

    this.quickCaptureWindow = win;
    return win;
  }

  /** Toggle the quick-capture window. If open: close. Otherwise: create + show. */
  toggleQuickCapture(): void {
    if (this.quickCaptureWindow && !this.quickCaptureWindow.isDestroyed()) {
      this.quickCaptureWindow.close();
      this.quickCaptureWindow = null;
    } else {
      this.createQuickCaptureWindow();
    }
  }

  openNotesWindow(noteId?: string): void {
    const win = this.notesWindow && !this.notesWindow.isDestroyed()
      ? this.notesWindow
      : this.createNotesWindow();

    if (win.isVisible()) {
      win.focus();
    } else {
      win.show();
      win.focus();
    }

    if (noteId) win.webContents.send('notes:openNote', noteId);
  }

  toggleNotesWindow(): void {
    const win = this.notesWindow && !this.notesWindow.isDestroyed()
      ? this.notesWindow
      : this.createNotesWindow();

    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  }

  // ── Freeze windows ──────────────────────────────────────────────────────
  createFreezeWindows() { this.rebuildFreezeWindows(); }

  rebuildFreezeWindows() {
    const displays = screen.getAllDisplays();
    if (this.freezeWindows.length === displays.length) {
      for (let i = 0; i < displays.length; i++) {
        const { x, y, width, height } = displays[i].bounds;
        if (!this.freezeWindows[i].isDestroyed()) {
          this.freezeWindows[i].setBounds({ x, y, width, height });
        }
      }
      return;
    }
    for (const win of this.freezeWindows) { try { win.destroy(); } catch { /* ignore */ } }
    this.freezeWindows = [];

    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      const win = new BrowserWindow({
        x, y, width, height,
        frame: false, transparent: false, backgroundColor: '#0a0a12',
        skipTaskbar: true, show: false, focusable: true,
        webPreferences: {
          preload: getPreloadPath('freezePreload'),
          contextIsolation: true, nodeIntegration: false, sandbox: false,
        },
      });
      win.on('close', (e) => { if (this.freezeActive) e.preventDefault(); });
      win.loadURL(getRendererUrl('freeze'));
      this.freezeWindows.push(win);
    }
  }

  // ── Tray ────────────────────────────────────────────────────────────────
  createTray() {
    const icon = makeTrayIcon(1, '#ef4444');
    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Focus OS');
    const menu = Menu.buildFromTemplate([
      { label: 'Show',  click: () => this.floatingWindow?.show() },
      { label: 'Notes', click: () => this.openNotesWindow() },
      { type: 'separator' },
      { label: 'Quit',  click: () => app.quit() },
    ]);
    this.tray.setContextMenu(menu);
    this.tray.on('click', () => {
      const win = this.floatingWindow;
      if (win) win.isVisible() ? win.hide() : win.show();
    });
  }

  updateTrayProgress(remaining: number, total: number, phase: TimerPhase) {
    if (!this.tray) return;
    try {
      const progress = total > 0 ? remaining / total : 1;
      const shouldRedraw = Math.abs(progress - this.lastTrayProgress) > 0.005 || phase !== this.lastTrayPhase;
      if (shouldRedraw) {
        const color = PHASE_TRAY_COLORS[phase] ?? '#ef4444';
        this.tray.setImage(makeTrayIcon(progress, color).resize({ width: 16, height: 16 }));
        this.lastTrayProgress = progress;
        this.lastTrayPhase    = phase;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      this.tray.setToolTip(`Focus OS — ${m}:${s.toString().padStart(2, '0')} (${PHASE_LABELS[phase]})`);
    } catch { /* ignore */ }
  }

  showFreeze() {
    this.freezeActive = true;
    if (this.floatingWindow) {
      this.savedBounds = this.floatingWindow.getBounds();
      this.floatingWindow.hide();
    }
    this.rebuildFreezeWindows();
    for (const win of this.freezeWindows) {
      if (win.isDestroyed()) continue;
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setSimpleFullScreen(true);
      win.show();
    }
  }

  hideFreeze() {
    this.freezeActive = false;
    for (const win of this.freezeWindows) {
      try { if (!win.isDestroyed()) { win.setSimpleFullScreen(false); win.hide(); } } catch { /* ignore */ }
    }
    if (this.floatingWindow) {
      if (this.savedBounds) this.floatingWindow.setBounds(this.savedBounds);
      this.floatingWindow.show();
    }
  }

  resizeFloating(height: number, width?: number, isIsland?: boolean) {
    const win = this.floatingWindow;
    if (!win || win.isDestroyed()) return;
    const [w] = win.getSize();
    const targetW = width ?? w;

    if (isIsland) {
      if (!this.islandSavedBounds) this.islandSavedBounds = win.getBounds();
      const currentDisplay = screen.getDisplayMatching(win.getBounds());
      const { bounds } = currentDisplay;
      const newX = bounds.x + Math.round((bounds.width - targetW) / 2);
      win.setBounds({ x: newX, y: bounds.y - NOTCH_TOP_EDGE_COMPENSATION, width: targetW, height }, true);
    } else if (isIsland === false && this.islandSavedBounds) {
      const display = screen.getDisplayMatching(win.getBounds());
      const { bounds } = display;
      const newX = bounds.x + Math.round((bounds.width - targetW) / 2);
      win.setBounds({ x: newX, y: bounds.y - NOTCH_TOP_EDGE_COMPENSATION, width: targetW, height }, true);
      this.islandSavedBounds = null;
    } else {
      // Spotlight stays top-center on every resize, expanding downward
      const display = screen.getDisplayMatching(win.getBounds());
      const { bounds } = display;
      const newX = bounds.x + Math.round((bounds.width - targetW) / 2);
      win.setBounds({ x: newX, y: bounds.y - NOTCH_TOP_EDGE_COMPENSATION, width: targetW, height }, true);
    }
  }

  updateEmailBadge(_show: boolean) { /* no-op in focus-os v1 */ }

  sendToFloating(channel: string, ...args: unknown[]) {
    this.floatingWindow?.webContents?.send(channel, ...args);
  }
  sendToFreeze(channel: string, ...args: unknown[]) {
    for (const win of this.freezeWindows) {
      try { win.webContents.send(channel, ...args); } catch { /* ignore */ }
    }
  }
  sendToAll(channel: string, ...args: unknown[]) {
    this.sendToFloating(channel, ...args);
    this.sendToFreeze(channel, ...args);
  }

  destroyAll() {
    this.freezeActive = false;
    this.floatingWindow?.destroy();
    this.notesWindow?.destroy();
    for (const win of this.freezeWindows) { try { win.destroy(); } catch { /* ignore */ } }
    this.floatingWindow = null;
    this.notesWindow    = null;
    this.freezeWindows  = [];
  }
}

export const windowManager = new WindowManager();
