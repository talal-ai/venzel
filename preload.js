const { ipcRenderer, contextBridge } = require("electron");

// Try to load dotenv, but don't fail if it's not available
try {
    require('dotenv').config();
} catch (error) {
    console.warn('⚠️ Failed to load dotenv package:', error.message);
}

// Add helper function to ensure role is passed when opening links
function openWithRole(url) {
    const role = localStorage.getItem('user_role');
    console.log(`Opening ${url} with role: ${role || 'unknown'}`);
    
    // To ensure menu copying works, we pass the role but let the main process
    // handle the actual menu copying from the parent window
    ipcRenderer.send('open-in-app', url, role);
    
    // Log for debugging
    console.log(`Sent open-in-app request for ${url} with role: ${role || 'unknown'}`);
}

// Safely expose protected Node.js APIs to the renderer process
contextBridge.exposeInMainWorld('electron', {
    // IPC functions for the renderer to use
    openInApp: (url, role) => ipcRenderer.send('open-in-app', url, role),
    openAutomatedWindow: (data) => ipcRenderer.send('open-automated-window', data),
    notifyRoleChange: (role) => ipcRenderer.send('user-role-changed', role),
    saveSession: () => ipcRenderer.send('save-session'),
    fetchSession: () => ipcRenderer.send('fetch-session'),
    setMenuByRole: (role) => ipcRenderer.send('set-menu-by-role', role),
    
    // Get API configuration
    getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
    getWsUrl: () => ipcRenderer.invoke('get-ws-url'),
    
    // Provide API URLs directly
    apiBaseUrl: 'http://venzell.skplay.net',
    wsUrl: 'ws://venzell.skplay.net:8096',
    
    // Add update-related functions
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    downloadUpdate: (url, version, options = {}) => {
        try {
            console.log('📥 electron.downloadUpdate called with:', { url, version, options });
            
            // Handle undefined/null url
            if (!url) {
                console.error('Invalid URL provided:', url);
                if (typeof window.showNotification === 'function') {
                    window.showNotification('Cannot download update: Invalid URL', 'error');
                }
                ipcRenderer.send('download-error', 'Invalid URL provided');
                return;
            }
            
            // Always send a single object with all parameters 
            if (typeof url === 'object') {
                // If the first parameter is already an object, use it directly
                if (!url.url) {
                    throw new Error('Missing URL in parameters object');
                }
                ipcRenderer.send('download-update', url);
            } else if (typeof url === 'string' && url) {
                // Only proceed if URL is a non-empty string
                // Otherwise, construct an object with the parameters
                ipcRenderer.send('download-update', { 
                    url, 
                    version: version || 'latest', 
                    ...options 
                });
            } else {
                console.error('Invalid parameters for downloadUpdate:', { url, version, options });
                throw new Error('Invalid download URL');
            }
        } catch (error) {
            console.error('Error in downloadUpdate:', error);
            // Forward the error to any listeners
            ipcRenderer.send('download-error', error.message || 'Unknown error in downloadUpdate');
        }
    },
    installUpdate: (filePath) => ipcRenderer.send('install-update', filePath),
    
    // IPC for direct renderer communication
    ipcRenderer: {
        send: (channel, ...args) => {
            const validChannels = [
                'download-update', 
                'install-update', 
                'cancel-update'
            ];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, ...args);
            }
        },
        on: (channel, func) => {
            const validChannels = [
                'download-progress', 
                'download-complete', 
                'download-error'
            ];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender` 
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        },
        once: (channel, func) => {
            const validChannels = [
                'download-progress', 
                'download-complete', 
                'download-error'
            ];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender`
                ipcRenderer.once(channel, (event, ...args) => func(...args));
            }
        },
        removeListener: (channel, func) => {
            const validChannels = [
                'download-progress', 
                'download-complete', 
                'download-error'
            ];
            if (validChannels.includes(channel)) {
                ipcRenderer.removeListener(channel, func);
            }
        }
    },
    
    // Provide a safe version of process for environment variables
    process: {
        env: {
            NODE_ENV: 'production',
            API_BASE_URL: 'http://venzell.skplay.net',
            WS_URL: 'ws://venzell.skplay.net:8096'
        }
    }
});

// Keep electronAPI for backward compatibility
contextBridge.exposeInMainWorld('electronAPI', {
    navigate: (url) => ipcRenderer.send('navigate', url),
    saveSession: () => {
        console.log("🟢 Preload: Save Session button clicked");
        ipcRenderer.send("save-session");
    },
    fetchSession: () => {
        console.log("🟢 Preload: Fetch Session button clicked");
        ipcRenderer.send("fetch-session");
    },
    openLoginWindow: () => ipcRenderer.send('open-login-window'),
    goBack: () => ipcRenderer.send('go-back'),
    goForward: () => ipcRenderer.send('go-forward'),
    refresh: () => ipcRenderer.send('refresh'),
    navigateTo: (url) => ipcRenderer.send('navigate-to', url),
    navigateToPage: (page) => ipcRenderer.send('navigate-to-page', page),
    setMenuByRole: (role) => ipcRenderer.send('set-menu-by-role', role),
    
    // Add update functions to electronAPI as well
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    downloadUpdate: (url, version, options = {}) => {
        try {
            console.log('📥 electronAPI.downloadUpdate called with:', { url, version, options });
            
            // Handle undefined/null url
            if (!url) {
                console.error('Invalid URL provided:', url);
                if (typeof window.showNotification === 'function') {
                    window.showNotification('Cannot download update: Invalid URL', 'error');
                }
                ipcRenderer.send('download-error', 'Invalid URL provided');
                return;
            }
            
            // Always send a single object with all parameters 
            if (typeof url === 'object') {
                // If the first parameter is already an object, use it directly
                if (!url.url) {
                    throw new Error('Missing URL in parameters object');
                }
                ipcRenderer.send('download-update', url);
            } else if (typeof url === 'string' && url) {
                // Only proceed if URL is a non-empty string
                // Otherwise, construct an object with the parameters
                ipcRenderer.send('download-update', { 
                    url, 
                    version: version || 'latest', 
                    ...options 
                });
            } else {
                console.error('Invalid parameters for downloadUpdate:', { url, version, options });
                throw new Error('Invalid download URL');
            }
        } catch (error) {
            console.error('Error in downloadUpdate:', error);
            // Forward the error to any listeners
            ipcRenderer.send('download-error', error.message || 'Unknown error in downloadUpdate');
        }
    },
    installUpdate: (filePath) => ipcRenderer.send('install-update', filePath),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isUpdateAvailable: () => ipcRenderer.invoke('is-update-available'),
    
    // Add progress tracking events
    onUpdateDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, progressData) => {
            callback(progressData);
        });
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('download-complete', (event, data) => {
            callback(data);
        });
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('download-error', (event, error) => {
            callback(error);
        });
    }
});

// Add API_BASE_URL to the exposed window object
contextBridge.exposeInMainWorld('config', {
    API_BASE_URL: process.env.API_BASE_URL || 'http://venzell.skplay.net'
});

// Add localStorage access for role-based UI
contextBridge.exposeInMainWorld('localStorage', {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key)
});

// Update the update-available event handler
ipcRenderer.on('update-available', (event, updateInfo) => {
    console.log('Update available:', updateInfo);
    
    // Create a global function to show update notification
    window.showUpdateNotification = (updateInfo) => {
        // Validate update info
        if (!updateInfo || !updateInfo.latestVersion) {
            console.error('Invalid update info received:', updateInfo);
            return;
        }
        
        // Make sure we have a download URL
        const downloadUrl = updateInfo.url || updateInfo.downloadUrl;
        if (!downloadUrl) {
            console.error('No download URL in update info:', updateInfo);
            return;
        }
        
        // Update the UI elements if they exist
        const updateMessage = document.getElementById('updateMessage');
        if (updateMessage) {
            updateMessage.textContent = `Update v${updateInfo.latestVersion} is available!`;
            updateMessage.style.color = '#2196f3';
            
            // Add update now button if it doesn't exist
            const updateActions = document.querySelector('.update-actions');
            if (updateActions) {
                // Check if update now button already exists
                let updateNowBtn = document.getElementById('updateNowBtn');
                if (!updateNowBtn) {
                    updateNowBtn = document.createElement('button');
                    updateNowBtn.id = 'updateNowBtn';
                    updateNowBtn.className = 'update-btn update-now-btn';
                    updateNowBtn.innerHTML = '<i class="fas fa-download"></i> Update Now';
                    updateNowBtn.addEventListener('click', () => {
                        console.log('Update now button clicked, downloading from:', downloadUrl);
                        // Call the download function with proper parameters
                        if (window.electronAPI && typeof window.electronAPI.downloadUpdate === 'function') {
                            window.electronAPI.downloadUpdate({
                                url: downloadUrl,
                                version: updateInfo.latestVersion
                            });
                        } else if (window.electron && typeof window.electron.downloadUpdate === 'function') {
                            window.electron.downloadUpdate({
                                url: downloadUrl,
                                version: updateInfo.latestVersion
                            });
                        } else {
                            console.error('No download function available');
                        }
                    });
                    updateActions.appendChild(updateNowBtn);
                }
            }
        }
        
        // Use the app's existing notification system
        if (typeof window.showNotification === 'function') {
            const notification = window.showNotification(
                `Update v${updateInfo.latestVersion} is available! Click here to update now.`,
                'update'
            );
            
            // Add click handler to the notification
            if (notification) {
                notification.addEventListener('click', (e) => {
                    // Don't trigger if clicking the close button
                    if (!e.target.closest('.close-notification')) {
                        window.electronAPI.downloadUpdate(updateInfo.url, updateInfo.latestVersion);
                    }
                });
            }
        }
    };
    
    // Show the notification
    window.showUpdateNotification(updateInfo);
});

// Add handler for update download started
ipcRenderer.on('update-download-started', (event, info) => {
    console.log('Update download started:', info);
    
    // Update the UI elements if they exist
    const updateMessage = document.getElementById('updateMessage');
    if (updateMessage) {
        updateMessage.textContent = `Downloading update v${info.version}...`;
        updateMessage.style.color = '#4caf50';
    }
    
    // Show notification
    if (typeof window.showNotification === 'function') {
        window.showNotification(
            `Downloading update v${info.version}. Please install when download completes.`,
            'success'
        );
    }
});

ipcRenderer.on('update-downloaded', () => {
    console.log('Update downloaded, will install on restart');
    
    // Update the UI elements if they exist
    const updateMessage = document.getElementById('updateMessage');
    if (updateMessage) {
        updateMessage.textContent = 'Update downloaded! Restart the app to install.';
        updateMessage.style.color = '#4caf50';
    }
    
    // Show notification
    if (typeof window.showNotification === 'function') {
        window.showNotification(
            'Update downloaded! It will be installed when you restart the application.',
            'success'
        );
    }
});

ipcRenderer.on('update-not-available', () => {
    console.log('No updates available');
    
    // Update the UI elements if they exist
    const updateMessage = document.getElementById('updateMessage');
    if (updateMessage) {
        updateMessage.textContent = 'Your application is up to date';
        updateMessage.style.color = '';
    }
    
    // Re-enable the check updates button if it exists
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
    if (checkUpdatesBtn) {
        checkUpdatesBtn.disabled = false;
        checkUpdatesBtn.innerHTML = '<i class="fas fa-sync"></i> Check for Updates';
    }
});

ipcRenderer.on('update-error', (event, error) => {
    console.error('Update error:', error);
    
    // Update the UI elements if they exist
    const updateMessage = document.getElementById('updateMessage');
    if (updateMessage) {
        updateMessage.textContent = 'Error checking for updates';
        updateMessage.style.color = '#f44336';
    }
    
    // Re-enable the check updates button if it exists
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
    if (checkUpdatesBtn) {
        checkUpdatesBtn.disabled = false;
        checkUpdatesBtn.innerHTML = '<i class="fas fa-sync"></i> Check for Updates';
    }
    
    // Show notification
    if (typeof window.showNotification === 'function') {
        window.showNotification(
            `Update error: ${error}`,
            'error'
        );
    }
});

// Log successful preload
console.log('✅ Preload script loaded successfully');
