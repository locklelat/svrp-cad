const { contextBridge } = require('electron');
const CONFIG = require('./config'); 
const VPS_API_URL = CONFIG.API_URL;

contextBridge.exposeInMainWorld('api', {
    VPS_API_URL
});

const { contextBridge, ipcRenderer } = require('electron');
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