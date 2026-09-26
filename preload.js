const { contextBridge, ipcRenderer } = require('electron');
const argPrefix = '--api-url=';
const apiArg = process.argv.find(arg => arg.startsWith(argPrefix));
const VPS_API_URL = apiArg ? apiArg.replace(argPrefix, '') : '';

contextBridge.exposeInMainWorld('api', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
});

contextBridge.exposeInMainWorld('cadAPI', {
    fetchData: async (endpoint, data = {}) => {
        try {
            const response = await fetch(`${VPS_API_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const text = await response.text();
            return text ? JSON.parse(text) : {};
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            return null;
        }
    }
});