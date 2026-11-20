// Electron main process: one window, two IPC calls (Claude check, transcribe).
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { claudeStatus } = require('./engine/claude');
const { transcribe } = require('./engine/transcribe');

const MODEL_DIR = app.isPackaged
  ? path.join(app.getPath('userData'), 'models', 'parakeet-tdt-0.6b-v3-int8')
  : path.join(__dirname, '..', 'models', 'parakeet-tdt-0.6b-v3-int8');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    backgroundColor: '#0b0b0f',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('claude:status', () => claudeStatus());
ipcMain.handle('media:open', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Media', extensions: ['mov', 'mp4', 'm4v', 'wav', 'm4a', 'mp3'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('media:transcribe', (_e, file) => transcribe(file, { modelDir: MODEL_DIR }));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
