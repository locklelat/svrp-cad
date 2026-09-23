const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

// Optional: Configure logging for debugging updates
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

app.whenReady().then(() => {
    createWindow();

    // Check for updates immediately upon startup (only runs in production packaged app)
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

// When an update is found and downloaded, force-prompt or auto-install
autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: 'A new version of the SVRP CAD has been downloaded. The application will restart to apply the update.',
        buttons: ['Update Now']
    }).then(() => {
        autoUpdater.quitAndInstall();
    });
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1350,
        height: 850,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#0f172a',
        frame: false,       // <-- Removes the native OS window frame and title bar
        transparent: false, // Keeps background solid dark theme
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

    // Enable custom window controls if needed
    ipcMain.on('window-minimize', () => mainWindow.minimize());
    ipcMain.on('window-close', () => mainWindow.close());
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});