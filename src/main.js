'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

let win = null;

/* ---------------- ffmpeg discovery ---------------- */
let ffmpegCache = null;
function ffmpegCandidates() {
  const list = [];
  if (process.env.VIZZY_FFMPEG) list.push(process.env.VIZZY_FFMPEG);
  try {
    let p = require('ffmpeg-static');
    if (p) {
      p = p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
      list.push(p);
    }
  } catch (e) { /* not installed */ }
  list.push('/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg');
  return list;
}
function findFfmpeg() {
  if (ffmpegCache) return ffmpegCache;
  const tried = [];
  for (const c of ffmpegCandidates()) {
    try {
      if (c.includes(path.sep) && !fs.existsSync(c)) { tried.push(c + ' (missing)'); continue; }
      const r = spawnSync(c, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 15000 });
      if (r.status === 0) {
        ffmpegCache = { path: c, hasX264: /libx264/.test(r.stdout), hasVT: /h264_videotoolbox/.test(r.stdout) };
        return ffmpegCache;
      }
      tried.push(c + ' (exit ' + r.status + ')');
    } catch (e) { tried.push(c + ' (' + e.message + ')'); }
  }
  return { error: 'FFmpeg could not be started.\nTried:\n' + tried.join('\n') + '\n\nFix: install it with Homebrew (brew install ffmpeg) and restart the app.' };
}

/* ---------------- window ---------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1180, minHeight: 700,
    backgroundColor: '#0f0b1c', title: 'Vizzy Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const send = (ch) => () => win && win.webContents.send('menu', ch);
  const tpl = [
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      { label: 'New project', accelerator: 'CmdOrCtrl+N', click: send('new') },
      { label: 'Open project…', accelerator: 'CmdOrCtrl+O', click: send('open') },
      { label: 'Save project', accelerator: 'CmdOrCtrl+S', click: send('save') },
      { type: 'separator' },
      { label: 'Load audio…', accelerator: 'CmdOrCtrl+L', click: send('audio') },
      { label: 'Export MP4…', accelerator: 'CmdOrCtrl+E', click: send('export') },
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
      { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.whenReady().then(() => { buildMenu(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { killFF(); app.quit(); });

/* ---------------- file dialogs / io ---------------- */
ipcMain.handle('dialog:open', async (e, opts) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: (opts && opts.filters) || [] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save', async (e, opts) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: opts && opts.defaultPath, filters: (opts && opts.filters) || [] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('fs:read', async (e, p) => fs.promises.readFile(p));
ipcMain.handle('fs:readText', async (e, p) => fs.promises.readFile(p, 'utf8'));
ipcMain.handle('fs:writeText', async (e, p, text) => { await fs.promises.writeFile(p, text, 'utf8'); return true; });
ipcMain.handle('shell:reveal', async (e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('app:confirm', async (e, message) => {
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancel', 'OK'], defaultId: 1, cancelId: 0, message });
  return r.response === 1;
});

/* ---------------- MP4 export (raw RGBA frames -> ffmpeg) ---------------- */
let ff = null, ffErr = '', ffExit = null, ffDone = null, ffOut = null;
function killFF() { if (ff) { try { ff.stdin.destroy(); ff.kill('SIGKILL'); } catch (e) { /* ignore */ } } ff = null; }

ipcMain.handle('export:start', async (e, o) => {
  killFF();
  const info = findFfmpeg();
  if (info.error) return { ok: false, error: info.error };
  let encoder = o.encoder === 'hardware' ? 'hardware' : 'software';
  let note = '';
  if (encoder === 'software' && !info.hasX264) {
    if (info.hasVT) { encoder = 'hardware'; note = 'This FFmpeg has no libx264, so the hardware encoder is used.'; }
    else return { ok: false, error: 'This FFmpeg build has no H.264 encoder.' };
  }
  if (encoder === 'hardware' && !info.hasVT) { encoder = 'software'; note = 'Hardware encoder not available, using software.'; }
  const q = { fast: { crf: 23, bpp: 0.07 }, balanced: { crf: 19, bpp: 0.12 }, high: { crf: 15, bpp: 0.2 } }[o.quality] || { crf: 19, bpp: 0.12 };
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', o.w + 'x' + o.h, '-r', String(o.fps), '-i', 'pipe:0'];
  if (o.audioPath) args.push('-i', o.audioPath);
  args.push('-map', '0:v:0');
  if (o.audioPath) args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k');
  if (encoder === 'hardware') {
    const br = Math.round(o.w * o.h * o.fps * q.bpp);
    args.push('-c:v', 'h264_videotoolbox', '-b:v', String(br), '-allow_sw', '1', '-profile:v', 'high');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(q.crf), '-profile:v', 'high');
  }
  args.push('-pix_fmt', 'yuv420p', '-r', String(o.fps), '-t', String(o.duration), '-movflags', '+faststart', o.outPath);
  ffErr = ''; ffExit = null; ffOut = o.outPath;
  try {
    ff = spawn(info.path, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  } catch (err) { return { ok: false, error: 'Could not start FFmpeg: ' + err.message }; }
  ff.stderr.on('data', (d) => { ffErr += d.toString(); if (ffErr.length > 8000) ffErr = ffErr.slice(-8000); });
  ff.stdin.on('error', () => { /* handled through exit code */ });
  ffDone = new Promise((resolve) => {
    ff.on('error', (err) => { ffErr += '\n' + err.message; ffExit = -1; resolve(-1); });
    ff.on('close', (code) => { ffExit = code; resolve(code); });
  });
  return { ok: true, note, encoder, ffmpeg: info.path };
});

ipcMain.handle('export:frame', async (e, buf) => {
  if (!ff || ffExit !== null) return { error: ffErr || 'FFmpeg stopped unexpectedly.' };
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const ok = ff.stdin.write(b);
  if (!ok) {
    await Promise.race([
      new Promise((res) => ff.stdin.once('drain', res)),
      ffDone,
    ]);
  }
  if (ffExit !== null) return { error: ffErr || 'FFmpeg stopped unexpectedly.' };
  return { ok: true };
});

ipcMain.handle('export:finish', async () => {
  if (!ff) return { ok: false, error: 'Export was not running.' };
  try { ff.stdin.end(); } catch (e) { /* ignore */ }
  const code = await ffDone;
  const out = ffOut, err = ffErr;
  ff = null;
  return code === 0 ? { ok: true, path: out } : { ok: false, error: err || 'FFmpeg exited with code ' + code };
});

ipcMain.handle('export:cancel', async () => {
  const out = ffOut;
  killFF();
  if (out) { try { await fs.promises.unlink(out); } catch (e) { /* ignore */ } }
  return true;
});
