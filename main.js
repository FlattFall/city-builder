const { app, BrowserWindow, Menu } = require('electron');

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#1a1c2c',
    title: 'City Builder',
    webPreferences: { contextIsolation: true }
  });
  win.loadFile('index.html');

  // F11 = schermo intero
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
