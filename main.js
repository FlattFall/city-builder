const { app, BrowserWindow, Menu, shell } = require('electron');

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#1a1c2c',
    title: 'Supplyville',
    icon: require('path').join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true }
  });
  win.maximize();
  win.loadFile('index.html');
  // i link esterni (es. la segnalazione dei bug su GitHub) si aprono nel browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // F11 = schermo intero, F5 = ricarica il gioco (utile dopo aver aggiornato i file)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F5') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
