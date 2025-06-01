const { app, BrowserWindow, ipcMain, session, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { updateElectronApp, UpdateSourceType } = require('update-electron-app');
const squirrelStartup = require('electron-squirrel-startup');
const config = require('./config.js');

// Handle module loading with error protection
let axios;
let FormData;
try {
    axios = require('axios');
    FormData = require('form-data');
    console.log("✅ Successfully loaded axios and form-data modules");
} catch (error) {
    console.error("❌ Error loading modules:", error.message);
    // Create fallback implementations if modules can't be loaded
    axios = {
        get: async () => { throw new Error("axios not available"); },
        post: async () => { throw new Error("axios not available"); }
    };
    FormData = function() {
        this.append = () => {};
        this.getHeaders = () => { return {}; };
    };
}

// Get the current app version from package.json
const appVersion = app.getVersion();
console.log(`🚀 App version: ${appVersion}`);


let mainWindow;
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36';

// Directory for session data - use app data path to ensure it works on any machine
const sessionDataPath = path.join(app.getPath('userData'), 'session-data');
console.log(`📂 User data directory: ${app.getPath('userData')}`);
console.log(`📂 Session data path: ${sessionDataPath}`);

if (!fs.existsSync(sessionDataPath)) {
    try {
        fs.mkdirSync(sessionDataPath, { recursive: true });
        console.log(`✅ Created session data directory: ${sessionDataPath}`);
    } catch (error) {
        console.error(`❌ Error creating session data directory: ${error.message}`);
    }
}

// Replace the API_BASE_URL to use http instead of https
const API_BASE_URL = (process.env.API_BASE_URL || config.apiBaseUrl || 'http://venzell.skplay.net').replace(':8095', '');
const WS_URL = process.env.WS_URL || config.wsUrl || 'ws://venzell.skplay.net:8096';

// Log the API URLs for debugging
console.log(`🌐 API URL: ${API_BASE_URL}`);
console.log(`🌐 WebSocket URL: ${WS_URL}`);

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (error) {
        console.error("Invalid URL:", url);
        return null;
    }
}

let windows = []; // Store all opened windows
function createWindow(url = null, role = null, skipMenuSet = false) {
    console.log(`Creating new window with URL: ${url}, Role: ${role}, Skip Menu: ${skipMenuSet}`);
    
    let newWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'assets', '6.ico'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
    });
    windows.push(newWindow); // Add the new window to the arrays
    
    // Only set default menu if not skipping menu setting
    if (!skipMenuSet) {
        // IMPORTANT: Set a default menu first to ensure there's always a menu
        // This fixes the issue of no menu bar in secondary windows
        const defaultMenu = Menu.buildFromTemplate([
            {
                label: 'File',
                submenu: [{ role: 'quit' }],
            },
            {
                label: 'Premium',
                submenu: [
                    {
                        label: 'Reload',
                        click: () => fetchSession(),
                    }
                ],
            },
            // Add update menu item if update is available
            ...(updateAvailable ? [{
                label: '🔄 Update Available',
                submenu: [
                    {
                        label: `Download v${latestVersion}`,
                        click: () => {
                            require('electron').shell.openExternal(updateUrl);
                        }
                    }
                ]
            }] : [])
        ]);
        newWindow.setMenu(defaultMenu);
        
        // Now set the role-specific menu if we have a role
        if (role === 'admin') {
            console.log('Setting admin menu for new window');
            setAdminMenu(newWindow);
        } else if (role === 'user') {
            console.log('Setting user menu for new window');
            setUserMenu(newWindow);
        }
    }

    if (url) {
        newWindow.loadURL(url);
        newWindow.setTitle(`Loading: ${url}`);
    } else {
        newWindow.loadFile(path.join(__dirname, 'login-popup.html'));
        newWindow.setTitle('Login');
    }

    // Track when content finishes loading to set appropriate menu
    newWindow.webContents.on("did-finish-load", () => {
        const currentURL = newWindow.webContents.getURL();
        console.log(`✅ Window loaded: ${currentURL}`);

        const domain = getDomain(currentURL);
        if (domain) {
            newWindow.setTitle(domain);
        }
        
        // Check if we need to determine the role based on the loaded page
        if (!role) {
            newWindow.webContents.executeJavaScript('localStorage.getItem("user_role")')
                .then(fetchedRole => {
                    console.log(`Detected role from localStorage: ${fetchedRole}`);
                    
                    if (fetchedRole === 'admin') {
                        console.log('Setting admin menu based on localStorage');
                        setAdminMenu(newWindow);
                    } else if (fetchedRole === 'user') {
                        console.log('Setting user menu based on localStorage');
                        setUserMenu(newWindow);
                    } else {
                        // Handle case where role is not found in localStorage
                        // If no role in localStorage, use URL to determine menu
                        if (currentURL.includes('user.html')) {
                            console.log('Setting user menu based on URL');
                            setUserMenu(newWindow);
                        } else if (currentURL.includes('admin.html')) {
                            console.log('Setting admin menu based on URL');
                            setAdminMenu(newWindow);
                        } else if (currentURL.includes('login') || currentURL.includes('login-popup.html')) {
                            console.log('Setting login menu based on URL');
                            // Create a basic login menu
                            const loginMenu = Menu.buildFromTemplate([
                                {
                                    label: 'File',
                                    submenu: [
                                        { role: 'reload' }, 
                                        { type: 'separator' },
                                        { role: 'quit' }
                                    ],
                                },
                                {
                                    label: 'View',
                                    submenu: [
                                        { role: 'toggleDevTools' },
                                        { role: 'togglefullscreen' }
                                    ]
                                }
                            ]);
                            newWindow.setMenu(loginMenu);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error getting role from localStorage:', error);
                    // Fallback to URL-based menu setting
                    if (currentURL.includes('user.html')) {
                        setUserMenu(newWindow);
                    } else if (currentURL.includes('admin.html')) {
                        setAdminMenu(newWindow);
                    } else if (currentURL.includes('login') || currentURL.includes('login-popup.html')) {
                        // Create a basic login menu
                        const loginMenu = Menu.buildFromTemplate([
                            {
                                label: 'File',
                                submenu: [
                                    { role: 'reload' }, 
                                    { type: 'separator' },
                                    { role: 'quit' }
                                ],
                            }
                        ]);
                        newWindow.setMenu(loginMenu);
                    }
                });
        }
    });

    // Debug: Log window creation
    console.log(`Window created: ID ${newWindow.id}`);
    return newWindow;
}



// ** Function to Save the Session and Upload to Server **
function saveSession() {
    const focusedWindow = BrowserWindow.getFocusedWindow();

    if (!focusedWindow) {
        console.error("❌ No focused window found. Cannot save session.");
        return;
    }

    console.log(`🟢 Saving session for window: ${focusedWindow.getTitle()}`);

    focusedWindow.webContents.executeJavaScript('document.readyState')
        .then((readyState) => {
            if (readyState !== "complete") {
                console.warn("⚠️ Page still loading. Retrying in 1 second...");
                setTimeout(saveSession, 1000);
                return;
            }

            const url = focusedWindow.webContents.getURL();
            console.log(`🔹 Current URL: ${url}`);

            const domain = getDomain(url);
            if (!domain) {
                console.error("❌ Invalid domain, cannot save session.");
                return;
            }

            console.log(`💾 Saving session for domain: ${domain}...`);
            const sessionFileName = `${domain}-session.json`;
            const sessionFilePath = path.join(sessionDataPath, sessionFileName);
            const sessionData = { cookies: [], localStorage: {}, sessionStorage: {} };

            // Get ALL cookies first, then filter for relevant ones
            session.defaultSession.cookies.get({})
                .then((allCookies) => {
                    // Extract the base domain (e.g., primevideo.com from www.primevideo.com)
                    const domainParts = domain.split('.');
                    const baseDomain = domainParts.length >= 2 
                        ? `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}` 
                        : domain;
                    
                    console.log(`🔍 Domain: ${domain}, Base domain: ${baseDomain}`);
                    console.log(`🍪 Found ${allCookies.length} total cookies in browser`);
                    
                    // Filter cookies relevant to this domain
                    const relevantCookies = allCookies.filter(cookie => {
                        // Handle cookies with no domain (typically session cookies)
                        // Include them if we're on the same site
                        if (!cookie.domain) {
                            // Since these have no domain, they're typically for the exact current domain
                            // We'll include them to be safe - we can't reliably know which ones are relevant
                            console.log(`✓ No domain cookie (including): ${cookie.name}`);
                            return true;
                        }
                        
                        const cookieDomainWithoutDot = cookie.domain.replace(/^\./, '');
                        
                        // Match exact domain or with leading dot (www.primevideo.com or .www.primevideo.com)
                        if (cookieDomainWithoutDot === domain) {
                            console.log(`✓ Exact domain match: ${cookie.name} from ${cookie.domain}`);
                            return true;
                        }
                        
                        // Match base domain or with leading dot (primevideo.com or .primevideo.com)
                        if (cookieDomainWithoutDot === baseDomain) {
                            console.log(`✓ Base domain match: ${cookie.name} from ${cookie.domain}`);
                            return true;
                        }
                        
                        // Check if domain is a subdomain of cookie domain
                        // Example: domain = www.primevideo.com, cookie.domain = .primevideo.com
                        if (domain.endsWith(`.${cookieDomainWithoutDot}`) || domain.endsWith(cookieDomainWithoutDot)) {
                            console.log(`✓ Domain is subdomain: ${cookie.name} from ${cookie.domain}`);
                            return true;
                        }
                        
                        // Check if cookie domain is a subdomain of the base domain
                        // Example: domain = primevideo.com, cookie.domain = www.primevideo.com
                        if (cookieDomainWithoutDot.endsWith(`.${baseDomain}`) || cookieDomainWithoutDot.endsWith(baseDomain)) {
                            console.log(`✓ Cookie domain is subdomain: ${cookie.name} from ${cookie.domain}`);
                            return true;
                        }
                        
                        return false;
                    });
                    
                    sessionData.cookies = relevantCookies;
                    console.log(`✅ Saved ${relevantCookies.length} cookies for ${domain}.`);
                    
                    // Try to get localStorage, but don't fail if it doesn't work
                    return focusedWindow.webContents.executeJavaScript('try { JSON.stringify(localStorage) } catch(e) { "{}" }')
                        .catch(err => "{}"); // Return empty object if script fails
                })
                .then((localStorage) => {
                    try {
                        sessionData.localStorage = JSON.parse(localStorage);
                        console.log("✅ Saved localStorage");
                    } catch (e) {
                        console.warn("⚠️ Could not parse localStorage, saving empty object");
                        sessionData.localStorage = {};
                    }
                    
                    // Try to get sessionStorage, but don't fail if it doesn't work
                    return focusedWindow.webContents.executeJavaScript('try { JSON.stringify(sessionStorage) } catch(e) { "{}" }')
                        .catch(err => "{}"); // Return empty object if script fails
                })
                .then((sessionStorage) => {
                    try {
                        sessionData.sessionStorage = JSON.parse(sessionStorage);
                        console.log("✅ Saved sessionStorage");
                    } catch (e) {
                        console.warn("⚠️ Could not parse sessionStorage, saving empty object");
                        sessionData.sessionStorage = {};
                    }
                    
                    // Save the session file locally first
                    fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
                    console.log(`💾 Session data saved locally at: ${sessionFilePath}`);

                    // Simple direct HTTP upload using just Node.js http module - no external dependencies
                    const http = require('http');
                    const https = require('https');
                    const url = require('url');
                    
                    // Make sure we're using a URL without port 8095
                    const uploadUrl = `${API_BASE_URL}/api/sessions/upload`;
                    console.log(`🌐 Using upload URL without port 8095: ${uploadUrl}`);
                    
                    // Read the file content
                    const fileContent = fs.readFileSync(sessionFilePath);
                    const boundary = '--------------------------' + Date.now().toString(16);
                    
                    // Prepare multipart form data manually
                    let payload = '';
                    payload += '--' + boundary + '\r\n';
                    payload += 'Content-Disposition: form-data; name="sessionFile"; filename="' + sessionFileName + '"\r\n';
                    payload += 'Content-Type: application/json\r\n\r\n';
                    payload += fileContent + '\r\n';
                    payload += '--' + boundary + '--\r\n';
                    
                    // Setup request options
                    const parsedUrl = url.parse(uploadUrl);
                    const options = {
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                        path: parsedUrl.path,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'multipart/form-data; boundary=' + boundary,
                            'Content-Length': Buffer.byteLength(payload)
                        }
                    };
                    
                    // Make the HTTP request
                    console.log(`🌐 Uploading session to server: ${parsedUrl.hostname}:${options.port}${parsedUrl.path}`);
                    
                    const lib = parsedUrl.protocol === 'https:' ? https : http;
                    const req = lib.request(options, (res) => {
                        console.log(`🔹 Server status: ${res.statusCode}`);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log(`✅ Session uploaded successfully!`);
                            showSessionSuccessMessage(focusedWindow, "Session saved successfully!");
                        } else {
                            console.error(`❌ Failed to upload session: HTTP ${res.statusCode}`);
                            showSessionErrorMessage(focusedWindow, "Save session", `Server error: ${res.statusCode}`);
                        }
                        
                        // Get response data
                        const responseData = [];
                        res.on('data', chunk => {
                            responseData.push(chunk);
                        });
                        
                        res.on('end', () => {
                            try {
                                const response = JSON.parse(Buffer.concat(responseData).toString());
                                console.log(`📊 Server response: ${JSON.stringify(response)}`);
                            } catch (e) {
                                console.log(`📊 Server response: ${Buffer.concat(responseData).toString()}`);
                            }
                        });
                    });
                    
                    // Handle errors
                    req.on('error', (error) => {
                        console.error(`❌ Error uploading session: ${error.message}`);
                        showSessionErrorMessage(focusedWindow, "Save session", `Network error: ${error.message}`);
                    });
                    
                    // Send the request data
                    req.write(payload);
                    req.end();
                })
                .catch((error) => {
                    console.error("❌ Error saving session:", error);
                    showSessionErrorMessage(focusedWindow, "Save session", `Error: ${error.message}`);
                });
        })
        .catch((error) => {
            console.error("❌ Error checking document.readyState:", error);
            showSessionErrorMessage(focusedWindow, "Save session", `Error: ${error.message}`);
        });
}


// ** Function to Fetch Session from Server API and Restore **
function fetchSession() {
    const focusedWindow = BrowserWindow.getFocusedWindow();

    if (!focusedWindow) {
        console.error("❌ No focused window found. Cannot fetch session.");
        return;
    }

    console.log(`🟢 Fetching session for window: ${focusedWindow.getTitle()}`);

    const url = focusedWindow.webContents.getURL();
    console.log(`🔹 Current URL: ${url}`);

    const domain = getDomain(url);
    if (!domain) {
        console.error("❌ Invalid domain, cannot fetch session.");
        showSessionErrorMessage(focusedWindow, "Fetch session", "Invalid domain name");
        return;
    }

    // Ensure the session data directory exists before proceeding
    if (!fs.existsSync(sessionDataPath)) {
        try {
            fs.mkdirSync(sessionDataPath, { recursive: true });
            console.log(`✅ Created session data directory: ${sessionDataPath}`);
        } catch (error) {
            console.error(`❌ Error creating session data directory: ${error.message}`);
            showSessionErrorMessage(focusedWindow, "Fetch session", `Could not create directory: ${error.message}`);
            return;
        }
    }

    const sessionFileName = `${domain}-session.json`;
    const sessionFilePath = path.join(sessionDataPath, sessionFileName);

    console.log(`🔹 Fetching session for: ${domain} (File: ${sessionFileName})...`);
    console.log(`💾 Local session path: ${sessionFilePath}`);

    // Simple direct HTTP download using just Node.js http module - no external dependencies
    const http = require('http');
    const https = require('https');
    const url_lib = require('url');
    
    // Make sure we're using a URL without port 8095
    const downloadUrl = `${API_BASE_URL}/api/sessions/download/${sessionFileName}`;
    console.log(`🌐 Using download URL without port 8095: ${downloadUrl}`);
    
    // Setup request options
    const parsedUrl = url_lib.parse(downloadUrl);
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET'
    };
    
    // Make the HTTP request
    console.log(`🌐 Downloading session from server: ${parsedUrl.hostname}:${options.port}${parsedUrl.path}`);
    
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
        console.log(`🔹 Server status: ${res.statusCode}`);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
            // Get response data
            const responseData = [];
            res.on('data', chunk => {
                responseData.push(chunk);
            });
            
            res.on('end', () => {
                try {
                    // Parse the response as JSON
                    const sessionData = JSON.parse(Buffer.concat(responseData).toString());
                    
                    // Save the session data locally
                    fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
                    console.log(`💾 Session data saved locally at: ${sessionFilePath}`);
                    console.log(`✅ Session downloaded successfully!`);
                    
                    // Restore the session data
                    restoreSessionData(sessionData, domain, focusedWindow);
                } catch (e) {
                    console.error(`❌ Error parsing session data: ${e.message}`);
                    showSessionErrorMessage(focusedWindow, "Fetch session", `Error parsing data: ${e.message}`);
                }
            });
        } else if (res.statusCode === 404) {
            console.error(`❌ Session file not found on server`);
            showSessionErrorMessage(focusedWindow, "Fetch session", "No session found for this domain");
            
            // Try to load from local file as fallback
            tryLocalSessionFile(domain, sessionFilePath, focusedWindow);
        } else {
            console.error(`❌ Failed to download session: HTTP ${res.statusCode}`);
            showSessionErrorMessage(focusedWindow, "Fetch session", `Server error: ${res.statusCode}`);
            
            // Try to load from local file as fallback
            tryLocalSessionFile(domain, sessionFilePath, focusedWindow);
        }
    });
    
    // Handle errors
    req.on('error', (error) => {
        console.error(`❌ Error downloading session: ${error.message}`);
        showSessionErrorMessage(focusedWindow, "Fetch session", `Network error: ${error.message}`);
        
        // Try to load from local file as fallback
        tryLocalSessionFile(domain, sessionFilePath, focusedWindow);
    });
    
    // Send the request
    req.end();
}

// Try to load session from local file as fallback
function tryLocalSessionFile(domain, sessionFilePath, focusedWindow) {
    console.log(`⚠️ Trying to use local session file as fallback...`);
    console.log(`💾 Looking for local session file at: ${sessionFilePath}`);
    
    if (fs.existsSync(sessionFilePath)) {
        try {
            const sessionData = JSON.parse(fs.readFileSync(sessionFilePath));
            console.log(`✅ Found local session file, attempting to restore...`);
            restoreSessionData(sessionData, domain, focusedWindow);
        } catch (localError) {
            console.error(`❌ Error using local session file:`, localError);
            showSessionErrorMessage(focusedWindow, "Fetch session", `Error reading local file: ${localError.message}`);
        }
    } else {
        console.error(`❌ No local session file found at: ${sessionFilePath}`);
        showSessionErrorMessage(focusedWindow, "Fetch session", "No saved session found");
    }
}

// ** Menu Creation **
function createMenu() {
    // Create a minimal menu for login/logout pages
    const loginTemplate = [
        {
            label: 'File',
            submenu: [
                { role: 'reload' }, 
                { type: 'separator' },
                { role: 'quit' }
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'toggleDevTools' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        const aboutWindow = new BrowserWindow({
                            width: 400,
                            height: 300,
                            resizable: false,
                            minimizable: false,
                            maximizable: false,
                            parent: BrowserWindow.getFocusedWindow(),
                            modal: true
                        });
                        aboutWindow.loadFile('login-popup.html');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(loginTemplate);
    Menu.setApplicationMenu(menu);
}


// Create menu for admin windows
function setAdminMenu(window) {
    const adminTemplate = [
        {
            label: 'File',
            submenu: [{ role: 'quit' }],
        },
        {
            label: 'Premium',
            submenu: [
                {
                    label: 'Save Session',
                    click: () => {
                        console.log("🟡 Menu Clicked: Save Session");
                        saveSession();
                    },
                },
                {
                    label: 'Fetch Session',
                    click: () => {
                        console.log("🟡 Menu Clicked: Fetch Session");
                        fetchSession();
                    },
                },
            ],
        },
        {
            label: 'Developer',
            submenu: [
                { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
                { role: 'reload', label: 'Reload Window' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(adminTemplate);
    window.setMenu(menu);
}

// Create menu for user windows
function setUserMenu(window) {
    const userTemplate = [
        {
            label: 'File',
            submenu: [{ role: 'quit' }],
        },
        {
            label: 'Premium',
            submenu: [
                {
                    label: 'Reload',
                    click: () => {
                        console.log("🟡 Menu Clicked: Fetch Session");
                        fetchSession();
                    },
                },
            ],
        },
        {
            label: 'Developer',
            submenu: [
                { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
                { role: 'reload', label: 'Reload Window' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(userTemplate);
    window.setMenu(menu);
}

// ** App Lifecycle **
app.whenReady().then(() => {
    // Setup auto updater
    updateElectronApp({
        updateSource: {
            type: UpdateSourceType.StaticStorage,
            baseUrl: `${config.updateServerUrl}/updates/${process.platform}/${process.arch}`
        },
        logger: {
            log: (...args) => console.log('[Updater]', ...args),
            error: (...args) => console.error('[Updater]', ...args)
        },
        updateInterval: '30 minutes',
        notifyUser: true
    });

    // Configure session to bypass certificate errors 
    // This is a workaround for SSL certificate issues
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        callback({ requestHeaders: { ...details.requestHeaders } });
    });

    // For handling SSL validation errors
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        // Verify the URL is from your domain to prevent security risks
        if (url.includes('venzell.skplay.net')) {
            event.preventDefault();
            callback(true); // Trust the certificate
            console.log(`🔒 Bypassing certificate validation for: ${url}`);
        } else {
            callback(false); // Don't trust other certificates
        }
    });

    // GLOBAL BEHAVIOR: Set default behavior for all new windows to copy parent menu
    app.on('browser-window-created', (event, newWindow) => {
        // Find the parent window
        const parentWindow = BrowserWindow.getFocusedWindow();
        if (parentWindow) {
            // Check if parent window has menu methods available
            if (parentWindow.getMenu && typeof parentWindow.getMenu === 'function') {
                // Copy menu from parent window
                const parentMenu = parentWindow.getMenu();
                if (parentMenu) {
                    console.log(`🔄 (Global handler) Copying menu from parent window ID: ${parentWindow.id} to new window ID: ${newWindow.id}`);
                    newWindow.setMenu(parentMenu);
                }
            } else {
                console.log('Parent window does not have getMenu method available');
                // Try to determine appropriate menu based on parent URL
                if (parentWindow.webContents && parentWindow.webContents.getURL) {
                    const parentURL = parentWindow.webContents.getURL();
                    if (parentURL.includes('admin.html')) {
                        setAdminMenu(newWindow);
                    } else if (parentURL.includes('user.html')) {
                        setUserMenu(newWindow);
                    }
                }
            }
        }
    });

    // Initialize with default menu (will be updated by renderer process)
    createMenu();
    
    // Create the main window (menu will be set by menu-init.js in renderer)
    createWindow();
    
    // Add handler for navigation to update menus
    app.on('web-contents-created', (event, contents) => {
        console.log('🌱 New web contents created');
        
        // Handle new windows created by target="_blank" links or window.open()
        contents.on('new-window', (event, url, frameName, disposition, options) => {
            console.log(`🔄 New window requested via ${disposition}: ${url}`);
            
            // Get the source window
            const sourceWindow = BrowserWindow.fromWebContents(contents);
            if (!sourceWindow) {
                console.log('❌ No source window found for new-window event');
                return;
            }
            
            // Prevent default behavior
            event.preventDefault();
            
            // Improved logging
            console.log(`🔗 Opening URL from ${disposition}: ${url}`);
            console.log(`🧩 Source window info - ID: ${sourceWindow.id}, Title: "${sourceWindow.getTitle()}"`);
            console.log(`🧩 Source window URL: ${sourceWindow.webContents.getURL()}`);
            
            // Try to determine role from source window before creating the window
            sourceWindow.webContents.executeJavaScript('localStorage.getItem("user_role")')
                .then(role => {
                    console.log(`📋 Source window role from localStorage: "${role || 'none'}"`);
                    
                    // Continue with window creation after getting the role
                    createWindowFromLink(url, sourceWindow, role);
                })
                .catch(error => {
                    console.error('❌ Error getting role from localStorage:', error);
                    // Fall back to creating window without role information
                    createWindowFromLink(url, sourceWindow, null);
                });
        });
        
        // Function to create a window from a link click
        function createWindowFromLink(url, sourceWindow, role) {
            // Get source window's dimensions
            const [width, height] = sourceWindow.getSize();
            
            // Create new window
            const newWindow = new BrowserWindow({
                width,
                height,
                icon: path.join(__dirname, 'assets', '6.ico'),
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    webSecurity: false,
                    preload: path.join(__dirname, 'preload.js')
                }
            });
            
            // Track window
            windows.push(newWindow);
            
            // Apply role-based menu if role was determined
            if (role) {
                console.log(`🔑 Applying menu based on role: ${role}`);
                applyRoleMenu(role, newWindow);
            } else {
                // Try to copy parent menu
                if (sourceWindow.getMenu && typeof sourceWindow.getMenu === 'function') {                
                    // Get parent menu directly from source window
                    const parentMenu = sourceWindow.getMenu();
                    if (parentMenu) {
                        console.log(`✅ Copying menu from parent window ID: ${sourceWindow.id} to new window ID: ${newWindow.id}`);
                        newWindow.setMenu(parentMenu);
                    } else {
                        fallbackToRoleBasedMenu();
                    }
                } else {
                    console.log('❌ getMenu method not available on parent window');
                    fallbackToRoleBasedMenu();
                }
            }
            
            // Fallback function to determine menu based on role or URL
            function fallbackToRoleBasedMenu() {
                // Fallback based on source window's URL
                console.log('❌ Parent window has no menu or unable to access it. Using parent URL to determine appropriate menu.');
                
                // Try getting source window URL
                const parentURL = sourceWindow.webContents.getURL();
                if (parentURL.includes('admin.html')) {
                    console.log('Parent URL suggests admin role');
                    setAdminMenu(newWindow);
                } else if (parentURL.includes('user.html')) {
                    console.log('Parent URL suggests user role');
                    setUserMenu(newWindow);
                } else {
                    // Set a default menu
                    console.log('Creating default menu - no role detected');
                    const defaultMenu = Menu.buildFromTemplate([
                        {
                            label: 'File',
                            submenu: [{ role: 'quit' }],
                        },
                        {
                            label: 'Premium',
                            submenu: [
                                { label: 'Reload', click: () => fetchSession() }
                            ]
                        }
                    ]);
                    newWindow.setMenu(defaultMenu);
                }
            }
            
            // Load URL
            newWindow.loadURL(url);
            newWindow.setTitle(`Loading: ${url}`);
            
            // Debug info
            console.log(`New window created with ID: ${newWindow.id}`);
        }
        
        // Handle navigation within a window
        contents.on('will-navigate', (event, url) => {
            console.log(`🔄 Navigation detected to: ${url}`);
            
            // Get the window that's navigating
            const navigatingWindow = BrowserWindow.fromWebContents(contents);
            if (!navigatingWindow) return;
            
            // Check if the menu needs to be updated
            contents.executeJavaScript('localStorage.getItem("user_role")')
                .then(role => {
                    console.log(`Got role during navigation: ${role}`);
                    
                    // Update menu based on both role and URL
                    if (role === 'admin') {
                        setAdminMenu(navigatingWindow);
                    } else if (role === 'user') {
                        setUserMenu(navigatingWindow);
                    } else {
                        // Fallback to URL-based menu if no role
                        if (url.includes('user.html')) {
                            setUserMenu(navigatingWindow);
                        } else if (url.includes('admin.html')) {
                            setAdminMenu(navigatingWindow);
                        } else if (url.includes('login-popup.html')) {
                            // For login page, create a basic menu
                            const loginMenu = Menu.buildFromTemplate([
                                {
                                    label: 'File',
                                    submenu: [
                                        { role: 'reload' }, 
                                        { type: 'separator' },
                                        { role: 'quit' }
                                    ],
                                }
                            ]);
                            navigatingWindow.setMenu(loginMenu);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error getting role during navigation:', error);
                    
                    // Fallback to URL-based menu
                    if (url.includes('user.html')) {
                        setUserMenu(navigatingWindow);
                    } else if (url.includes('admin.html')) {
                        setAdminMenu(navigatingWindow);
                    } else if (url.includes('login-popup.html')) {
                        // For login page, create a basic menu
                        const loginMenu = Menu.buildFromTemplate([
                            {
                                label: 'File',
                                submenu: [
                                    { role: 'reload' }, 
                                    { type: 'separator' },
                                    { role: 'quit' }
                                ],
                            }
                        ]);
                        navigatingWindow.setMenu(loginMenu);
                    }
                });
        });
        
        // Also handle renderer-initiated page navigations
        contents.on('did-navigate', (event, url) => {
            console.log(`🔄 Did Navigate: ${url}`);
            
            // Get the window that navigated
            const navigatedWindow = BrowserWindow.fromWebContents(contents);
            if (!navigatedWindow) return;
            
            // Ensure menu is set after navigation completes
            contents.executeJavaScript('localStorage.getItem("user_role")')
                .then(role => {
                    console.log(`Got role after navigation: ${role}`);
                    
                    if (role === 'admin') {
                        setAdminMenu(navigatedWindow);
                    } else if (role === 'user') {
                        setUserMenu(navigatedWindow);
                    } else {
                        // Fallback to URL-based menu
                        if (url.includes('user.html')) {
                            setUserMenu(navigatedWindow);
                        } else if (url.includes('admin.html')) {
                            setAdminMenu(navigatedWindow);
                        } else if (url.includes('login-popup.html')) {
                            // Create a basic login menu
                            const loginMenu = Menu.buildFromTemplate([
                                {
                                    label: 'File',
                                    submenu: [
                                        { role: 'reload' }, 
                                        { type: 'separator' },
                                        { role: 'quit' }
                                    ],
                                }
                            ]);
                            navigatedWindow.setMenu(loginMenu);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error getting role after navigation:', error);
                });
        });
    });
    
    // Handle window activation
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    
    // Listen for window-to-window communication about role changes
    ipcMain.on('user-role-changed', (event, role) => {
        console.log(`🔄 Role change detected: ${role}`);
        updateAllWindowMenus(role);
    });

    // Add these IPC handlers
    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });
    
    ipcMain.handle('is-update-available', () => {
        return updateAvailable;
    });
});

// ** IPC Events **

ipcMain.on("open-in-app", (event, url, directRole) => {
    console.log(`🌐 Opening new Electron window for: ${url}, Direct Role: ${directRole}`);
    
    // Find the source window
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow) {
        console.log('No source window found, creating window with default menu');
        createWindow(url, directRole);
        return;
    }
    
    console.log(`Opening URL: ${url} from source window ID: ${sourceWindow.id}`);
    
    // Get source window's dimensions
    const [width, height] = sourceWindow.getSize();
    
    // Create new window
    const newWindow = new BrowserWindow({
        width,
        height,
        icon: path.join(__dirname, 'assets', '6.ico'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    
    // Track window
    windows.push(newWindow);
    
    // Now try to set the menu based on available information
    if (directRole) {
        // Use direct role if provided
        if (!applyRoleMenu(directRole, newWindow)) {
            // If direct role didn't work, try URL
            if (!applyUrlMenu(url, newWindow)) {
                // Try to get role from source window's localStorage
                sourceWindow.webContents.executeJavaScript('localStorage.getItem("user_role")')
                    .then(role => {
                        if (role && !applyRoleMenu(role, newWindow)) {
                            // If localStorage role didn't work, use default
                            applyDefaultMenu(newWindow);
                        }
                    })
                    .catch(error => {
                        console.error('Error getting role from localStorage:', error);
                        applyDefaultMenu(newWindow);
                    });
            }
        }
    } else {
        // No direct role provided, try URL
        if (!applyUrlMenu(url, newWindow)) {
            // Try to get role from source window's localStorage
            sourceWindow.webContents.executeJavaScript('localStorage.getItem("user_role")')
                .then(role => {
                    if (role && !applyRoleMenu(role, newWindow)) {
                        // If localStorage role didn't work, use default
                        applyDefaultMenu(newWindow);
                    }
                })
                .catch(error => {
                    console.error('Error getting role from localStorage:', error);
                    applyDefaultMenu(newWindow);
                });
        }
    }
    
    // Load URL
    newWindow.loadURL(url);
    newWindow.setTitle(`Loading: ${url}`);
    
    // Debug info
    console.log(`New window created with ID: ${newWindow.id}`);
});

// Helper functions for role-based menu application
function applyRoleMenu(role, window) {
    console.log(`Trying to apply menu based on role: ${role}`);
    if (role === 'admin') {
        setAdminMenu(window);
        return true;
    } else if (role === 'user') {
        setUserMenu(window);
        return true;
    }
    return false;
}

function applyUrlMenu(url, window) {
    console.log(`Trying to apply menu based on URL: ${url}`);
    if (url.includes('admin.html')) {
        setAdminMenu(window);
        return true;
    } else if (url.includes('user.html')) {
        setUserMenu(window);
        return true;
    } else if (url.includes('login-popup.html')) {
        // Create a basic login menu
        const loginMenu = Menu.buildFromTemplate([
            {
                label: 'File',
                submenu: [
                    { role: 'reload' }, 
                    { type: 'separator' },
                    { role: 'quit' }
                ],
            }
        ]);
        window.setMenu(loginMenu);
        return true;
    }
    return false;
}

function applyDefaultMenu(window) {
    console.log('Applying default menu');
    const defaultMenu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [{ role: 'quit' }],
        },
        {
            label: 'Premium',
            submenu: [
                { label: 'Reload', click: () => fetchSession() }
            ]
        }
    ]);
    window.setMenu(defaultMenu);
}

ipcMain.on("save-session", () => {
    console.log("🟡 Received Save Session event in main.js");
    saveSession();
});

ipcMain.on("fetch-session", () => {
    console.log("🟡 Received Fetch Session event in main.js");
    fetchSession();
});

// Handle role-based menu setting
ipcMain.on("set-menu-by-role", (event, role) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    
    console.log(`🔄 Setting menu for role: ${role}`);
    if (role === 'admin') {
        setAdminMenu(window);
    } else {
        setUserMenu(window);
    }
});

// ** Window Close Event **
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Example of using API_BASE_URL in an API call
async function makeApiCall(endpoint, method = 'GET', data = null) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`Making ${method} request to: ${url}`);
    
    // Configure fetch options to ignore SSL certificate errors
    const agent = new https.Agent({
      rejectUnauthorized: false // Ignore certificate verification
    });
    
    // Setup fetch options
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      agent: agent // Node.js specific option for ignoring SSL errors
    };
    
    // Add body data for non-GET requests
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    
    // Check if the response is successful
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}, Text: ${response.statusText}`);
    }
    
    // Parse and return response data
    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error.message);
    throw error;
  }
}

// Register IPC handlers for API and WebSocket URLs
ipcMain.handle('get-api-base-url', () => {
    return API_BASE_URL;
});

ipcMain.handle('get-ws-url', () => {
    return WS_URL;
});

// Update menus for all windows based on role
function updateAllWindowMenus(role) {
    console.log(`🔄 Updating menus for all windows based on role: ${role}`);
    
    // Loop through all windows and update menus
    BrowserWindow.getAllWindows().forEach(window => {
        if (role === 'admin') {
            setAdminMenu(window);
        } else if (role === 'user') {
            setUserMenu(window);
        } else if (role === null || role === 'logout') {
            // For logout, create a basic menu instead of using setLoginMenu
            const basicMenu = Menu.buildFromTemplate([
                {
                    label: 'File',
                    submenu: [
                        { role: 'reload' }, 
                        { type: 'separator' },
                        { role: 'quit' }
                    ],
                }
            ]);
            window.setMenu(basicMenu);
        }
    });
}

// Login example
async function login(username, password) {
    try {
        const result = await api.login(username, password);
        if (result.status === 'success') {
            // Connect WebSocket after successful login
            api.connectWebSocket(result.sessionId, {
                onMessage: (data) => {
                    console.log('Received:', data);
                },
                onForceLogout: () => {
                    // Handle force logout
                    window.location.href = '/login';
                }
            });
        }
        return result;
    } catch (error) {
        console.error('Login failed:', error);
        throw error;
    }
}

// Service management example
async function getServices() {
    try {
        const services = await api.getServices();
        return services;
    } catch (error) {
        console.error('Failed to fetch services:', error);
        throw error;
    }
}

// Add fallback HTTP functions using Node.js built-ins
function httpGet(url, options = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? require('https') : require('http');
        const req = lib.get(url, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Status Code: ${res.statusCode}`));
            }
            
            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                let responseData;
                const rawData = Buffer.concat(data).toString();
                try {
                    responseData = JSON.parse(rawData);
                } catch (e) {
                    responseData = rawData;
                }
                resolve({ data: responseData, status: res.statusCode });
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

function httpPost(url, data, options = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? require('https') : require('http');
        const urlObj = new URL(url);
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (url.startsWith('https') ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };
        
        const req = lib.request(reqOptions, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Status Code: ${res.statusCode}`));
            }
            
            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                let responseData;
                const rawData = Buffer.concat(data).toString();
                try {
                    responseData = JSON.parse(rawData);
                } catch (e) {
                    responseData = rawData;
                }
                resolve({ data: responseData, status: res.statusCode });
            });
        });
        
        req.on('error', reject);
        
        if (data) {
            const postData = typeof data === 'string' ? data : JSON.stringify(data);
            req.write(postData);
        }
        
        req.end();
    });
}

// Check if the API server is reachable
function checkApiConnection() {
    console.log(`🔄 Checking connection to API server: ${API_BASE_URL}`);
    
    return new Promise((resolve) => {
        const lib = API_BASE_URL.startsWith('https') ? require('https') : require('http');
        const request = lib.get(`${API_BASE_URL}/test-connection`, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`✅ API server is reachable: ${API_BASE_URL}`);
                resolve(true);
            } else {
                console.error(`❌ API server returned error: ${res.statusCode}`);
                resolve(false);
            }
        });
        
        request.on('error', (error) => {
            console.error(`❌ Cannot connect to API server: ${error.message}`);
            resolve(false);
        });
        
        // Set a timeout
        request.setTimeout(5000, () => {
            request.abort();
            console.error(`❌ API server connection timed out`);
            resolve(false);
        });
    });
}

// Show a message to the user when session operations fail
function showSessionErrorMessage(window, operation, error) {
    if (!window) return;
    
    const errorMessage = `
        try {
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
            container.style.backgroundColor = '#ff5252';
            container.style.color = 'white';
            container.style.padding = '10px 20px';
            container.style.borderRadius = '5px';
            container.style.zIndex = '9999';
            container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            container.textContent = "⚠️ ${operation} failed: ${error || 'Cannot connect to server'}";
            
            document.body.appendChild(container);
            
            setTimeout(() => {
                container.style.opacity = '0';
                container.style.transition = 'opacity 0.5s';
                setTimeout(() => container.remove(), 500);
            }, 5000);
        } catch (e) {
            console.error('Error showing notification:', e);
        }
    `;
    
    window.webContents.executeJavaScript(errorMessage)
        .catch(err => console.error('Error showing error message:', err));
}

// Function to restore session data - extracted to avoid code duplication
function restoreSessionData(sessionData, domain, focusedWindow) {
    if (!sessionData.cookies || sessionData.cookies.length === 0) {
        console.error("❌ No cookies found in session data.");
        showSessionErrorMessage(focusedWindow, "Restore session", "No cookies found in session data");
        return;
    }

    // Extract the base domain to check for related cookies
    const domainParts = domain.split('.');
    const baseDomain = domainParts.length >= 2 
        ? `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}` 
        : domain;

    // Check if the session contains cookies that are relevant to our current domain
    const hasRelevantCookies = sessionData.cookies.some(cookie => {
        const cookieDomain = cookie.domain?.replace(/^\./, '') || ''; // Remove leading dot
        return cookieDomain === domain || 
               domain.endsWith(cookieDomain) || 
               cookieDomain === baseDomain;
    });

    if (!hasRelevantCookies) {
        console.error(`❌ No relevant cookies found for ${domain} in the session data.`);
        showSessionErrorMessage(focusedWindow, "Restore session", "No relevant cookies found for this domain");
        return;
    }

    console.log("🗑️ Clearing existing cookies before restoring...");
    session.defaultSession.clearStorageData({ storages: ["cookies"] });

    // Process cookies based on their prefix
    const promises = [];
    
    for (const cookie of sessionData.cookies) {
        const cookieName = cookie.name;
        
        // Skip the problematic __Host- cookie that's failing
        if (cookieName === '__Host-next-auth.csrf-token') {
            console.log(`⚠️ Skipping known problematic cookie: ${cookieName}`);
            continue;
        }
        
        // Create a modified cookie object for cookie setting
        const cookieConfig = { ...cookie };
        
        // Handle __Host- prefixed cookies correctly
        if (cookieName.startsWith('__Host-')) {
            // For __Host- prefixed cookies:
            // 1. Must be secure
            // 2. Must have no domain (or null domain)
            // 3. Path must be '/'
            cookieConfig.secure = true;
            delete cookieConfig.domain; // Remove domain completely
            cookieConfig.path = '/';
            
            // URL is required, but domain shouldn't be in the cookie object
            const cookieUrl = `https://${domain}`;
            
            promises.push(
                session.defaultSession.cookies.set({ 
                    ...cookieConfig,
                    url: cookieUrl
                })
                .then(() => console.log(`✅ Restored __Host- cookie: ${cookieName}`))
                .catch(error => console.error(`❌ Failed to restore __Host- cookie: ${cookieName}`, error))
            );
        } 
        // Handle __Secure- prefixed cookies correctly
        else if (cookieName.startsWith('__Secure-')) {
            // For __Secure- prefixed cookies:
            // 1. Must be secure
            cookieConfig.secure = true;
            
            // Use the cookie's actual domain, falling back to current domain
            const cookieDomain = cookie.domain ? cookie.domain.replace(/^\./, '') : domain;
            const cookieUrl = `https://${cookieDomain}`;
            
            promises.push(
                session.defaultSession.cookies.set({ 
                    ...cookieConfig,
                    url: cookieUrl
                })
                .then(() => console.log(`✅ Restored __Secure- cookie: ${cookieName}`))
                .catch(error => console.error(`❌ Failed to restore __Secure- cookie: ${cookieName}`, error))
            );
        } 
        // Handle regular cookies
        else {
            // Preserve all cookie attributes as they are in the original cookie
            const protocol = cookie.secure ? 'https' : 'http';
            
            // Use the cookie's actual domain, falling back to current domain
            const cookieDomain = cookie.domain ? cookie.domain.replace(/^\./, '') : domain;
            const cookieUrl = `${protocol}://${cookieDomain}`;
            
            // Handle special cookie properties
            if (cookie.sameSite === null) {
                // Electron requires a valid sameSite value - use 'no_restriction' for null
                cookieConfig.sameSite = 'no_restriction';
            }
            
            promises.push(
                session.defaultSession.cookies.set({ 
                    ...cookieConfig,
                    url: cookieUrl
                })
                .then(() => console.log(`✅ Restored cookie: ${cookieName}`))
                .catch(error => console.error(`❌ Failed to restore cookie: ${cookieName}`, error))
            );
        }
    }

    // Wait for all cookie operations to complete
    Promise.allSettled(promises)
        .then((results) => {
            // Log summary of cookie restoration
            const successful = results.filter(result => result.status === 'fulfilled').length;
            const failed = results.filter(result => result.status === 'rejected').length;
            console.log(`📊 Cookie restoration summary: ${successful} successful, ${failed} failed`);
            
            // Restore LocalStorage
            if (sessionData.localStorage) {
                return focusedWindow.webContents.executeJavaScript(`
                    try {
                        Object.entries(${JSON.stringify(sessionData.localStorage)}).forEach(([key, value]) => {
                            localStorage.setItem(key, value);
                        });
                        true;
                    } catch(e) {
                        console.error("Error restoring localStorage:", e);
                        false;
                    }
                `);
            }
            return true;
        })
        .then(localStorageSuccess => {
            console.log(localStorageSuccess ? "✅ Restored localStorage." : "⚠️ Failed to restore localStorage.");
            
            // Restore SessionStorage
            if (sessionData.sessionStorage) {
                return focusedWindow.webContents.executeJavaScript(`
                    try {
                        Object.entries(${JSON.stringify(sessionData.sessionStorage)}).forEach(([key, value]) => {
                            sessionStorage.setItem(key, value);
                        });
                        true;
                    } catch(e) {
                        console.error("Error restoring sessionStorage:", e);
                        false;
                    }
                `);
            }
            return true;
        })
        .then(sessionStorageSuccess => {
            console.log(sessionStorageSuccess ? "✅ Restored sessionStorage." : "⚠️ Failed to restore sessionStorage.");
            
            console.log(`✅ Successfully restored session for ${domain}. Reloading...`);
            showSessionSuccessMessage(focusedWindow, "Session restored successfully!");
            focusedWindow.reload();
        })
        .catch(error => {
            console.error("❌ Error during session restoration:", error);
            showSessionErrorMessage(focusedWindow, "Restore session", `Error: ${error.message}`);
        });
}

// Show a success message when session operations succeed
function showSessionSuccessMessage(window, message) {
    if (!window) return;
    
    const successMessage = `
        try {
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
            container.style.backgroundColor = '#4CAF50';
            container.style.color = 'white';
            container.style.padding = '10px 20px';
            container.style.borderRadius = '5px';
            container.style.zIndex = '9999';
            container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            container.textContent = "✅ ${message}";
            
            document.body.appendChild(container);
            
            setTimeout(() => {
                container.style.opacity = '0';
                container.style.transition = 'opacity 0.5s';
                setTimeout(() => container.remove(), 500);
            }, 3000);
        } catch (e) {
            console.error('Error showing success notification:', e);
        }
    `;
    
    window.webContents.executeJavaScript(successMessage)
        .catch(err => console.error('Error showing success message:', err));
}

// Set update check interval (12 hours in milliseconds)
const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
// Variable to track if an update is available
let updateAvailable = false;
let latestVersion = null;
let updateUrl = null;

// Change update server URL to use http
const updateServerUrl = config && config.updateServerUrl ? config.updateServerUrl : 'http://venzell.skplay.net';

// Function to check for updates
async function checkForUpdates(silent = false) {
    // The update-electron-app package handles the update process
    // This function is kept for manual update checks
    try {
        const response = await fetch(`${updateServerUrl}/updates/latest.json`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const currentVersion = app.getVersion();
        latestVersion = data.version;
        
        // Get download URL
        updateUrl = data.downloadUrl;
        
        // Check if platforms object exists and has a download URL for current platform
        if (data.platforms && data.platforms[`${process.platform}-${process.arch}`]) {
            updateUrl = data.platforms[`${process.platform}-${process.arch}`].downloadUrl || updateUrl;
        }
        
        console.log(`Found version: ${latestVersion}, download URL: ${updateUrl}`);
        
        if (isNewerVersion(latestVersion, currentVersion)) {
            updateAvailable = true;
            updateInfo = {
                currentVersion,
                latestVersion,
                releaseDate: data.releaseDate,
                releaseNotes: data.releaseNotes,
                updateUrl: data.updateUrl
            };
            
            // Notify renderer process about update
            notifyUpdateAvailable(updateInfo);
            
            // Update menus with the update option
            BrowserWindow.getAllWindows().forEach(win => {
                const url = win.webContents.getURL();
                if (url) {
                    applyUrlMenu(url, win);
                }
            });
            
            return {
                updateAvailable: true,
                ...updateInfo
            };
        } else {
            // Send update-not-available event to renderer
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('update-not-available');
                }
            });
            
            if (!silent) {
                // Only show up-to-date message if not a silent check
                BrowserWindow.getAllWindows().forEach(win => {
                    showSessionSuccessMessage(win, 'Application is up to date');
                });
            }
        }
        
        return {
            updateAvailable: false,
            currentVersion,
            latestVersion
        };
    } catch (error) {
        console.error('Error checking for updates:', error);
        
        // Send update-error event to renderer
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('update-error', error.message);
            }
        });
        
        if (!silent) {
            BrowserWindow.getAllWindows().forEach(win => {
                showSessionErrorMessage(win, 'check for updates', error);
            });
        }
        return {
            updateAvailable: false,
            error: error.message
        };
    }
}

// Function to compare versions (returns true if version1 is newer than version2)
function isNewerVersion(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        
        if (v1Part > v2Part) return true;
        if (v1Part < v2Part) return false;
    }
    
    return false; // Versions are equal
}

// Function to notify user about available update
function notifyUpdateAvailable(updateInfo) {
    // Show notification in all windows
    for (const window of windows) {
        if (!window.isDestroyed()) {
            window.webContents.send('update-available', updateInfo);
        }
    }
}

// Add after app.on('ready') callback, before other event listeners
app.whenReady().then(async () => {
    createWindow();
    
    // Check for updates on startup (silent)
    await checkForUpdates(true);
    
    // Set up periodic update checks
    setInterval(() => checkForUpdates(true), UPDATE_CHECK_INTERVAL);
});

// Add these IPC event handlers after other IPC handlers and before app.on('ready')

// Handle check for updates request from renderer
ipcMain.on('check-for-updates', async (event) => {
    const result = await checkForUpdates(false); // Not silent, show notification
    
    // Send result back to renderer
    if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('check-for-updates-result', {
            updateAvailable: result.updateAvailable,
            currentVersion: app.getVersion(),
            latestVersion: result.latestVersion,
            updateUrl: result.updateUrl
        });
    }
});

// Handle download update request
ipcMain.on('download-update', (event, data, ...additionalArgs) => {
    try {
        // Debug logging to see exactly what's being received
        console.log('📥 Download update requested with data:', typeof data, data);
        console.log('📥 Additional args:', additionalArgs);
        
        // Support both old format (url, version) and new format ({ url, version, ... })
        let downloadUrl, version, options = {};
        
        if (typeof data === 'object' && data !== null) {
            // New format: { url, version, ... }
            downloadUrl = data.url;
            version = data.version;
            options = { ...data };
            
            // Validate URL - this is critical
            if (!downloadUrl) {
                throw new Error('URL is required in the data object');
            }
        } else if (typeof data === 'string') {
            // Old format: url string
            downloadUrl = data;
            // Try to get version from additionalArgs or use 'latest'
            version = additionalArgs.length > 0 ? additionalArgs[0] : 'latest';
        } else {
            throw new Error(`Invalid download data format: ${typeof data}`);
        }
        
        console.log(`Starting download from URL: ${downloadUrl}, version: ${version || 'unknown'}`);
        
        if (!downloadUrl) {
            const errorMsg = 'No download URL provided';
            console.error(errorMsg);
            event.reply('download-error', errorMsg);
            return;
        }
        
        // Validate URL format
        try {
            new URL(downloadUrl);
        } catch (urlError) {
            const errorMsg = `Invalid URL format: ${urlError.message}`;
            console.error(errorMsg);
            event.reply('download-error', errorMsg);
            return;
        }
        
        // Create directory for downloads if it doesn't exist
        const downloadDir = path.join(app.getPath('userData'), 'updates');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        
        // Create a unique filename for the update
        const fileName = options.fileName || `venzell-update-${version || 'latest'}.exe`;
        const filePath = path.join(downloadDir, fileName);
        
        // Notify that download has started
        event.reply('download-progress', {
            percent: 0,
            bytesPerSecond: 0,
            totalBytes: 0,
            downloadedBytes: 0,
            version: version
        });
        
        console.log(`Downloading update to: ${filePath}`);
        
        // Create file stream
        const fileStream = fs.createWriteStream(filePath);
        
        // Download variables
        let totalBytes = 0;
        let downloadedBytes = 0;
        let startTime = Date.now();
        let lastProgressUpdateTime = Date.now();
        let lastDownloadedBytes = 0;
        
        // Choose the appropriate module based on URL protocol
        const urlObj = new URL(downloadUrl);
        const httpModule = urlObj.protocol === 'https:' ? https : http;
        
        // Make the request
        let req;
        try {
            req = httpModule.get(downloadUrl, (response) => {
                if (response.statusCode !== 200) {
                    const errorMsg = `Failed to download update: HTTP ${response.statusCode}`;
                    fileStream.close();
                    fs.unlink(filePath, () => {});
                    console.error(errorMsg);
                    event.reply('download-error', errorMsg);
                    return;
                }
            
                // Get content length for progress calculation
                totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                console.log(`Total download size: ${formatBytes(totalBytes)}`);
                
                // Handle data chunks
                response.on('data', (chunk) => {
                    fileStream.write(chunk);
                    downloadedBytes += chunk.length;
                    
                    // Calculate download speed and update progress
                    const currentTime = Date.now();
                    const timeDiff = currentTime - lastProgressUpdateTime;
                    
                    if (timeDiff >= 200) { // Update every 200ms for smoother progress bar
                        const bytesPerSecond = ((downloadedBytes - lastDownloadedBytes) / timeDiff) * 1000;
                        
                        const progressData = {
                            percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
                            bytesPerSecond,
                            totalBytes,
                            downloadedBytes,
                            version
                        };
                        
                        event.reply('download-progress', progressData);
                        
                        lastProgressUpdateTime = currentTime;
                        lastDownloadedBytes = downloadedBytes;
                    }
                });
                
                // Handle download completion
                response.on('end', () => {
                    fileStream.end();
                });
                
                // Handle response errors
                response.on('error', (err) => {
                    fileStream.close();
                    fs.unlink(filePath, () => {});
                    console.error('Response error:', err);
                    event.reply('download-error', err.message);
                });
            });
        } catch (error) {
            console.error('Request error:', error);
            event.reply('download-error', error.message || 'Unknown error');
            return;
        }
        
        // Add error handler for the request
        req.on('error', (err) => {
            fileStream.close();
            fs.unlink(filePath, () => {});
            console.error('Request error:', err);
            event.reply('download-error', err.message);
        });
        
        // Handle file stream events
        fileStream.on('finish', () => {
            const downloadTimeSeconds = (Date.now() - startTime) / 1000;
            console.log(`Download completed: ${filePath} (${downloadedBytes} bytes in ${downloadTimeSeconds.toFixed(2)}s)`);
            
            // Send completion event with downloaded file path
            const completionData = {
                filePath: filePath,
                version: version,
                totalBytes: downloadedBytes,
                downloadTimeSeconds: downloadTimeSeconds
            };
            
            console.log('Sending completion data:', completionData);
            event.reply('download-complete', completionData);
            
            // Show dialog to notify user
            dialog.showMessageBox({
                type: 'info',
                title: 'Update Downloaded',
                message: `Update to version ${version} downloaded successfully`,
                detail: `The update is ready to install. File saved to:\n${filePath}`,
                buttons: ['Install Now', 'Install Later'],
                defaultId: 0
            }).then(result => {
                if (result.response === 0) {
                    // User chose to install now
                    installUpdate(filePath);
                }
            });
        });
        
        fileStream.on('error', (err) => {
            console.error('File stream error:', err);
            event.reply('download-error', `Error saving update file: ${err.message}`);
            try {
                fs.unlink(filePath, () => {});
            } catch (e) {
                // Ignore cleanup errors
            }
        });
    } catch (error) {
        console.error('Download handler error:', error);
        event.reply('download-error', error.message || 'Unknown error');
    }
});

// Handle install update request
ipcMain.on('install-update', (event, filePath) => {
    installUpdate(filePath);
});

// Function to install update
function installUpdate(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        console.error(`Update file not found: ${filePath}`);
        dialog.showErrorBox(
            'Install Failed',
            `Update file not found: ${filePath}`
        );
        return;
    }
    
    console.log(`Installing update from: ${filePath}`);
    
    // Execute the update file
    require('child_process').execFile(filePath, [], {}, (error) => {
        if (error) {
            console.error('Error installing update:', error);
            dialog.showErrorBox(
                'Install Failed',
                `Failed to install update: ${error.message}`
            );
        } else {
            // Quit the app to allow the installer to run
            app.quit();
        }
    });
}

// Handle Windows squirrel events
if (squirrelStartup) {
    app.quit();
}

// Helper function to format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
