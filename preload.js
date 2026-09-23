const { contextBridge } = require('electron');

const VPS_API_URL = 'http://82.197.65.71:3001'; // Update to your PM2 backend port if needed

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