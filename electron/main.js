const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Biar mikrofon bisa dipakai di Electron
const { session } = require('electron');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    title: 'Voice Runner',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#0a0a0a',
    show: false
  });

  // Load game
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // Tampilkan pas ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Fullscreen toggle
  ipcMain.on('toggle-fullscreen', () => {
    const isFull = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFull);
  });

  // Minimize
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });

  // Maximize / Restore
  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  // Close
  ipcMain.on('close-window', () => {
    mainWindow.close();
  });

  // Track maximize state for button icon
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', 'maximized');
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', 'normal');
  });
}

// Permissions handler untuk mic
app.on('ready', () => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true); // Izinkan mic
    } else {
      callback(false);
    }
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
