const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

// Logging for debugging updates
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

app.whenReady().then(() => {
    createWindow();

    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

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
        frame: false,
        transparent: false, 
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
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