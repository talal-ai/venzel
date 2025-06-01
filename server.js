const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const semver = require('semver');

// Define server URL for production
const SERVER_URL = 'http://venzell.skplay.net'; // Production server URL

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...', err);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...', err);
  console.error(err.stack);
  process.exit(1);
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8095;
const WS_PORT = process.env.WS_PORT || 8096;

// Set timeout values for large file uploads
app.timeout = 15 * 60 * 1000; // 15 minutes server timeout
const server = require('http').createServer(app);
server.timeout = 15 * 60 * 1000; // 15 minutes

// Extended timeout for keep-alive connections
server.keepAliveTimeout = 15 * 60 * 1000; // 15 minutes
server.headersTimeout = 16 * 60 * 1000; // 16 minutes (must be higher than keepAliveTimeout)

// Initialize WebSocket server
const WebSocket = require('ws');
let wss;
try {
  // Create WebSocket server with increased timeout
  const wsOptions = {
    port: WS_PORT,
    clientTracking: true,
    perMessageDeflate: false, // Disable compression for large messages
    maxPayload: 500 * 1024 * 1024, // 500MB max payload
    // Set WebSocket timeout values
    serverOptions: {
      timeout: 15 * 60 * 1000 // 15 minutes timeout
    }
  };
  
  wss = new WebSocket.Server(wsOptions);
  console.log(`✅ WebSocket server initialized on port ${WS_PORT} with extended timeout`);
} catch (error) {
  console.error(`❌ Error starting WebSocket server on port ${WS_PORT}:`, error.message);
  console.log(`📌 Trying alternate port ${WS_PORT + 1}...`);
  try {
    // Try a different port with same timeout settings
    const wsOptions = {
      port: WS_PORT + 1,
      clientTracking: true,
      perMessageDeflate: false,
      maxPayload: 500 * 1024 * 1024,
      serverOptions: {
        timeout: 15 * 60 * 1000
      }
    };
    
    wss = new WebSocket.Server(wsOptions);
    console.log(`✅ WebSocket server initialized on alternate port ${WS_PORT + 1} with extended timeout`);
  } catch (fallbackError) {
    console.error(`❌ Failed to start WebSocket server on alternate port:`, fallbackError.message);
    // Continue without WebSocket functionality
    console.log(`⚠️ WebSocket functionality will be disabled`);
    wss = { on: () => {} }; // Create a dummy WebSocket server that does nothing
  }
}

const activeSockets = {}; // Store active WebSocket connections

wss.on('connection', (ws, req) => {
    // Parse the URL to get the sessionId 
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    
    console.log(`WebSocket connection established${sessionId ? ` with sessionId: ${sessionId}` : ''}`);
    
    if (sessionId) {
        // Store WebSocket connection by sessionId in activeSockets
        activeSockets[sessionId] = ws;
        
        // Also associate the user with this socket if found
        const sessions = getSessions();
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId) {
                // Store user's username with the WebSocket for easier reference
                ws.username = username;
                console.log(`WebSocket associated with user: ${username}`);
                break;
            }
        }
    }

    ws.on('message', (message) => {
        try {
            console.log(`Received WebSocket message: ${message}`);
            const data = JSON.parse(message);
            
            // Handle any additional message processing if needed
            if (data.sessionId && !sessionId) {
                // This is for backward compatibility if sessionId wasn't in URL
                activeSockets[data.sessionId] = ws;
                console.log(`WebSocket connection associated with sessionId: ${data.sessionId}`);
                
                // Find username for this session
                const sessions = getSessions();
                for (const username in sessions) {
                    if (sessions[username].sessionId === data.sessionId) {
                        ws.username = username;
                        console.log(`WebSocket associated with user: ${username}`);
                        break;
                    }
                }
            }
        } catch (err) {
            console.error('Error processing WebSocket message:', err);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        // Clean up the connection from our activeSockets map
        if (sessionId) {
            delete activeSockets[sessionId];
        } else {
            // Search for this connection in our map
            for (const sid in activeSockets) {
                if (activeSockets[sid] === ws) {
                    delete activeSockets[sid];
                    break;
                }
            }
        }
    });
    
    // Send a welcome message to confirm connection
    ws.send(JSON.stringify({
        action: 'connected',
        message: 'WebSocket connection established',
        timestamp: new Date().toISOString()
    }));
});

// Initialize clients Map if it doesn't exist
if (!wss.clients || !(wss.clients instanceof Set)) {
    wss.clients = new Set();
}

// Add a test endpoint after the root endpoint
app.get('/', (req, res) => {
    res.json({ status: 'success', message: '✅ Venzell backend is live and working!' });
});

// High-priority reseller services endpoint that doesn't require authentication
// NOTE: This route is superseded by the implementation later in the file that
// properly filters services based on what's assigned to each reseller.
// This version is kept for backward compatibility with tests.
app.get('/reseller/services-debug', (req, res) => {
    try {
        // Don't require authentication for testing
        const services = getServices();
        const servicesWithFeatures = Object.entries(services).reduce((acc, [name, service]) => {
            acc[name] = {
                ...service,
                isActive: service.status === 'active', 
                activeUsers: Math.floor(Math.random() * 50), // Mock data
                features: ["24/7 Support", "Premium Features", "Regular Updates"]
            };
            return acc;
        }, {});
        res.json(servicesWithFeatures);
    } catch (error) {
        console.error('Error in /reseller/services-debug:', error);
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});


// ✅ Serve static files from the correct directory
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Add a specific route to serve individual logo files with proper headers
app.get('/assets/6%20Services%20logos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'assets', '6 Services logos', filename);
    
    // Check if file exists
    if (fs.existsSync(filepath)) {
        // Set appropriate headers for image files
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.png') {
            res.setHeader('Content-Type', 'image/png');
        } else if (ext === '.jpg' || ext === '.jpeg') {
            res.setHeader('Content-Type', 'image/jpeg');
        } else if (ext === '.gif') {
            res.setHeader('Content-Type', 'image/gif');
        }
        
        // Send the file
        res.sendFile(filepath);
    } else {
        // Send a default placeholder if the requested file doesn't exist
        const defaultImage = path.join(__dirname, 'assets', '6 Services logos', 'default.png');
        if (fs.existsSync(defaultImage)) {
            res.sendFile(defaultImage);
        } else {
            res.status(404).send('Image not found');
        }
    }
});

// Middleware
app.use(cors({ 
    origin: function(origin, callback) {
        // Allow any origin during development
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ 
    limit: '50mb',
    extended: true,
    parameterLimit: 50000
}));

// Define data directory path once and use it consistently throughout the app
const dataDirectory = path.join(__dirname, 'sessions', 'data');
const logsDirectory = path.join(__dirname, 'sessions', 'logs');
const usersFilePath = path.join(dataDirectory, 'users.json');
const sessionsFilePath = path.join(dataDirectory, 'sessions.json');
const sessionHistoryPath = path.join(dataDirectory, 'session_history.json');
const servicesFilePath = path.join(dataDirectory, 'services.json');

// Session Middleware
app.use(session({
    store: new FileStore({ 
        path: logsDirectory,  // Changed to use logs directory instead of data directory
        ttl: 86400, 
        retries: 5,
        reapInterval: 300, // Check for expired sessions every 5 minutes
        reapAsync: true
    }),
    secret: 'c4c2363267f03cea06212d66559c27171655a95877203a90fadd63d3cd7b320d',
    resave: true, // Changed to true for better live updates
    saveUninitialized: true, // Changed to true to ensure new sessions are saved
    rolling: true, // Enable rolling sessions
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Only use secure in production
        httpOnly: true,
        sameSite: 'none', // Allow cross-site cookies
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Add request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    // Log when the request comes in
    console.log(`📥 ${req.method} ${req.url} - Request received`);
    
    // Log after the response is sent
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`📤 ${req.method} ${req.url} - Response sent ${res.statusCode} (${duration}ms)`);
    });
    
    next();
});

// Helper Functions - Use the already defined file paths
const getUsers = () => {
    try {
        if (fs.existsSync(usersFilePath)) {
            const content = fs.readFileSync(usersFilePath, 'utf8');
            console.log(`✅ Successfully read users file from: ${usersFilePath}`);
            return JSON.parse(content);
        }
        console.log(`❌ Users file not found at: ${usersFilePath}`);
        return {};
    } catch (error) {
        console.error('❌ Error reading users file:', error);
        return {};
    }
};

const saveUsers = (users) => {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 4));
        console.log(`✅ Successfully saved users to: ${usersFilePath}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving users file:', error);
        return false;
    }
};

const getSessions = () => {
    try {
        if (fs.existsSync(sessionsFilePath)) {
            const content = fs.readFileSync(sessionsFilePath, 'utf8');
            console.log(`✅ Successfully read sessions file from: ${sessionsFilePath}`);
            return JSON.parse(content);
        }
        console.log(`❌ Sessions file not found at: ${sessionsFilePath}`);
        return {};
    } catch (error) {
        console.error('❌ Error reading sessions file:', error);
        return {};
    }
};

const saveSessions = (sessions) => {
    try {
        fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 4));
        console.log(`✅ Successfully saved sessions to: ${sessionsFilePath}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving sessions file:', error);
        return false;
    }
};

const getSessionHistory = () => {
    try {
        if (fs.existsSync(sessionHistoryPath)) {
            const content = fs.readFileSync(sessionHistoryPath, 'utf8');
            console.log(`✅ Successfully read session history from: ${sessionHistoryPath}`);
            return JSON.parse(content);
        }
        console.log(`❌ Session history file not found at: ${sessionHistoryPath}`);
        return [];
    } catch (error) {
        console.error('❌ Error reading session history file:', error);
        return [];
    }
};

const saveSessionHistory = (history) => {
    try {
        fs.writeFileSync(sessionHistoryPath, JSON.stringify(history, null, 4));
        console.log(`✅ Successfully saved session history to: ${sessionHistoryPath}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving session history file:', error);
        return false;
    }
};

const getServices = () => {
    try {
        if (fs.existsSync(servicesFilePath)) {
            const content = fs.readFileSync(servicesFilePath, 'utf8');
            console.log(`✅ Successfully read services from: ${servicesFilePath}`);
            return JSON.parse(content);
        }
        console.log(`❌ Services file not found at: ${servicesFilePath}`);
        return {};
    } catch (error) {
        console.error('❌ Error reading services file:', error);
        return {};
    }
};

const saveServices = (services) => {
    try {
        fs.writeFileSync(servicesFilePath, JSON.stringify(services, null, 4));
        console.log(`✅ Successfully saved services to: ${servicesFilePath}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving services file:', error);
        return false;
    }
};

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'assets', '6 Services logos');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Configure multer storage specifically for app updates
const updateStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Store update files in a temporary directory first
        const dir = path.join(__dirname, 'updates', 'temp');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Preserve original extension but use timestamp for filename
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `update-${timestamp}${ext}`);
    }
});

// Regular upload instance for normal uploads
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit for regular uploads
    }
});

// Special upload instance for app updates with much higher limits
const updateUpload = multer({
    storage: updateStorage,
    limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB limit for app updates
        fieldSize: 100 * 1024 * 1024, // 100MB field size limit
        files: 1 // Only allow one file per request
    }
});

// ✅ Login Route
app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    console.log(`🔍 Login attempt for: ${username}`);

    const users = getUsers();
    const sessions = getSessions();

    // 1. First validate credentials
    if (!users[username] || users[username].password !== password) {
        return res.status(401).json({ 
            status: 'error', 
            message: 'Invalid credentials.' 
        });
    }

    // 2. Check if user already has an active session
    if (sessions[username]) {
        console.log(`⚠️ User ${username} already has an active session`);
        return res.status(403).json({ 
            status: 'error', 
            message: 'User already logged in on another device.' 
        });
    }

    // 3. Create new session
    const sessionId = require('crypto').randomBytes(32).toString('hex');
    const newSession = {
        sessionId: sessionId,
        username: username,
        role: users[username].role,
        loginTime: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };

    // 4. Store session
    sessions[username] = newSession;
    saveSessions(sessions);

    // 5. Return success with session info
    console.log(`✅ New login successful for user: ${username}`);
    res.json({ 
        status: 'success', 
        sessionId: sessionId, 
        role: users[username].role 
    });
});

// Validate session route
app.post('/validate-session', (req, res) => {
    const { sessionId } = req.body;
    console.log('Validating session:', sessionId);
    
    if (!sessionId) {
        console.log('No sessionId provided');
        return res.status(400).json({ status: 'error', message: 'No session ID provided' });
    }

    const sessions = getSessions();
    const users = getUsers();
    console.log('Current sessions:', sessions);

    // Find the user with this session ID
    let foundUser = null;
    let isValidSession = false;

    for (const user in sessions) {
        if (sessions[user].sessionId === sessionId) {
            foundUser = user;
            // Check if this is the most recent session for this user
            isValidSession = true;
            break;
        }
    }

    if (!foundUser || !isValidSession) {
        console.log('No valid session found for:', sessionId);
        return res.status(401).json({ 
            status: 'error', 
            message: 'Invalid or expired session' 
        });
    }

    // Verify the user still exists and get their role
    if (!users[foundUser]) {
        console.log('User no longer exists:', foundUser);
        return res.status(401).json({ 
            status: 'error', 
            message: 'User no longer exists' 
        });
    }

    // Check if this is the current active session for the user
    if (sessions[foundUser].sessionId !== sessionId) {
        console.log('Session is not the current active session for user:', foundUser);
        return res.status(401).json({ 
            status: 'error', 
            message: 'Session has been terminated due to login from another device' 
        });
    }

    const userRole = users[foundUser].role;
    console.log('Valid session found for user:', foundUser, 'with role:', userRole);

    // Return success with user info
    return res.json({ 
        status: 'success', 
        user: foundUser, 
        role: userRole 
    });
});

// Get all users with services and session info
app.get('/admin/users', (req, res) => {
    const users = getUsers();
    const sessions = getSessions();
    const sessionHistory = getSessionHistory();
    
    const enhancedUsers = {};
    Object.keys(users).forEach(username => {
        // Get user's session history
        const userSessionHistory = sessionHistory.filter(session => 
            session.username === username
        ).sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

        // Get current active session
        const activeSession = Object.keys(sessions).includes(username);
        
        // Get latest session info
        const latestSession = userSessionHistory[0] || null;
        
        // Get first session for join date
        const firstSession = [...userSessionHistory].sort((a, b) => 
            new Date(a.loginTime) - new Date(b.loginTime)
        )[0];

        // Calculate session status
        let sessionStatus = "Never Connected";
        let lastActiveTime = null;

        if (activeSession) {
            sessionStatus = "Currently Active";
            lastActiveTime = new Date().toISOString();
        } else if (latestSession) {
            sessionStatus = "Offline";
            lastActiveTime = latestSession.logoutTime || latestSession.loginTime;
        }

        enhancedUsers[username] = {
            ...users[username],
            isActive: activeSession,
            joinDate: firstSession ? firstSession.loginTime : users[username].joinDate,
            sessionStatus,
            lastActiveTime,
            sessionHistory: userSessionHistory.slice(0, 5) // Last 5 sessions
        };
    });
    
    res.json(enhancedUsers);
});

// Helper function to get current Pakistan time
function getPakistanTime() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Update session start time
app.post('/session/start', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ status: 'error', message: 'Invalid request' });
    }

    let sessions = getSessions();
    sessions[email] = { 
        active: true, 
        loginTime: getPakistanTime()  // Use Pakistan time
    };
    saveSessions(sessions);

    res.json({ status: 'success', message: 'User session started' });
});

// Update session end time
app.post('/session/end', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ status: 'error', message: 'Invalid request' });
    }

    let sessions = getSessions();
    if (sessions[email]) {
        sessions[email].logoutTime = getPakistanTime();  // Use Pakistan time
    }
    delete sessions[email];
    saveSessions(sessions);

    res.json({ status: 'success', message: 'User session ended' });
});

// Delete a user (Admin only)
app.post('/admin/delete-user', (req, res) => {
    const { sessionId, usernameToDelete } = req.body;
    const users = getUsers();
    const sessions = getSessions();

    // Ensure only admin can delete users
    let adminUser = null;
    for (const user in sessions) {
        if (sessions[user].sessionId === sessionId && sessions[user].role === 'admin') {
            adminUser = user;
            break;
        }
    }

    if (!adminUser) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized' });
    }

    // Prevent admin from deleting themselves while logged in
    if (adminUser === usernameToDelete) {
        return res.status(400).json({ status: 'error', message: 'Cannot delete your own account while logged in' });
    }

    if (users[usernameToDelete]) {
        delete users[usernameToDelete];
        saveUsers(users);
        
        // Also remove any active sessions for this user
        if (sessions[usernameToDelete]) {
            delete sessions[usernameToDelete];
            saveSessions(sessions);
        }
        
        return res.json({ status: 'success', message: 'User deleted' });
    } else {
        return res.status(400).json({ status: 'error', message: 'User not found' });
    }
});

//admin remove session route
// server.js - Allow Admin to Remove a Session
app.post('/admin/remove-session', (req, res) => {
    const { user } = req.body;

    if (!user) {
        return res.status(400).json({ status: 'error', message: 'User not specified' });
    }

    let sessions = getSessions();

    if (!sessions[user]) {
        return res.status(404).json({ status: 'error', message: 'Session not found' });
    }

    delete sessions[user];  // ✅ Remove session from sessions.json
    saveSessions(sessions);

    console.log(`✅ Session removed for user: ${user}`);
    res.json({ status: 'success', message: 'Session removed' });
});

// server.js - Return Only Active Sessions for Admin Dashboard
app.get('/admin/sessions', (req, res) => {
    let sessions = getSessions();

    // Filter out only active sessions
    let activeSessions = {};
    for (const user in sessions) {
        if (sessions[user] && sessions[user].sessionId) {
            activeSessions[user] = {
                sessionId: sessions[user].sessionId,
                role: sessions[user].role,
                loginTime: sessions[user].loginTime
            };
        }
    }

    res.json(activeSessions); // ✅ Send active sessions only
});

// server.js - Admin Terminate Session Feature

// server.js - Fix Terminate Session API
app.post('/admin/terminate-session', (req, res) => {
    const { username } = req.body;
    let sessions = getSessions();
    let sessionHistory = getSessionHistory();

    if (!sessions[username]) {
        return res.status(400).json({ status: 'error', message: 'User session not found' });
    }

    // ✅ Remove user from active sessions
    const sessionId = sessions[username].sessionId;
    delete sessions[username];
    saveSessions(sessions);

    // ✅ Update session history (mark as "terminated")
    sessionHistory.forEach(session => {
        if (session.username === username && session.status === "active") {
            session.status = "terminated";
            session.logoutTime = new Date().toISOString();
        }
    });
    saveSessionHistory(sessionHistory);

    console.log(`🚨 Admin terminated session for ${username}`);

    // ✅ Notify the user to force logout via WebSocket (if applicable)
    if (activeSockets[sessionId]) {
        activeSockets[sessionId].send(JSON.stringify({ action: "force_logout" }));
    } else {
        console.log(`No active WebSocket for session: ${sessionId}`);
    }

    res.json({ status: 'success', message: `Session for ${username} has been terminated.` });
});

// server.js - Add Force Logout endpoint to handle admin requests
app.post('/admin/force-logout', (req, res) => {
    const { username, sessionId } = req.body;

    // Check that at least one identifier is provided
    if (!username && !sessionId) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Either username or sessionId is required' 
        });
    }

    console.log(`🚨 Attempting to force logout: ${username || 'unknown'} with sessionId: ${sessionId || 'unknown'}`);

    try {
        // Get current sessions
        let sessions = getSessions();
        let sessionHistory = getSessionHistory();
        let targetUsername = username;
        let targetSessionId = sessionId;
        let sessionFound = false;

        // If only sessionId is provided, find the corresponding username
        if (!targetUsername && targetSessionId) {
            for (const user in sessions) {
                if (sessions[user].sessionId === targetSessionId) {
                    targetUsername = user;
                    console.log(`Found username ${targetUsername} for session ${targetSessionId}`);
                    sessionFound = true;
                    break;
                }
            }
        }
        // If only username is provided, get the sessionId
        else if (targetUsername && !targetSessionId) {
            if (sessions[targetUsername]) {
                targetSessionId = sessions[targetUsername].sessionId;
                console.log(`Found sessionId ${targetSessionId} for user ${targetUsername}`);
                sessionFound = true;
            }
        }
        // If both are provided, verify they match
        else if (sessions[targetUsername] && sessions[targetUsername].sessionId === targetSessionId) {
            sessionFound = true;
        }

        if (!sessionFound) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'Session not found or already terminated' 
            });
        }

        // Store session details before removing
        const sessionDetails = sessions[targetUsername] ? { ...sessions[targetUsername] } : null;

        // Remove the user from active sessions
        if (targetUsername && sessions[targetUsername]) {
            delete sessions[targetUsername];
            saveSessions(sessions);
            console.log(`✅ Removed user ${targetUsername} from active sessions`);
        }

        // Update session history
        let historyUpdated = false;
        sessionHistory.forEach(session => {
            if ((session.username === targetUsername || session.sessionId === targetSessionId) && 
                session.status === "active") {
                session.status = "terminated";
                session.logoutTime = new Date().toISOString();
                historyUpdated = true;
            }
        });

        // If no history entry was updated, create a new one
        if (!historyUpdated && sessionDetails) {
            sessionHistory.push({
                username: targetUsername,
                sessionId: targetSessionId,
                loginTime: sessionDetails.loginTime || new Date().toISOString(),
                logoutTime: new Date().toISOString(),
                status: "terminated",
                role: sessionDetails.role || 'user',
                ipAddress: sessionDetails.ipAddress || "unknown",
                device: sessionDetails.device || "unknown",
                browser: sessionDetails.browser || "unknown"
            });
        }
        
        saveSessionHistory(sessionHistory);

        // Send force logout message via WebSocket
        if (targetSessionId && activeSockets[targetSessionId]) {
            console.log(`✅ Sending force_logout to session: ${targetSessionId}`);
            activeSockets[targetSessionId].send(JSON.stringify({ 
                action: "force_logout",
                message: "Your session has been terminated by an admin"
            }));
            
            // Close the WebSocket connection
            setTimeout(() => {
                try {
                    if (activeSockets[targetSessionId]) {
                        activeSockets[targetSessionId].close();
                        delete activeSockets[targetSessionId];
                        console.log(`✅ Closed WebSocket for session: ${targetSessionId}`);
                    }
                } catch (err) {
                    console.error(`Error closing WebSocket for session ${targetSessionId}:`, err);
                }
            }, 1000); // Give time for the message to be sent
        } else {
            console.log(`⚠️ No active WebSocket for session: ${targetSessionId}`);
        }

        return res.json({ 
            status: 'success', 
            message: `Session for ${targetUsername || 'user'} has been forcefully terminated` 
        });
    } catch (error) {
        console.error('❌ Error in force-logout:', error);
        return res.status(500).json({ 
            status: 'error', 
            message: 'Internal server error while terminating session' 
        });
    }
});

app.post('/admin/update-service', (req, res) => {
    const { user, service } = req.body;

    if (!user || !service) {
        return res.status(400).json({ status: 'error', message: 'Invalid request' });
    }

    const users = getUsers();

    if (!users[user].services) {
        users[user].services = [];
    }
    
    if (!users[user].serviceDetails) {
        users[user].serviceDetails = {};
    }

    let action = '';
    
    if (users[user].services.includes(service)) {
        // Remove service
        users[user].services = users[user].services.filter(s => s !== service);
        delete users[user].serviceDetails[service];
        action = 'removed';
    } else {
        // Add service with 30 days expiration
        const now = new Date();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        const expiration = new Date(now.getTime() + thirtyDaysInMs);

        users[user].services.push(service);
        users[user].serviceDetails[service] = {
            assignedDate: now.toISOString(),
            expirationDate: expiration.toISOString()
        };
        action = 'added';
    }

    saveUsers(users);
    
    // Get service details
    const services = getServices();
    const serviceDetails = services[service] || {};
    
    // Send WebSocket notification to the user if they're online
    try {
        // Find the user's session ID from sessions
        const sessions = getSessions();
        let userSessionId = null;
        
        // Find session ID for this user
        for (const username in sessions) {
            if (username === user) {
                userSessionId = sessions[username].sessionId;
                break;
            }
        }
        
        if (userSessionId && activeSockets[userSessionId]) {
            const client = activeSockets[userSessionId];
            
            // Create appropriate message based on action
            const message = action === 'added' 
                ? `Service "${service}" has been added to your account for 30 days.` 
                : `Service "${service}" has been removed from your account.`;
                
            const notificationData = {
                action: 'service_updated',
                service: service,
                serviceDetails: serviceDetails,
                operation: action,
                message: message,
                timestamp: new Date().toISOString()
            };
            
            client.send(JSON.stringify(notificationData));
            console.log(`Notification sent to user ${user} for ${action} service ${service}`);
        } else {
            console.log(`User ${user} is offline, no notification sent. SessionId: ${userSessionId || 'not found'}`);
        }
    } catch (error) {
        console.error('Error sending WebSocket notification:', error);
    }
    
    res.json({ 
        status: 'success', 
        message: `Service ${action} successfully`,
        action: action
    });
});

// server.js - Fix Logout Handling

app.post('/logout', (req, res) => {
    const { sessionId, username } = req.body; // Get both sessionId and username from request

    let sessions = getSessions();
    let sessionHistory = getSessionHistory();

    let loggedInUser = null;

    // First try to find the user by the provided username
    if (username && sessions[username]) {
        loggedInUser = username;
    } else {
        // If no username or username not found, try to find by sessionId
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId) {
                loggedInUser = user;
                break;
            }
        }
    }

    // No valid session found
    if (!loggedInUser) {
        return res.status(400).json({ status: 'error', message: 'No active session found' });
    }

    console.log(`Logging out user: ${loggedInUser} with sessionId: ${sessionId}`);

    // Get the session details before removing
    const userSession = sessions[loggedInUser];
    
    // Remove user from active sessions
    delete sessions[loggedInUser];
    saveSessions(sessions);

    // Current timestamp for logout time
    const logoutTime = new Date().toISOString();

    // Update ALL matching sessions in session history
    let updatedCount = 0;
    sessionHistory.forEach(session => {
        // Match by username and active status
        if (session.username === loggedInUser && !session.logoutTime) {
            session.status = "ended";
            session.logoutTime = logoutTime;
            updatedCount++;
        }
        
        // Also match by sessionId if available
        if (sessionId && session.sessionId === sessionId && !session.logoutTime) {
            session.status = "ended";
            session.logoutTime = logoutTime;
            updatedCount++;
        }
    });
    
    // If no sessions were updated, add a new history entry
    if (updatedCount === 0 && userSession) {
        sessionHistory.push({
            username: loggedInUser,
            sessionId: userSession.sessionId,
            loginTime: userSession.loginTime,
            logoutTime: logoutTime,
            status: "ended",
            role: userSession.role,
            ipAddress: userSession.ipAddress || "unknown",
            device: userSession.device || "unknown",
            browser: userSession.browser || "unknown"
        });
    }
    
    saveSessionHistory(sessionHistory);

    // Destroy Express session
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error("Logout error:", err);
                return res.status(500).json({ status: 'error', message: 'Logout error' });
            }
            res.json({ status: 'success', message: 'Logged out successfully' });
        });
    } else {
        res.json({ status: 'success', message: 'Logged out successfully' });
    }
});

//ADMIN ROLES
// Get session history// ✅ Fetch Session History (for Admin)
app.get('/admin/session-history', (req, res) => {
    try {
        const sessionHistory = getSessionHistory();
        const users = getUsers();
        
        // Enhance session history with additional info
        const enhancedHistory = sessionHistory.map(session => ({
            ...session,
            role: session.role || users[session.username]?.role || 'user',
            status: determineSessionStatus(session)
        }));

        res.json(enhancedHistory);
    } catch (error) {
        console.error('Error fetching session history:', error);
        res.status(500).json({ error: 'Failed to fetch session history' });
    }
});

// Helper function to determine session status
function determineSessionStatus(session) {
    if (!session) return 'unknown';
    if (session.status === 'terminated') return 'terminated';
    if (session.logoutTime) return 'ended';
    
    // Get active sessions to check if user is actually logged in
    const activeSessions = getSessions();
    const username = session.username || session.userName;
    
    // If user is not in active sessions, they're not logged in
    if (username && !activeSessions[username]) {
        return 'ended';
    }
    
    // Also check by sessionId to be thorough
    const sessionId = session.sessionId || session.id;
    if (sessionId) {
        let foundInActiveSessions = false;
        for (const user in activeSessions) {
            if (activeSessions[user].sessionId === sessionId) {
                foundInActiveSessions = true;
                break;
            }
        }
        
        if (!foundInActiveSessions) {
            return 'ended';
        }
    }
    
    const sessionStart = new Date(session.loginTime);
    const now = new Date();
    const duration = now - sessionStart;
    
    // Check for session activity
    const lastActivity = session.lastActivity ? new Date(session.lastActivity) : sessionStart;
    const timeSinceLastActivity = now - lastActivity;
    
    // If no activity for 5 minutes, mark as inactive
    if (timeSinceLastActivity > 5 * 60 * 1000) return 'inactive';
    
    // If session is older than 30 minutes without logout, consider it terminated
    if (duration > 30 * 60 * 1000) return 'terminated';
    
    return 'active';
}

app.post('/admin/add-user', (req, res) => {
    const { sessionId, newUsername, newPassword, newRole, fullName } = req.body;

    if (!newUsername || !newPassword || !newRole || !fullName) {
        return res.status(400).json({ status: 'error', message: 'All fields are required.' });
    }

    // Validate role
    if (!['user', 'admin', 'reseller'].includes(newRole)) {
        return res.status(400).json({ status: 'error', message: 'Invalid role selected.' });
    }

    const users = getUsers();
    const sessions = getSessions();

    // Verify admin privileges
    let isAdmin = false;
    for (const user in sessions) {
        if (sessions[user].sessionId === sessionId && sessions[user].role === 'admin') {
            isAdmin = true;
            break;
        }
    }

    if (!isAdmin) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized access.' });
    }

    // Check if username already exists
    if (users[newUsername]) {
        return res.status(400).json({ status: 'error', message: 'Username already exists.' });
    }

    // Add new user with role-specific settings
    users[newUsername] = {
        password: newPassword,
        role: newRole,
        fullName: fullName,
        joinDate: new Date().toISOString(),
        status: 'Active',
        services: [],
        // Add reseller-specific fields if role is reseller
        ...(newRole === 'reseller' && {
            commission: 0,
            totalSales: 0,
            clients: []
        })
    };

    // Save updated users
    saveUsers(users);

    res.json({ status: 'success', message: 'User added successfully.' });
});

// Get logged-in user's approved services

// Add these new endpoints for dashboard statistics
app.get('/admin/stats', (req, res) => {
    try {
        const users = getUsers();
        const sessions = getSessions();
        
        // Get total users count
        const totalUsers = Object.keys(users).length;
        
        // Get currently active users
        const activeUsers = Object.keys(sessions).length;
        
        res.json({
            totalUsers,
            activeUsers
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Add this new endpoint to get all services
app.get('/admin/services', (req, res) => {
    const services = getServices();
    res.json(services);
});

// Update the add service endpoint
app.post('/admin/add-service', upload.single('image'), async (req, res) => {
    try {
        const { name, url, status, price } = req.body;
        console.log('Received service data:', { name, url, status });
        
        if (!name || !url || !req.file) {
            console.log('Missing required fields');
            return res.status(400).json({ 
                status: 'error', 
                message: 'Name, URL and image are required' 
            });
        }

        // Process image to standard size (64x64)
        const processedImageBuffer = await sharp(req.file.buffer)
            .resize(64, 64, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toBuffer();

        // Generate timestamp-based filename to avoid conflicts
        const timestamp = Date.now();
        const filename = `${timestamp}.png`;
        const imagePath = path.join(__dirname, 'assets', '6 Services logos', filename);
        
        // Ensure directory exists
        const dir = path.join(__dirname, 'assets', '6 Services logos');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log('Saving image to:', imagePath);
        
        await sharp(processedImageBuffer)
            .resize(64, 64, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(imagePath);

        // Format URL if needed
        let formattedUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            formattedUrl = 'https://' + url;
        }

        // Get services data
        let servicesData = getServices();
        console.log('Current services:', servicesData);
        
        // Check if service already exists
        if (servicesData[name]) {
            console.log('Service already exists:', name);
            return res.status(400).json({
                status: 'error',
                message: 'Service already exists'
            });
        }
        
        // Create regular service
        servicesData[name] = {
            url: formattedUrl,
            status: status || 'active',
            image: `/assets/6 Services logos/${filename}`,
            addedDate: new Date().toISOString(),
            activeUsers: 0,
            description: `${name} service`,
            price: parseFloat(price) || 0,
            type: 'regular'
        };

        console.log('Adding new service:', servicesData[name]);

        // Save services
        saveServices(servicesData);
        console.log('Services saved successfully');

        res.json({ 
            status: 'success', 
            message: 'Service added successfully',
            service: servicesData[name]
        });
    } catch (error) {
        console.error('Error adding service:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Error adding service'
        });
    }
});

// Update the service stats endpoint
app.get('/admin/service-stats', (req, res) => {
    const users = getUsers();
    const services = getServices();
    
    // Calculate service statistics
    const serviceStats = {
        totalServices: Object.keys(services).length,
        totalActiveUsers: 0,
        services: []
    };

    // Calculate active users for each service
    for (const serviceName in services) {
        let activeUsers = 0;
        for (const username in users) {
            if (users[username].services && users[username].services.includes(serviceName)) {
                activeUsers++;
            }
        }

        serviceStats.services.push({
            name: serviceName,
            activeUsers: activeUsers,
            status: services[serviceName].status
        });

        serviceStats.totalActiveUsers += activeUsers;
    }

    res.json(serviceStats);
});

// Add new endpoint for deleting services
app.post('/admin/delete-service', (req, res) => {
    try {
        const { serviceName } = req.body;
        const services = getServices();

        if (!services[serviceName]) {
            return res.status(404).json({
                status: 'error',
                message: 'Service not found'
            });
        }

        // Delete the service image file
        const imagePath = path.join(__dirname, services[serviceName].image);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        // Remove service from services.json
        delete services[serviceName];
        saveServices(services);

        res.json({
            status: 'success',
            message: 'Service deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete service'
        });
    }
});

// Update dashboard statistics endpoint
app.get('/admin/dashboard-stats', (req, res) => {
    try {
        const users = getUsers();
        const sessions = getSessions();
        const currentDate = new Date();
        
        // Time periods
        const sevenDaysAgo = new Date(currentDate - 7 * 24 * 60 * 60 * 1000);
        const previousWeek = new Date(sevenDaysAgo - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(currentDate - 30 * 24 * 60 * 60 * 1000);

        // Total Users Calculations
        const totalUsers = Object.keys(users).length;
        const previousTotalUsers = Object.entries(users).filter(([_, user]) => 
            new Date(user.joinDate) < sevenDaysAgo
        ).length;

        // New Users Calculations
        const newUsers = Object.entries(users).filter(([_, user]) => 
            new Date(user.joinDate) >= sevenDaysAgo
        ).length;
        
        const previousNewUsers = Object.entries(users).filter(([_, user]) => {
            const joinDate = new Date(user.joinDate);
            return joinDate >= previousWeek && joinDate < sevenDaysAgo;
        }).length;

        // Active Users Calculations
        const activeUsers = Object.keys(sessions).length;
        const previousActiveUsers = Object.entries(users).filter(([_, user]) => 
            user.lastActiveTime && new Date(user.lastActiveTime) >= previousWeek && new Date(user.lastActiveTime) < sevenDaysAgo
        ).length;

        // Services Calculations
        const services = getServices();
        const totalServices = Object.keys(services).length;
        const previousServices = Object.entries(services).filter(([_, service]) => 
            new Date(service.addedDate) < thirtyDaysAgo
        ).length;

        // Calculate trends using our utility function
        const usersTrend = calculateTrend(totalUsers, previousTotalUsers, {
            timeFrame: '7d',
            format: 'users'
        });

        const newUsersTrend = calculateTrend(newUsers, previousNewUsers, {
            timeFrame: '7d',
            format: 'users'
        });

        const activeUsersTrend = calculateTrend(activeUsers, previousActiveUsers, {
            timeFrame: '7d',
            format: 'users'
        });

        const servicesTrend = calculateTrend(totalServices, previousServices, {
            timeFrame: '30d',
            format: 'services'
        });

        res.json({
            totalUsers,
            newUsers,
            activeUsers,
            totalServices,
            trends: {
                users: usersTrend,
                newUsers: newUsersTrend,
                activeUsers: activeUsersTrend,
                services: servicesTrend
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

// Add this utility function for consistent percentage calculations
function calculateTrend(current, previous, options = {}) {
    const {
        timeFrame = '30d',  // '7d', '30d', '90d', etc.
        format = 'regular', // 'regular', 'currency', 'users', etc.
        baseline = 0        // minimum value to consider for percentage calculation
    } = options;

    // Handle zero or invalid previous values
    if (!previous || previous <= baseline) {
        return {
            trend: current > baseline ? 100 : 0,
            direction: current > baseline ? 'up' : 'stable',
            change: current - (previous || 0),
            percentage: 100
        };
    }

    // Calculate percentage change
    const percentageChange = ((current - previous) / previous) * 100;
    
    // Determine direction
    const direction = 
        percentageChange > 0 ? 'up' : 
        percentageChange < 0 ? 'down' : 
        'stable';

    // Round percentage to 1 decimal place
    const roundedPercentage = Math.round(percentageChange * 10) / 10;

    return {
        trend: roundedPercentage,
        direction,
        change: current - previous,
        percentage: Math.abs(roundedPercentage)
    };
}

// Update reseller stats endpoint with new trend calculations
app.get('/admin/reseller-stats', (req, res) => {
    try {
        const users = getUsers();
        const sessions = getSessions();
        
        // Time periods
        const currentDate = new Date();
        const sevenDaysAgo = new Date(currentDate - 7 * 24 * 60 * 60 * 1000);
        const previousWeek = new Date(sevenDaysAgo - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(currentDate - 30 * 24 * 60 * 60 * 1000);

        // Get reseller data
        const resellers = Object.entries(users).filter(([_, user]) => user.role === 'reseller');
        const totalResellers = resellers.length;

        // New resellers calculations
        const newResellers = resellers.filter(([_, user]) => 
            new Date(user.joinDate) >= sevenDaysAgo
        ).length;

        const previousPeriodResellers = resellers.filter(([_, user]) => 
            new Date(user.joinDate) >= previousWeek && new Date(user.joinDate) < sevenDaysAgo
        ).length;

        // Sales calculations (example with mock data for now)
        const currentSales = resellers.reduce((total, [_, user]) => {
            return total + (user.sales?.last30Days || 0);
        }, 0);

        const previousSales = resellers.reduce((total, [_, user]) => {
            return total + (user.sales?.previous30Days || 0);
        }, 0);

        // Revenue calculations
        const currentRevenue = resellers.reduce((total, [_, user]) => {
            return total + (user.revenue?.current || 0);
        }, 0);

        const previousRevenue = resellers.reduce((total, [_, user]) => {
            return total + (user.revenue?.previous || 0);
        }, 0);

        // Calculate all trends using the utility function
        const resellersTrend = calculateTrend(totalResellers, totalResellers - newResellers, {
            timeFrame: '7d',
            format: 'users'
        });

        const newResellersTrend = calculateTrend(newResellers, previousPeriodResellers, {
            timeFrame: '7d',
            format: 'users'
        });

        const salesTrend = calculateTrend(currentSales, previousSales, {
            timeFrame: '30d',
            format: 'sales'
        });

        const revenueTrend = calculateTrend(currentRevenue, previousRevenue, {
            timeFrame: '30d',
            format: 'currency'
        });

        res.json({
            totalResellers,
            newResellers,
            activeSales: currentSales,
            totalRevenue: currentRevenue,
            trends: {
                resellers: resellersTrend,
                newResellers: newResellersTrend,
                sales: salesTrend,
                revenue: revenueTrend
            }
        });
    } catch (error) {
        console.error('Error fetching reseller stats:', error);
        res.status(500).json({ error: 'Failed to fetch reseller statistics' });
    }
});

// Add endpoint for recent users
app.get('/admin/recent-users', (req, res) => {
    try {
        const users = getUsers();
        const sessions = getSessions();
        
        // Convert users object to array and add additional info
        const userArray = Object.entries(users).map(([username, user]) => ({
            username,
            ...user,
            isActive: !!sessions[username],
            lastActive: user.lastActiveTime || user.joinDate
        }));

        // Sort by last active time and get top 10
        const recentUsers = userArray
            .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
            .slice(0, 10);

        res.json(recentUsers);
    } catch (error) {
        console.error('Error fetching recent users:', error);
        res.status(500).json({ error: 'Failed to fetch recent users' });
    }
});

// Add endpoint for recent resellers
app.get('/admin/recent-resellers', (req, res) => {
    try {
        const users = getUsers();
        const sessions = getSessions();
        
        // Get only reseller users and convert to array
        const resellersArray = Object.entries(users)
            .filter(([_, user]) => user.role === 'reseller')
            .map(([username, user]) => ({
                username,
                ...user,
                isActive: !!sessions[username],
                lastActive: user.lastActiveTime || user.joinDate,
                // Mock data - replace with real data from your database
                lastSale: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                monthlySales: Math.floor(Math.random() * 50),
                revenue: Math.floor(Math.random() * 10000),
                salesTrend: Math.floor(Math.random() * 40) - 20 // Random number between -20 and 20
            }));

        // Sort by last active time and get top 10
        const recentResellers = resellersArray
            .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
            .slice(0, 10);

        res.json(recentResellers);
    } catch (error) {
        console.error('Error fetching recent resellers:', error);
        res.status(500).json({ error: 'Failed to fetch recent resellers' });
    }
});

// Update tools stats endpoint with new trend calculations
app.get('/admin/tools-stats', (req, res) => {
    try {
        const users = getUsers();
        const services = getServices();
        const currentDate = new Date();
        const thirtyDaysAgo = new Date(currentDate - 30 * 24 * 60 * 60 * 1000);
        const previousThirtyDays = new Date(thirtyDaysAgo - 30 * 24 * 60 * 60 * 1000);

        // Calculate metrics with the new utility
        const totalTools = Object.keys(services).length;
        const previousTools = Object.keys(services).filter(service => 
            new Date(services[service].addedDate) >= previousThirtyDays
        ).length;

        // Usage calculations
        const { currentUsage, previousUsage, topSellingTools } = calculateUsageMetrics(
            users, 
            thirtyDaysAgo, 
            previousThirtyDays
        );

        // Calculate all trends
        const toolsTrend = calculateTrend(totalTools, previousTools, {
            timeFrame: '30d',
            format: 'tools'
        });

        const usageTrend = calculateTrend(currentUsage.total, previousUsage.total, {
            timeFrame: '30d',
            format: 'users'
        });

        const revenueTrend = calculateTrend(currentUsage.revenue, previousUsage.revenue, {
            timeFrame: '30d',
            format: 'currency'
        });

        const topSellingTrend = calculateTrend(
            Math.max(...Array.from(topSellingTools.values())),
            Math.max(...Array.from(topSellingTools.values()).filter(count => count < Math.max(...Array.from(topSellingTools.values())))),
            {
                timeFrame: '30d',
                format: 'sales'
            }
        );

        res.json({
            totalTools,
            topSelling: Math.max(...Array.from(topSellingTools.values())),
            revenue: currentUsage.revenue,
            activeUsers: currentUsage.total,
            trends: {
                tools: toolsTrend,
                topSelling: topSellingTrend,
                revenue: revenueTrend,
                usage: usageTrend
            }
        });
    } catch (error) {
        console.error('Error fetching tools stats:', error);
        res.status(500).json({ error: 'Failed to fetch tools statistics' });
    }
});

// Helper function to calculate usage metrics
function calculateUsageMetrics(users, currentPeriodStart, previousPeriodStart) {
    const currentUsage = { total: 0, revenue: 0 };
    const previousUsage = { total: 0, revenue: 0 };
    const topSellingTools = new Map();

    Object.entries(users).forEach(([_, user]) => {
        if (user.services) {
            user.services.forEach(service => {
                const serviceUsageDate = new Date(user.lastActiveTime || user.joinDate);
                
                if (serviceUsageDate >= currentPeriodStart) {
                    currentUsage.total++;
                    currentUsage.revenue += 1000; // Example fixed price
                    topSellingTools.set(service, (topSellingTools.get(service) || 0) + 1);
                } else if (serviceUsageDate >= previousPeriodStart) {
                    previousUsage.total++;
                    previousUsage.revenue += 1000;
                }
            });
        }
    });

    return { currentUsage, previousUsage, topSellingTools };
}

// Add this endpoint to get recent sessions
app.get('/admin/recent-sessions', (req, res) => {
    try {
        const sessionHistory = getSessionHistory();
        const users = getUsers();
        const sessions = getSessions();
        
        // Get the current active sessions
        const activeSessionIds = Object.values(sessions).map(s => s.sessionId);
        
        // Process and combine session data
        const processedSessions = sessionHistory
            .map(session => ({
                ...session,
                role: users[session.username]?.role || 'user',
                status: activeSessionIds.includes(session.sessionId) ? 
                    'active' : 
                    (session.logoutTime ? 'ended' : 'terminated'),
                duration: session.logoutTime ? 
                    new Date(session.logoutTime) - new Date(session.loginTime) : 
                    new Date() - new Date(session.loginTime)
            }))
            .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

        res.json(processedSessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Add endpoint for user details
app.get('/admin/user/:username', (req, res) => {
    try {
        const users = getUsers();
        const sessions = getSessions();
        const username = req.params.username;
        
        if (!users[username]) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = {
            ...users[username],
            isActive: !!sessions[username],
            lastActive: users[username].lastActiveTime || users[username].joinDate,
            currentSession: sessions[username] || null
        };

        res.json(userData);
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Add this endpoint to handle service assignment
app.post('/admin/assign-service', (req, res) => {
    try {
        const { username, service } = req.body;
        const users = getUsers();

        if (!users[username]) {
            return res.status(404).json({ 
                status: 'error',
                message: 'User not found' 
            });
        }

        // Initialize services array if it doesn't exist
        if (!users[username].services) {
            users[username].services = [];
        }

        // Check if service is already assigned
        if (users[username].services.includes(service)) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Service already assigned to user' 
            });
        }

        // Add the service
        users[username].services.push(service);
        saveUsers(users);

        res.json({ 
            status: 'success',
            message: 'Service assigned successfully' 
        });
    } catch (error) {
        console.error('Error assigning service:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to assign service' 
        });
    }
});

// Update the check-expired-services endpoint
app.get('/admin/check-expired-services', (req, res) => {
    const users = getUsers();
    const now = new Date();
    let expiredServices = [];
    let hasChanges = false;

    Object.entries(users).forEach(([username, userData]) => {
        if (userData.serviceDetails) {
            Object.entries(userData.serviceDetails).forEach(([service, details]) => {
                if (details.expirationDate) {
                    const expirationDate = new Date(details.expirationDate);
                    if (expirationDate <= now) {
                        // Remove expired service
                        userData.services = userData.services.filter(s => s !== service);
                        delete userData.serviceDetails[service];
                        expiredServices.push({ username, service });
                        hasChanges = true;
                    }
                }
            });
        }
    });

    if (hasChanges) {
        saveUsers(users);
    }

    res.json({ 
        status: 'success', 
        expiredServices,
        timestamp: now.toISOString()
    });
});

// Get all services
app.get('/api/services', (req, res) => {
    try {
        const services = getServices();
        res.json(services);
    } catch (error) {
        console.error('Error getting services:', error);
        res.status(500).json({ error: 'Failed to get services' });
    }
});

// Update the services endpoint
app.post('/api/services', upload.single('image'), async (req, res) => {
    try {
        console.log('Received request:', {
            body: req.body,
            file: req.file
        });

        const { name, url, price } = req.body;

        if (!name || !url || !req.file) {
            return res.status(400).json({
                error: 'Missing required fields'
            });
        }

        const services = getServices();
        
        if (services[name]) {
            return res.status(400).json({
                error: 'Service already exists'
            });
        }

        // Process the image path
        const imagePath = `assets/6 Services logos/${req.file.filename}`;

        // Create service
        services[name] = {
            url: url.startsWith('http') ? url : `https://${url}`,
            status: 'active',
            image: imagePath,
            addedDate: new Date().toISOString(),
            activeUsers: 0,
            description: '',
            price: parseFloat(price) || 0,
            type: 'regular'
        };

        // Save services to file
        saveServices(services);
        console.log('Service added:', services[name]);

        res.status(201).json({
            message: 'Service added successfully',
            service: services[name]
        });
    } catch (error) {
        console.error('Error adding service:', error);
        res.status(500).json({
            error: error.message || 'Failed to add service'
        });
    }
});

// Update the service update endpoint
app.put('/api/services/:name', upload.single('image'), (req, res) => {
    try {
        const { name } = req.params;
        const services = getServices();
        
        if (!services[name]) {
            return res.status(404).json({ error: 'Service not found' });
        }

        // Create updated service object
        const updatedService = {
            url: req.body.url,
            description: req.body.description || '',
            price: parseFloat(req.body.price) || 0,
            status: req.body.status || 'active',
            image: services[name].image, // Keep existing image by default
            addedDate: services[name].addedDate,
            activeUsers: services[name].activeUsers || 0
        };

        // Update image if new one is provided
        if (req.file) {
            updatedService.image = `assets/6 Services logos/${req.file.filename}`;
        }

        // Handle name change if needed
        const newName = req.body.name;
        if (newName && newName !== name) {
            delete services[name];
            services[newName] = updatedService;
        } else {
            services[name] = updatedService;
        }

        // Save to file
        fs.writeFileSync(servicesFilePath, JSON.stringify(services, null, 2));

        res.json({
            status: 'success',
            message: 'Service updated successfully',
            service: updatedService
        });

    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ 
            status: 'error',
            error: 'Failed to update service' 
        });
    }
});

// Get admin settings
app.get('/admin/settings', (req, res) => {
    const users = getUsers();
    const adminUser = Object.entries(users).find(([_, user]) => user.role === 'admin');
    
    if (adminUser) {
        res.json({ email: adminUser[0] });
    } else {
        res.status(404).json({ error: 'Admin user not found' });
    }
});

// Update admin settings
app.put('/admin/settings', (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const users = getUsers();
        const adminUser = Object.entries(users).find(([_, user]) => user.role === 'admin');
        
        if (!adminUser) {
            return res.status(404).json({ error: 'Admin user not found' });
        }
        
        const [adminEmail, adminData] = adminUser;
        
        // Verify current password
        if (adminData.password !== currentPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Update email if changed
        if (email !== adminEmail) {
            delete users[adminEmail];
            users[email] = adminData;
        }
        
        // Update password if provided
        if (newPassword) {
            users[email].password = newPassword;
        }
        
        saveUsers(users);
        
        res.json({ status: 'success', message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating admin settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Get resellers list
app.get('/admin/resellers', (req, res) => {
    try {
        const users = getUsers();
        const resellers = Object.entries(users)
            .filter(([_, user]) => user.role === 'reseller')
            .map(([email, user]) => ({ email, ...user }));
        
        res.json(resellers);
    } catch (error) {
        console.error('Error getting resellers:', error);
        res.status(500).json({ error: 'Failed to get resellers' });
    }
});

// Add analytics endpoint
app.get('/admin/analytics', (req, res) => {
    try {
        const users = getUsers();
        const services = getServices();
        
        // Calculate total revenue and service usage
        let totalRevenue = 0;
        let activeUsers = 0;
        let serviceUsage = {};
        
        // Initialize service usage tracking
        Object.keys(services).forEach(service => {
            serviceUsage[service] = {
                users: 0,
                revenue: 0
            };
        });

        // Calculate revenue and usage
        Object.values(users).forEach(user => {
            if (user.services && Array.isArray(user.services)) {
                activeUsers++;
                user.services.forEach(serviceName => {
                    if (services[serviceName]) {
                        const price = parseFloat(services[serviceName].price) || 0;
                        totalRevenue += price;
                        
                        // Track service-specific metrics
                        serviceUsage[serviceName].users++;
                        serviceUsage[serviceName].revenue += price;
                    }
                });
            }
        });

        // Find top selling services
        const topSelling = Object.entries(serviceUsage)
            .sort((a, b) => b[1].users - a[1].users)
            .slice(0, 3)
            .map(([name]) => name);

        // Calculate trends (comparing to previous period)
        const previousStats = getPreviousStats(); // You'll need to implement this
        const revenueTrend = calculateTrend(totalRevenue, previousStats.revenue);
        const serviceRevenueTrend = calculateTrend(
            Object.values(serviceUsage).reduce((sum, { revenue }) => sum + revenue, 0),
            previousStats.serviceRevenue
        );

        res.json({
            totalRevenue,
            revenueTrend,
            serviceRevenue: Object.values(serviceUsage)
                .reduce((sum, { revenue }) => sum + revenue, 0),
            serviceRevenueTrend,
            totalServices: Object.keys(services).length,
            activeUsers,
            topSelling: topSelling.length,
            usageTrend: calculateTrend(activeUsers, previousStats.activeUsers),
            topSellingTrend: calculateTrend(topSelling.length, previousStats.topSelling)
        });
    } catch (error) {
        console.error('Error calculating analytics:', error);
        res.status(500).json({ error: 'Failed to calculate analytics' });
    }
});

// Helper function to calculate trend percentage
function calculateTrend(current, previous) {
    if (!previous) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
}

// Store previous stats for trend calculation
let previousStats = {
    revenue: 0,
    serviceRevenue: 0,
    activeUsers: 0,
    topSelling: 0
};

function getPreviousStats() {
    return previousStats;
}

// Update previous stats periodically
setInterval(() => {
    const users = getUsers();
    const services = getServices();
    
    let stats = {
        revenue: 0,
        serviceRevenue: 0,
        activeUsers: 0,
        topSelling: 0
    };

    // Calculate current stats
    Object.values(users).forEach(user => {
        if (user.services && user.services.length > 0) {
            stats.activeUsers++;
            user.services.forEach(serviceName => {
                if (services[serviceName]) {
                    const price = parseFloat(services[serviceName].price) || 0;
                    stats.revenue += price;
                    stats.serviceRevenue += price;
                }
            });
        }
    });

    // Update previous stats
    previousStats = stats;
}, 300000); // Update every 5 minutes

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const currentStats = await getDashboardStats();
        const previousStats = await getPreviousPeriodStats();

        res.json({
            users: {
                total: currentStats.users.total,
                previousTotal: previousStats.users.total,
                active: currentStats.users.active,
                previousActive: previousStats.users.active,
                new: currentStats.users.new,
                previousNew: previousStats.users.new,
                admin: currentStats.users.admin,
                previousAdmin: previousStats.users.admin
            },
            services: {
                total: currentStats.services.total,
                previousTotal: previousStats.services.total,
                activeUsers: currentStats.services.activeUsers,
                previousActiveUsers: previousStats.services.activeUsers,
                revenue: currentStats.services.revenue,
                previousRevenue: previousStats.services.revenue,
                avgUsage: currentStats.services.avgUsage,
                previousAvgUsage: previousStats.services.avgUsage
            },
            sessions: {
                active: currentStats.sessions.active,
                previousActive: previousStats.sessions.active,
                total: currentStats.sessions.total,
                previousTotal: previousStats.sessions.total,
                avgDuration: currentStats.sessions.avgDuration,
                previousAvgDuration: previousStats.sessions.avgDuration,
                terminated: currentStats.sessions.terminated,
                previousTerminated: previousStats.sessions.terminated
            }
        });
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to get current stats
async function getDashboardStats() {
    try {
        // Get the data sources
        const users = getUsers();
        const sessions = getSessions();
        const sessionHistory = getSessionHistory();
        const services = getServices();
        
        // Calculate user stats
        const totalUsers = Object.keys(users).length;
        const activeUsers = Object.keys(sessions).length;
        const newUsers = Object.values(users).filter(user => {
            const joinDate = new Date(user.joinDate || Date.now());
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return joinDate >= sevenDaysAgo;
        }).length;
        const adminUsers = Object.values(users).filter(user => user.role === 'admin').length;
        
        // Calculate service stats
        const totalServices = Object.keys(services).length;
        let activeServiceUsers = 0;
        let totalServiceRevenue = 0;
        
        Object.values(users).forEach(user => {
            if (user.services && user.services.length > 0) {
                activeServiceUsers++;
                user.services.forEach(serviceName => {
                    if (services[serviceName]) {
                        totalServiceRevenue += parseFloat(services[serviceName].price || 0);
                    }
                });
            }
        });
        
        const avgServiceUsage = totalUsers > 0 ? activeServiceUsers / totalUsers * 100 : 0;
        
        // Calculate session stats
        const activeSessions = Object.keys(sessions).length;
        const totalSessions = sessionHistory.length;
        const terminatedSessions = sessionHistory.filter(session => session.status === 'terminated').length;
        
        // Calculate average session duration
        let totalDuration = 0;
        let sessionCount = 0;
        
        sessionHistory.forEach(session => {
            if (session.loginTime && session.logoutTime) {
                const start = new Date(session.loginTime);
                const end = new Date(session.logoutTime);
                totalDuration += end - start;
                sessionCount++;
            }
        });
        
        const avgSessionDuration = sessionCount > 0 ? totalDuration / sessionCount : 0;
        
    return {
        users: {
                total: totalUsers,
                active: activeUsers,
                new: newUsers,
                admin: adminUsers
        },
        services: {
                total: totalServices,
                activeUsers: activeServiceUsers,
                revenue: totalServiceRevenue,
                avgUsage: avgServiceUsage
        },
        sessions: {
                active: activeSessions,
                total: totalSessions,
                avgDuration: avgSessionDuration,
                terminated: terminatedSessions
            }
        };
    } catch (error) {
        console.error('Error in getDashboardStats:', error);
        return {
            users: { total: 0, active: 0, new: 0, admin: 0 },
            services: { total: 0, activeUsers: 0, revenue: 0, avgUsage: 0 },
            sessions: { active: 0, total: 0, avgDuration: 0, terminated: 0 }
        };
    }
}

// Helper function to get previous period stats
async function getPreviousPeriodStats() {
    try {
        // For simplicity, we'll just return a set of mock previous stats
        // In a real implementation, you would calculate this based on historical data
        return {
            users: {
                total: 0,
                active: 0,
                new: 0,
                admin: 0
            },
            services: {
                total: 0,
                activeUsers: 0,
                revenue: 0,
                avgUsage: 0
            },
            sessions: {
                active: 0,
                total: 0,
                avgDuration: 0,
                terminated: 0
            }
        };
    } catch (error) {
        console.error('Error in getPreviousPeriodStats:', error);
        return {
            users: { total: 0, active: 0, new: 0, admin: 0 },
            services: { total: 0, activeUsers: 0, revenue: 0, avgUsage: 0 },
            sessions: { active: 0, total: 0, avgDuration: 0, terminated: 0 }
        };
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        status: 'error', 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start the server at the end of the file
const startServer = () => {
  try {
    // Log all defined routes for debugging
    console.log('✅ Defined routes:');
    app._router.stack.forEach(r => {
      if (r.route && r.route.path) {
        console.log(`${r.route.stack[0].method.toUpperCase()} ${r.route.path}`);
      }
    });
    
    // Check if /reseller/services is properly defined
    const resellerServicesRoute = app._router.stack.find(r => 
      r.route && r.route.path === '/reseller/services'
    );
    if (resellerServicesRoute) {
      console.log('✅ /reseller/services route is properly defined');
    } else {
      console.log('❌ WARNING: /reseller/services route is NOT defined');
      
      // Add the route directly here as a fallback
      app.get('/reseller/services', (req, res) => {
        try {
          // Get the session ID from request headers
          const authHeader = req.headers.authorization || '';
          const sessionId = authHeader.replace('Bearer ', '');
          
          // Verify that the request is from a reseller
          const sessions = getSessions();
          let isReseller = false;
          let resellerUsername = '';
          
          for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
              isReseller = true;
              resellerUsername = username;
              break;
            }
          }
          
          if (!isReseller) {
            return res.status(403).json({ 
              status: 'error',
              message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
          }
          
          const services = getServices();
          const users = getUsers();
          
          // Check if the reseller has assigned services
          const resellerUser = users[resellerUsername];
          if (!resellerUser) {
            return res.status(404).json({
              status: 'error',
              message: 'Reseller user not found'
            });
          }
          
          // Get the services assigned to this reseller
          const assignedServices = resellerUser.services || [];
          
          // If no services assigned, return empty object
          if (assignedServices.length === 0) {
            return res.json({});
          }
          
          // Filter services to only include those assigned to this reseller
          const servicesWithStats = {};
          assignedServices.forEach(serviceName => {
            if (services[serviceName]) {
              // Count active users for this service
              let activeUsers = 0;
              for (const username in users) {
                if (users[username].services && 
                    users[username].services.includes(serviceName) && 
                    users[username].createdBy === resellerUsername) {
                  activeUsers++;
                }
              }
              
              // Add service to response with additional information
              servicesWithStats[serviceName] = {
                ...services[serviceName],
                activeUsers,
                isActive: services[serviceName].status === 'active'
              };
            }
          });
          
          res.json(servicesWithStats);
        } catch (error) {
          console.error('Error in fallback /reseller/services route:', error);
          res.status(500).json({ error: 'Failed to fetch services' });
        }
      });
      console.log('✅ Added fallback /reseller/services route');
    }
    
    // Use server.listen instead of app.listen to use our configured HTTP server with timeout
    app.listen(PORT, () => {
      console.log(`✅ Server running at https://venzell.skplay.net:${PORT}`);
      console.log(`✅ WebSocket server running at wss://venzell.skplay.net:${wss.address()?.port || 'N/A'}`);
      console.log(`✅ Server environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ Server timeout set to ${server.timeout/60000} minutes for large file uploads`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Log the data directory for debugging
console.log(`🔍 Using data directory: ${path.resolve(dataDirectory)}`);

// Ensure the data directory exists but don't create any files
if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    console.log(`✅ Created data directory at: ${dataDirectory}`);
} else {
    console.log(`✅ Data directory exists at: ${dataDirectory}`);
}

// Function to read JSON files with error handling
function readJsonFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } else {
            console.warn(`File not found: ${filePath}`);
            return {};
        }
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return {};
    }
}

// API endpoints for users and sessions data - use the variables already defined
app.get('/admin/users', (req, res) => {
    const users = readJsonFile(usersFilePath);
    res.json(users);
});

app.get('/admin/services', (req, res) => {
    const services = readJsonFile(servicesFilePath);
    res.json(services);
});

app.get('/admin/session-history', (req, res) => {
    const history = readJsonFile(sessionHistoryPath);
    res.json(history);
});

// Login endpoint - use the variables already defined
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Read users data
    const users = readJsonFile(usersFilePath);
    
    // Read sessions data
    const sessions = readJsonFile(sessionsFilePath);
    
    // Check if user exists and password matches
    if (users[username] && users[username].password === password) {
        // Generate a session ID
        const sessionId = require('crypto').randomBytes(16).toString('hex');
        
        // Store the session
        if (!sessions[username]) {
            sessions[username] = {};
        }
        
        sessions[username].sessionId = sessionId;
        sessions[username].lastActive = new Date().toISOString();
        
        // Write sessions back to the file
        fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2));
        
        // Get user's role
        const role = users[username].role || 'user';
        
        // Return success with session ID and role
        res.json({
            status: 'success',
            message: 'Login successful',
            sessionId,
            role
        });
    } else {
        // Return error if login failed
        res.status(401).json({
            status: 'error',
            message: 'Invalid username or password'
        });
    }
});

// Serve the JSON files directly (for development/testing)
app.get('/sessions.json', (req, res) => {
    res.sendFile(path.join(dataDirectory, 'sessions.json'));
});

app.get('/users.json', (req, res) => {
    res.sendFile(path.join(dataDirectory, 'users.json'));
});

app.get('/services.json', (req, res) => {
    res.sendFile(path.join(dataDirectory, 'services.json'));
});

app.get('/session_history.json', (req, res) => {
    res.sendFile(path.join(dataDirectory, 'session_history.json'));
});

// Initialize default data files if they don't exist
function initializeDefaultData() {
    // Instead of creating default files, just check if they exist and log the result
    console.log('\n🔍 Checking for existing data files:');
    
    const usersFilePath = path.join(dataDirectory, 'users.json');
    if (fs.existsSync(usersFilePath)) {
        console.log(`✅ Found users.json at: ${usersFilePath}`);
    } else {
        console.log(`❌ WARNING: users.json NOT found at: ${usersFilePath}`);
    }

    const servicesFilePath = path.join(dataDirectory, 'services.json');
    if (fs.existsSync(servicesFilePath)) {
        console.log(`✅ Found services.json at: ${servicesFilePath}`);
    } else {
        console.log(`❌ WARNING: services.json NOT found at: ${servicesFilePath}`);
    }

    const sessionsFilePath = path.join(dataDirectory, 'sessions.json');
    if (fs.existsSync(sessionsFilePath)) {
        console.log(`✅ Found sessions.json at: ${sessionsFilePath}`);
    } else {
        console.log(`❌ WARNING: sessions.json NOT found at: ${sessionsFilePath}`);
    }

    const historyFilePath = path.join(dataDirectory, 'session_history.json');
    if (fs.existsSync(historyFilePath)) {
        console.log(`✅ Found session_history.json at: ${historyFilePath}`);
    } else {
        console.log(`❌ WARNING: session_history.json NOT found at: ${historyFilePath}`);
    }
}

// Call this function during server startup
initializeDefaultData();

// Endpoint for resellers to view all available services
app.get('/reseller/services', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get services and users data
        const services = getServices();
        const users = getUsers();
        
        // Check if the reseller has assigned services
        const resellerUser = users[resellerUsername];
        if (!resellerUser) {
            return res.status(404).json({
                status: 'error',
                message: 'Reseller user not found'
            });
        }
        
        // Get the services assigned to this reseller
        const assignedServices = resellerUser.services || [];
        
        // Filter services to only include those assigned to this reseller
        const servicesWithStats = {};
        assignedServices.forEach(serviceName => {
            if (services[serviceName]) {
            // Count active users for this service
            let activeUsers = 0;
            for (const username in users) {
                    if (users[username].services && 
                        users[username].services.includes(serviceName) && 
                        users[username].createdBy === resellerUsername) {
                    activeUsers++;
                }
            }
            
            // Add service to response with additional information
                servicesWithStats[serviceName] = {
                    ...services[serviceName],
                activeUsers,
                    isActive: services[serviceName].status === 'active',
                    features: services[serviceName].features || [
                    "Basic support",
                    "Standard performance",
                    "Regular updates"
                ]
            };
            }
        });
        
        res.json(servicesWithStats);
    } catch (error) {
        console.error('Error fetching services for reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch services'
        });
    }
});

// Add endpoint for admins to assign services to resellers
app.post('/admin/assign-reseller-service', (req, res) => {
    try {
        const { resellerUsername, serviceName, sessionId } = req.body;
        
        if (!resellerUsername || !serviceName || !sessionId) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Missing required fields: resellerUsername, serviceName, sessionId'
            });
        }
        
        // Verify admin session
        const sessions = getSessions();
        let isAdmin = false;
        let adminUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'admin') {
                isAdmin = true;
                adminUsername = username;
                break;
            }
        }
        
        if (!isAdmin) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only admins can assign services to resellers.'
            });
        }
        
        // Get users and services data
        const users = getUsers();
        const services = getServices();
        
        // Check if reseller exists and is actually a reseller
        if (!users[resellerUsername]) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Reseller not found'
            });
        }
        
        if (users[resellerUsername].role !== 'reseller') {
            return res.status(400).json({ 
                status: 'error',
                message: 'User is not a reseller'
            });
        }
        
        // Check if service exists
        if (!services[serviceName]) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Service not found'
            });
        }
        
        // Initialize services array if it doesn't exist
        if (!users[resellerUsername].services) {
            users[resellerUsername].services = [];
        }
        
        // Initialize serviceDetails object if it doesn't exist
        if (!users[resellerUsername].serviceDetails) {
            users[resellerUsername].serviceDetails = {};
        }
        
        // Check if the service is already assigned
        const isServiceAssigned = users[resellerUsername].services.includes(serviceName);
        
        if (isServiceAssigned) {
            // Remove the service (toggle behavior)
            users[resellerUsername].services = users[resellerUsername].services.filter(s => s !== serviceName);
            if (users[resellerUsername].serviceDetails[serviceName]) {
                delete users[resellerUsername].serviceDetails[serviceName];
            }
            
            // Save changes
            saveUsers(users);
            
            return res.json({ 
                status: 'success',
                message: `Service "${serviceName}" has been removed from reseller ${resellerUsername}`,
                action: 'removed'
            });
        } else {
            // Assign the service with expiration date
            const now = new Date();
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            const expiration = new Date(now.getTime() + thirtyDaysInMs);
            
            users[resellerUsername].services.push(serviceName);
            users[resellerUsername].serviceDetails[serviceName] = {
                assignedDate: now.toISOString(),
                expirationDate: expiration.toISOString(),
                assignedBy: adminUsername
            };
            
            // Save changes
            saveUsers(users);
            
            return res.json({ 
                status: 'success',
                message: `Service "${serviceName}" has been assigned to reseller ${resellerUsername}`,
                action: 'assigned'
            });
        }
    } catch (error) {
        console.error('Error assigning service to reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to assign service to reseller'
        });
    }
});

// Endpoint for admins to get reseller services
app.get('/admin/reseller-services/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify admin session
        const sessions = getSessions();
        let isAdmin = false;
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'admin') {
                isAdmin = true;
                break;
            }
        }
        
        if (!isAdmin) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only admins can view reseller services.'
            });
        }
        
        // Get users and services data
        const users = getUsers();
        const services = getServices();
        
        // Check if reseller exists
        if (!users[username]) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Reseller not found'
            });
        }
        
        // Get assigned services
        const assignedServices = users[username].services || [];
        const serviceDetails = users[username].serviceDetails || {};
        
        // Prepare response data
        const servicesData = {};
        
        // Add all available services with assignment status
        Object.keys(services).forEach(serviceName => {
            const isAssigned = assignedServices.includes(serviceName);
            servicesData[serviceName] = {
                ...services[serviceName],
                isAssigned,
                assignmentDetails: isAssigned ? serviceDetails[serviceName] : null
            };
        });
        
        res.json(servicesData);
    } catch (error) {
        console.error('Error fetching reseller services:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch reseller services'
        });
    }
});

// Update the simple reseller services endpoint with the same filtering logic
app.get('/reseller/services-public', (req, res) => {
    try {
        // Get the query parameter for the reseller username
        const { username } = req.query;
        
        if (!username) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing reseller username'
            });
        }
        
        const services = getServices();
        const users = getUsers();
        
        // Check if the reseller exists
        if (!users[username] || users[username].role !== 'reseller') {
            return res.status(404).json({
                status: 'error',
                message: 'Reseller not found'
            });
        }
        
        // Get the services assigned to this reseller
        const assignedServices = users[username].services || [];
        
        // Filter services to only include those assigned to this reseller
        const servicesWithStats = {};
        assignedServices.forEach(serviceName => {
            if (services[serviceName]) {
                servicesWithStats[serviceName] = {
                    ...services[serviceName],
                    activeUsers: 0, // Placeholder
                    isActive: services[serviceName].status === 'active',
                    features: services[serviceName].features || [
                        "Basic support",
                        "Standard performance",
                        "Regular updates"
                    ]
                };
            }
        });
        
        res.json(servicesWithStats);
    } catch (error) {
        console.error('Error fetching services for reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch services'
        });
    }
});

// Endpoint for resellers to get details of a specific service
app.get('/reseller/service/:serviceName', (req, res) => {
    try {
        const { serviceName } = req.params;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get service data
        const services = getServices();
        const users = getUsers();
        
        if (!services[serviceName]) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Service not found'
            });
        }
        
        // Count active users for this service
        let activeUsers = 0;
        for (const username in users) {
            if (users[username].services && users[username].services.includes(serviceName)) {
                activeUsers++;
            }
        }
        
        // Return service with additional information
        const serviceData = {
            ...services[serviceName],
            activeUsers,
            isActive: services[serviceName].status === 'active',
            features: services[serviceName].features || [
                "Basic support",
                "Standard performance",
                "Regular updates"
            ]
        };
        
        res.json(serviceData);
    } catch (error) {
        console.error('Error fetching service details:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch service details'
        });
    }
});

// Endpoint for resellers to get services assigned to a specific user
app.get('/reseller/user-services/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if user exists
        if (!users[username]) {
            return res.status(404).json({ 
                status: 'error',
                message: 'User not found'
            });
        }
        
        // Get user services
        const userServices = users[username].services || [];
        
        // Get services details
        const services = getServices();
        
        // Return service details for each user service
        const serviceDetails = userServices.map(serviceName => {
            const service = services[serviceName] || {};
            return {
                name: serviceName,
                description: service.description || '',
                price: service.price || 0,
                isActive: service.status === 'active',
                assignedDate: users[username].serviceDetails && 
                             users[username].serviceDetails[serviceName] && 
                             users[username].serviceDetails[serviceName].assignedDate,
                expirationDate: users[username].serviceDetails && 
                               users[username].serviceDetails[serviceName] && 
                               users[username].serviceDetails[serviceName].expirationDate
            };
        });
        
        res.json(serviceDetails);
    } catch (error) {
        console.error('Error fetching user services:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch user services'
        });
    }
});

// Endpoint for resellers to add a service to a user
app.post('/reseller/add-user-service', async (req, res) => {
    try {
        console.log('Starting service assignment process...');
        const { username, serviceName, sessionId } = req.body;
        
        if (!username || !serviceName || !sessionId) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Missing required fields',
                details: { username: !username, serviceName: !serviceName, sessionId: !sessionId }
            });
        }
        
        console.log(`Validating reseller session for service assignment: ${serviceName} to ${username}`);
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                resellerUsername = user;
                break;
            }
        }
        
        if (!isReseller) {
            console.log('Unauthorized attempt: Not a reseller');
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can add services to users.'
            });
        }
        
        console.log('Fetching users and services data...');
        // Get users and services data
        const users = getUsers();
        const services = getServices();
        
        // Check if user exists
        if (!users[username]) {
            console.log(`User not found: ${username}`);
            return res.status(404).json({ 
                status: 'error',
                message: 'User not found'
            });
        }
        
        // Check if service exists and is active
        if (!services[serviceName]) {
            console.log(`Service not found: ${serviceName}`);
            return res.status(404).json({ 
                status: 'error',
                message: 'Service not found'
            });
        }

        // Validate service status
        if (services[serviceName].status !== 'active') {
            console.log(`Service ${serviceName} is not active`);
            return res.status(400).json({
                status: 'error',
                message: 'Cannot assign inactive service'
            });
        }
        
        console.log('Initializing user service arrays...');
        // Initialize services array if it doesn't exist
        if (!users[username].services) {
            users[username].services = [];
        }
        
        // Initialize serviceDetails object if it doesn't exist
        if (!users[username].serviceDetails) {
            users[username].serviceDetails = {};
        }
        
        // Check if user already has this service
        if (users[username].services.includes(serviceName)) {
            console.log(`User ${username} already has service ${serviceName}`);
            return res.status(400).json({ 
                status: 'error',
                message: 'User already has this service'
            });
        }
        
        console.log('Assigning service with expiration...');
        // Add service to user with 30 days expiration
        const now = new Date();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        const expiration = new Date(now.getTime() + thirtyDaysInMs);
        
        users[username].services.push(serviceName);
        users[username].serviceDetails[serviceName] = {
            assignedDate: now.toISOString(),
            expirationDate: expiration.toISOString(),
            assignedBy: resellerUsername,
            status: 'active',
            price: services[serviceName].price || 0
        };
        
        console.log('Saving updated user data...');
        // Save updated users data
        saveUsers(users);
        
        console.log('Service assignment completed successfully');
        res.json({ 
            status: 'success',
            message: 'Service added to user successfully',
            details: {
                service: {
                    name: serviceName,
                    assignedDate: now.toISOString(),
                    expirationDate: expiration.toISOString(),
                    status: 'active',
                    price: services[serviceName].price || 0
                },
                user: {
                    username,
                    totalServices: users[username].services.length
                }
            }
        });

        // Log the successful assignment
        console.log(`Service ${serviceName} assigned to ${username} by ${resellerUsername}`);
        
    } catch (error) {
        console.error('Error adding service to user:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to add service to user',
            details: error.message
        });
    }
});

// Endpoint for resellers to get dashboard statistics
app.get('/reseller/dashboard-stats', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get users and services data
        const users = getUsers();
        const services = getServices();
        
        // Calculate statistics
        const currentDate = new Date();
        const oneMonthAgo = new Date(currentDate);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        // User statistics
        let totalUsers = 0;
        let activeUsers = 0;
        let newUsers = 0;
        let totalRevenue = 0;
        let monthlyRevenue = 0;
        let toolsRevenue = 0;
        let topSellingTools = 0;
        
        // Count users and calculate revenue for users created by this reseller
        Object.entries(users).forEach(([username, user]) => {
            // Only count users created by this reseller
            if (user.createdBy !== resellerUsername) {
                return;
            }
            
            totalUsers++;
            
            // Count active users (who have active sessions)
            if (sessions[username]) {
                activeUsers++;
            }
            
            // Count new users (joined in the last month)
            if (user.joinDate && new Date(user.joinDate) > oneMonthAgo) {
                newUsers++;
            }
            
            // Calculate revenue from user services
            if (user.services && Array.isArray(user.services)) {
                user.services.forEach(serviceName => {
                    const service = services[serviceName];
                    if (service && service.price) {
                        const price = parseFloat(service.price);
                        totalRevenue += price;
                        
                        // Add to monthly revenue if service was added in the last month
                        const assignedDate = user.serviceDetails?.[serviceName]?.assignedDate;
                        if (assignedDate && new Date(assignedDate) > oneMonthAgo) {
                            monthlyRevenue += price;
                        }
                        
                        // Count as tools revenue (example categorization)
                        if (service.category === 'tool') {
                            toolsRevenue += price;
                        }
                        
                        // Count for top selling tools
                        topSellingTools++;
                    }
                });
            }
        });
        
        // Get previous period stats for this reseller
        const previousStats = getPreviousStats(resellerUsername) || {
            totalUsers: Math.max(0, totalUsers - Math.floor(totalUsers * 0.1)),
            activeUsers: Math.max(0, activeUsers - Math.floor(activeUsers * 0.1)),
            newUsers: Math.max(0, newUsers - 1),
            totalRevenue: Math.max(0, totalRevenue - 1000),
            monthlyRevenue: Math.max(0, monthlyRevenue - 500),
            toolsRevenue: Math.max(0, toolsRevenue - 200),
            topSellingTools: Math.max(0, topSellingTools - 2)
        };
        
        // Prepare response
        const stats = {
            users: {
                total: totalUsers,
                active: activeUsers,
                new: newUsers,
                previousTotal: previousStats.totalUsers,
                previousActive: previousStats.activeUsers,
                previousNew: previousStats.newUsers
            },
            services: {
                total: Object.keys(services).length,
                previousTotal: Object.keys(services).length - 1 // Mock data
            },
            revenue: {
                total: totalRevenue,
                monthly: monthlyRevenue,
                tools: toolsRevenue,
                topSelling: topSellingTools,
                previousTotal: previousStats.totalRevenue,
                previousMonthly: previousStats.monthlyRevenue,
                previousTools: previousStats.toolsRevenue,
                previousTopSelling: previousStats.topSellingTools
            },
            timestamp: currentDate.toISOString()
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching dashboard stats for reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch dashboard statistics'
        });
    }
});

// Endpoint for resellers to get user list
app.get('/reseller/users', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Filter users to only show those created by this reseller
        const filteredUsers = {};
        Object.entries(users).forEach(([username, user]) => {
            if (user.createdBy === resellerUsername) {
                filteredUsers[username] = {
                    ...user,
                    isActive: !!sessions[username],
                    lastActiveTime: sessions[username] ? sessions[username].lastActivityTime : null,
                    services: user.services || []
                };
            }
        });
        
        res.json(filteredUsers);
    } catch (error) {
        console.error('Error fetching users for reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch users'
        });
    }
});

// Simple endpoint for reseller services that doesn't require authentication for testing
app.get('/reseller/services-public', (req, res) => {
    try {
        const services = getServices();
        const users = getUsers();
        
        // Calculate active users for each service
        const servicesWithStats = Object.entries(services).reduce((acc, [serviceName, service]) => {
            // Count active users for this service
            let activeUsers = 0;
            for (const username in users) {
                if (users[username].services && users[username].services.includes(serviceName)) {
                    activeUsers++;
                }
            }
            
            // Add service to response with additional information
            acc[serviceName] = {
                ...service,
                activeUsers,
                isActive: service.status === 'active',
                features: service.features || [
                    "Basic support",
                    "Standard performance",
                    "Regular updates"
                ]
            };
            
            return acc;
        }, {});
        
        res.json(servicesWithStats);
    } catch (error) {
        console.error('Error fetching services for reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch services'
        });
    }
});

// Simplified reseller services endpoint with minimal authentication
app.get('/reseller/services', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get services and users data
        const services = getServices();
        const users = getUsers();
        
        // Check if the reseller has assigned services
        const resellerUser = users[resellerUsername];
        if (!resellerUser) {
            return res.status(404).json({
                status: 'error',
                message: 'Reseller user not found'
            });
        }
        
        // Get the services assigned to this reseller
        const assignedServices = resellerUser.services || [];
        
        // If no services assigned, return empty object
        if (assignedServices.length === 0) {
            return res.json({});
        }
        
        // Filter services to only include those assigned to this reseller
        const servicesWithStats = {};
        assignedServices.forEach(serviceName => {
            if (services[serviceName]) {
                // Count active users for this service
                let activeUsers = 0;
                for (const username in users) {
                    if (users[username].services && 
                        users[username].services.includes(serviceName) && 
                        users[username].createdBy === resellerUsername) {
                        activeUsers++;
                    }
                }
                
                // Add service to response with additional information
                servicesWithStats[serviceName] = {
                    ...services[serviceName],
                    activeUsers,
                    isActive: services[serviceName].status === 'active',
                    features: services[serviceName].features || [
                        "Basic support",
                        "Standard performance",
                        "Regular updates"
                    ]
                };
            }
        });
        
        res.json(servicesWithStats);
    } catch (error) {
        console.error('Error fetching services for reseller:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch services'
        });
    }
});

// Add user endpoint for resellers
app.post('/reseller/add-user', (req, res) => {
    try {
        const { sessionId, newUsername, newPassword, newRole, fullName } = req.body;
        
        if (!sessionId || !newUsername || !newPassword || !fullName) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }

        // Validate session and check if user is a reseller
        const sessions = getSessions();
        let resellerUsername = null;
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId) {
                resellerUsername = username;
                break;
            }
        }
        
        if (!resellerUsername) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid session'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if reseller is authorized
        if (!users[resellerUsername] || users[resellerUsername].role !== 'reseller') {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized: Only resellers can add users'
            });
        }
        
        // Check if username already exists
        if (users[newUsername]) {
            return res.status(409).json({
                status: 'error',
                message: 'Username already exists'
            });
        }
        
        // Enforce role restrictions (resellers can only add regular users)
        if (newRole !== 'user') {
            return res.status(403).json({
                status: 'error',
                message: 'Resellers can only add regular users'
            });
        }
        
        // Add the new user
        const newUser = {
            username: newUsername,
            password: newPassword, // In a production environment, this should be hashed
            role: newRole,
            fullName: fullName,
            joinDate: new Date().toISOString(),
            lastActiveTime: null,
            isActive: true,
            createdBy: resellerUsername,
            services: []
        };
        
        users[newUsername] = newUser;
        
        // Save updated users data
        saveUsers(users);
        
        // Log the action
        console.log(`User ${newUsername} added by reseller ${resellerUsername}`);
        
        return res.json({
            status: 'success',
            message: 'User added successfully',
            user: {
                username: newUsername,
                role: newRole,
                fullName: fullName,
                joinDate: newUser.joinDate
            }
        });
    } catch (error) {
        console.error('Error in /reseller/add-user:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// Endpoint for resellers to get user details
app.get('/reseller/user/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                resellerUsername = user;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if user exists and was created by this reseller
        if (!users[username] || users[username].createdBy !== resellerUsername) {
            return res.status(404).json({ 
                status: 'error',
                message: 'User not found or not authorized to view this user'
            });
        }
        
        // Get services data for service details
        const services = getServices();
        
        // Prepare service details with expiration dates
        const serviceDetails = {};
        if (users[username].services) {
            users[username].services.forEach(serviceName => {
                const assignedDate = users[username].serviceAssignments?.[serviceName]?.assignedDate || new Date().toISOString();
                const expirationDate = users[username].serviceAssignments?.[serviceName]?.expirationDate;
                
                serviceDetails[serviceName] = {
                    assignedDate,
                    expirationDate,
                    ...services[serviceName]
                };
            });
        }
        
        // Return user data with service details
        res.json({
            ...users[username],
            serviceDetails
        });
        
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to fetch user details'
        });
    }
});

// Endpoint for resellers to remove a service from a user
app.post('/reseller/remove-user-service', (req, res) => {
    try {
        const { username, serviceName, sessionId } = req.body;
        
        if (!username || !serviceName || !sessionId) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Missing required fields'
            });
        }
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                resellerUsername = user;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can remove services from users.'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if user exists and was created by this reseller
        if (!users[username] || users[username].createdBy !== resellerUsername) {
            return res.status(404).json({ 
                status: 'error',
                message: 'User not found or not authorized to modify this user'
            });
        }
        
        // Check if user has the service
        if (!users[username].services || !users[username].services.includes(serviceName)) {
            return res.status(400).json({ 
                status: 'error',
                message: 'User does not have this service'
            });
        }
        
        // Remove the service
        users[username].services = users[username].services.filter(s => s !== serviceName);
        
        // Remove service details if they exist
        if (users[username].serviceDetails && users[username].serviceDetails[serviceName]) {
            delete users[username].serviceDetails[serviceName];
        }
        
        // Save updated users data
        saveUsers(users);
        
        res.json({ 
            status: 'success',
            message: 'Service removed successfully',
            details: {
                username,
                serviceName,
                remainingServices: users[username].services.length
            }
        });
        
    } catch (error) {
        console.error('Error removing service from user:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to remove service from user'
        });
    }
});

// Endpoint for resellers to delete a user
app.delete('/reseller/user/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const sessionUsername in sessions) {
            if (sessions[sessionUsername].sessionId === sessionId && sessions[sessionUsername].role === 'reseller') {
                isReseller = true;
                resellerUsername = sessionUsername;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can delete users.'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if user exists
        if (!users[username]) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }
        
        // Check if the user was created by this reseller
        if (users[username].createdBy !== resellerUsername) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized. You can only delete users you created.'
            });
        }
        
        // Delete user's session if they have one
        if (sessions[username]) {
            delete sessions[username];
            saveSessions(sessions);
        }
        
        // Delete the user
        delete users[username];
        saveUsers(users);
        
        res.json({
            status: 'success',
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete user'
        });
    }
});

// Endpoint for resellers to create a new user
app.post('/reseller/create-user', (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const sessionUsername in sessions) {
            if (sessions[sessionUsername].sessionId === sessionId && sessions[sessionUsername].role === 'reseller') {
                isReseller = true;
                resellerUsername = sessionUsername;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can create users.'
            });
        }
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Username and password are required'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if username already exists
        if (users[username]) {
            return res.status(409).json({
                status: 'error',
                message: 'Username already exists'
            });
        }
        
        // Create new user
        users[username] = {
            username,
            password: hashPassword(password),
            role: 'user',
            services: [],
            serviceDetails: {},
            joinDate: new Date().toISOString(),
            createdBy: resellerUsername, // Store the reseller who created this user
            lastLogin: null
        };
        
        // Save users data
        saveUsers(users);
        
        res.json({
            status: 'success',
            message: 'User created successfully',
            user: {
                username,
                role: 'user',
                services: [],
                joinDate: users[username].joinDate
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create user'
        });
    }
});

// Endpoint for resellers to get sessions
app.get('/reseller/sessions', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                resellerUsername = user;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can view sessions.'
            });
        }
        
        // Get users data to check which users were created by this reseller
        const users = getUsers();
        const usersCreatedByReseller = new Set(
            Object.entries(users)
                .filter(([_, userData]) => userData.createdBy === resellerUsername)
                .map(([username]) => username)
        );
        
        // Get session history
        const sessionHistory = getSessionHistory();
        
        // Filter sessions to only include those from users created by this reseller
        const filteredSessions = sessionHistory.filter(session => 
            usersCreatedByReseller.has(session.userName)
        );
        
        // Add current active sessions
        Object.entries(sessions).forEach(([username, sessionData]) => {
            if (usersCreatedByReseller.has(username)) {
                const currentSession = {
                    id: sessionData.sessionId,
                    userName: username,
                    userRole: sessionData.role,
                    loginTime: sessionData.loginTime,
                    logoutTime: null,
                    duration: Date.now() - new Date(sessionData.loginTime).getTime(),
                    status: 'Active',
                    ipAddress: sessionData.ipAddress,
                    device: sessionData.device,
                    browser: sessionData.browser
                };
                filteredSessions.push(currentSession);
            }
        });
        
        // Sort sessions by login time, most recent first
        filteredSessions.sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        
        res.json(filteredSessions);
    } catch (error) {
        console.error('Error in /reseller/sessions:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch sessions'
        });
    }
});

// Endpoint for resellers to get session history
app.get('/reseller/session-history', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                resellerUsername = user;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can view session history.'
            });
        }
        
        // Get users data to check which users were created by this reseller
        const users = getUsers();
        const usersCreatedByReseller = new Set(
            Object.entries(users)
                .filter(([_, userData]) => userData.createdBy === resellerUsername)
                .map(([username]) => username)
        );
        
        // Get session history
        const sessionHistory = getSessionHistory();
        
        // Filter sessions to only include those from users created by this reseller
        // and ensure we properly handle different field names
        const filteredHistory = sessionHistory
            .filter(session => {
                const username = session.userName || session.username;
                return usersCreatedByReseller.has(username);
            })
            .map(session => {
                // Normalize the session data to ensure consistent field names
                return {
                    id: session.id || session.sessionId,
                    userName: session.userName || session.username,
                    userRole: session.userRole || session.role || 'User',
                    loginTime: session.loginTime,
                    logoutTime: session.logoutTime,
                    status: session.status || (session.logoutTime ? 'Ended' : 'Active'),
                    ipAddress: session.ipAddress || 'Unknown',
                    device: session.device || 'Unknown',
                    browser: session.browser || 'Unknown'
                };
            });
        
        // Sort by login time, most recent first
        filteredHistory.sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));
        
        res.json(filteredHistory);
    } catch (error) {
        console.error('Error in /reseller/session-history:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch session history'
        });
    }
});

// Endpoint for resellers to terminate a user's session
app.post('/reseller/terminate-session', (req, res) => {
    try {
        const { username, sessionId } = req.body;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const resellerSessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const user in sessions) {
            if (sessions[user].sessionId === resellerSessionId && sessions[user].role === 'reseller') {
                isReseller = true;
                resellerUsername = user;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can terminate sessions.'
            });
        }
        
        // Get users data to verify ownership
        const users = getUsers();
        if (!users[username] || users[username].createdBy !== resellerUsername) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized. You can only terminate sessions for users you created.'
            });
        }
        
        // Check if the session exists and belongs to the specified user
        if (!sessions[username] || sessions[username].sessionId !== sessionId) {
            return res.status(404).json({
                status: 'error',
                message: 'Session not found or already terminated'
            });
        }
        
        // Add to session history before terminating
        const sessionHistory = getSessionHistory();
        const terminatedSession = {
            ...sessions[username],
            userName: username,
            logoutTime: new Date().toISOString(),
            duration: Date.now() - new Date(sessions[username].loginTime).getTime(),
            status: 'Terminated'
        };
        sessionHistory.push(terminatedSession);
        saveSessionHistory(sessionHistory);
        
        // Remove the session
        delete sessions[username];
        saveSessions(sessions);
        
        res.json({
            status: 'success',
            message: 'Session terminated successfully'
        });
    } catch (error) {
        console.error('Error in /reseller/terminate-session:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to terminate session'
        });
    }
});

// Alternative endpoint for session termination
app.post('/reseller/terminate', (req, res) => {
    try {
        const { username, sessionId } = req.body;
        
        // Get the reseller's username from the session
        const resellerSessionId = req.headers.authorization?.split(' ')[1];
        const sessions = getSessions();
        const resellerUsername = Object.keys(sessions).find(key => sessions[key].sessionId === resellerSessionId);
        
        if (!resellerUsername || !sessions[resellerUsername] || sessions[resellerUsername].role !== 'reseller') {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        
        // Check if the user belongs to this reseller
        const users = getUsers();
        if (!users[username] || users[username].createdBy !== resellerUsername) {
            return res.status(403).json({ error: 'Unauthorized access to this user' });
        }
        
        // Check if session exists
        if (!sessions[username] || sessions[username].sessionId !== sessionId) {
            return res.status(404).json({ error: 'Session not found or already terminated' });
        }
        
        // Remove from active sessions
        delete sessions[username];
        saveSessions(sessions);
        
        // Update session history
        const sessionHistory = getSessionHistory();
        sessionHistory.forEach(session => {
            if (session.username === username && session.sessionId === sessionId && session.status === "active") {
                session.status = "terminated";
                session.logoutTime = new Date().toISOString();
            }
        });
        saveSessionHistory(sessionHistory);
        
        // Notify via WebSocket if available
        if (activeSockets[sessionId]) {
            activeSockets[sessionId].send(JSON.stringify({ 
                action: "force_logout",
                message: "Your session has been terminated by your reseller"
            }));
        }
        
        res.json({ 
            status: 'success', 
            message: `Session for ${username} has been terminated` 
        });
    } catch (error) {
        console.error('Error in reseller session termination:', error);
        res.status(500).json({ error: 'Failed to terminate session' });
    }
});

// Endpoint for resellers to get their profile
app.get('/reseller/profile', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can access this endpoint.'
            });
        }
        
        // Get users data
        const users = getUsers();
        const resellerData = users[resellerUsername];
        
        if (!resellerData) {
            return res.status(404).json({
                status: 'error',
                message: 'Reseller profile not found'
            });
        }
        
        // Construct full URL for profile picture if it exists
        let profilePicture = null;
        if (resellerData.profilePicture) {
            // Get server's base URL (protocol + host)
            const protocol = req.protocol;
            const host = req.get('host');
            profilePicture = `${protocol}://${host}/${resellerData.profilePicture}`;
        }
        
        // Return reseller profile data
        res.json({
            status: 'success',
            displayName: resellerData.fullName || resellerUsername,
            email: resellerData.email || '',
            profilePicture: profilePicture,
            preferences: resellerData.preferences || {
                emailNotifications: true,
                serviceUpdates: true,
                userActivity: true,
                darkMode: true
            }
        });
    } catch (error) {
        console.error('Error fetching reseller profile:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch profile'
        });
    }
});

// Endpoint for resellers to change their password
app.post('/reseller/change-password', (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can change their password.'
            });
        }
        
        // Get users data
        const users = getUsers();
        const resellerData = users[resellerUsername];
        
        if (!resellerData) {
            return res.status(404).json({
                status: 'error',
                message: 'Reseller profile not found'
            });
        }
        
        // Verify current password
        if (resellerData.password !== currentPassword) {
            return res.status(401).json({
                status: 'error',
                message: 'Current password is incorrect'
            });
        }
        
        // Update password
        users[resellerUsername].password = newPassword;
        saveUsers(users);
        
        res.json({
            status: 'success',
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Error changing reseller password:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to change password'
        });
    }
});

// Ensure upload directories exist for profile pictures
const profilePicsDir = path.join(__dirname, 'uploads', 'profile-pictures');
if (!fs.existsSync(profilePicsDir)) {
    fs.mkdirSync(profilePicsDir, { recursive: true });
}

// Update multer configuration to handle profile pictures
const profilePicStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'profilePicture') {
            cb(null, profilePicsDir);
        } else {
            cb(null, path.join(__dirname, 'uploads'));
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Create multer instance for profile pictures
const uploadProfilePic = multer({ 
    storage: profilePicStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Endpoint for resellers to upload profile picture
app.post('/reseller/upload-profile-picture', uploadProfilePic.single('profilePicture'), async (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can upload profile pictures.'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No file uploaded'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Save file path to user data
        const filePath = `uploads/profile-pictures/${req.file.filename}`;
        users[resellerUsername].profilePicture = filePath;
        saveUsers(users);
        
        // Construct full URL for profile picture
        const protocol = req.protocol;
        const host = req.get('host');
        const fullProfilePictureUrl = `${protocol}://${host}/${filePath}`;
        
        res.json({
            status: 'success',
            message: 'Profile picture uploaded successfully',
            profilePicture: fullProfilePictureUrl
        });
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to upload profile picture'
        });
    }
});

// Endpoint for resellers to remove their profile picture
app.post('/reseller/remove-profile-picture', (req, res) => {
    try {
        // Get the session ID from request headers
        const authHeader = req.headers.authorization || '';
        const sessionId = authHeader.replace('Bearer ', '');
        
        // Verify that the request is from a reseller
        const sessions = getSessions();
        let isReseller = false;
        let resellerUsername = '';
        
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId && sessions[username].role === 'reseller') {
                isReseller = true;
                resellerUsername = username;
                break;
            }
        }
        
        if (!isReseller) {
            return res.status(403).json({ 
                status: 'error',
                message: 'Unauthorized access. Only resellers can remove their profile picture.'
            });
        }
        
        // Get users data
        const users = getUsers();
        
        // Check if user has a profile picture
        if (!users[resellerUsername].profilePicture) {
            return res.status(400).json({
                status: 'error',
                message: 'No profile picture to remove'
            });
        }
        
        // Get the file path
        const filePath = path.join(__dirname, users[resellerUsername].profilePicture);
        
        // Remove the file if it exists
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error('Error deleting profile picture file:', err);
                // Continue even if file deletion fails
            }
        }
        
        // Remove profile picture from user data
        users[resellerUsername].profilePicture = null;
        saveUsers(users);
        
        res.json({
            status: 'success',
            message: 'Profile picture removed successfully'
        });
    } catch (error) {
        console.error('Error removing profile picture:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to remove profile picture'
        });
    }
});

// Set up multer for file uploads if not already defined
if (typeof multer === 'undefined') {
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');

    // Ensure upload directories exist
    const uploadDir = path.join(__dirname, 'uploads');
    const profilePicsDir = path.join(uploadDir, 'profile-pictures');

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    if (!fs.existsSync(profilePicsDir)) {
        fs.mkdirSync(profilePicsDir, { recursive: true });
    }

    // Configure storage
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            if (file.fieldname === 'profilePicture') {
                cb(null, profilePicsDir);
            } else {
                cb(null, uploadDir);
            }
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, file.fieldname + '-' + uniqueSuffix + ext);
        }
    });

    // Create multer instance
    const upload = multer({ 
        storage: storage,
        limits: {
            fileSize: 5 * 1024 * 1024 // 5MB limit
        },
        fileFilter: function (req, file, cb) {
            // Accept images only
            if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
                return cb(new Error('Only image files are allowed!'), false);
            }
            cb(null, true);
        }
    });

    // Serve static files from uploads directory
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log('Serving static files from:', path.join(__dirname, 'uploads'));

// Fix duplicate code
if (!fs.existsSync(profilePicsDir)) {
    fs.mkdirSync(profilePicsDir, { recursive: true });
    console.log('Created profile pictures directory');
}

// Create directory for session files
const sessionFilesDir = path.join(__dirname, 'uploads', 'session-files');
if (!fs.existsSync(sessionFilesDir)) {
    fs.mkdirSync(sessionFilesDir, { recursive: true });
    console.log('Created session files directory');
}

// Endpoint for uploading session files - store directly on server without R2
app.post('/api/sessions/upload', upload.single('sessionFile'), async (req, res) => {
    try {
        console.log('📤 Session file upload request received');
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded' 
            });
        }
        
        console.log(`📄 Received file: ${req.file.originalname} (${req.file.size} bytes)`);
        
        // Save file to session files directory
        const localFilePath = path.join(sessionFilesDir, req.file.originalname);
        fs.copyFileSync(req.file.path, localFilePath);
        console.log(`💾 Saved session file to: ${localFilePath}`);
        
        res.status(200).json({ 
            success: true, 
            message: 'Session file uploaded successfully',
            filename: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('❌ Session upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload session file',
            error: error.message
        });
    }
});

// Endpoint for downloading session files - serve directly from server
app.get('/api/sessions/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log(`📥 Session file download request received for: ${filename}`);
        
        // Check if file exists
        const filePath = path.join(sessionFilesDir, filename);
        
        if (fs.existsSync(filePath)) {
            console.log(`📂 Found session file: ${filePath}`);
            const fileContent = fs.readFileSync(filePath);
            res.setHeader('Content-Type', 'application/json');
            res.status(200).send(fileContent);
        } else {
            console.error(`❌ Session file not found: ${filename}`);
            res.status(404).json({ 
                success: false, 
                message: 'Session file not found'
            });
        }
    } catch (error) {
        console.error('❌ Session download error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to download session file',
            error: error.message
        });
    }
});

// Endpoint to list available session files
app.get('/api/sessions/list', async (req, res) => {
    try {
        console.log('📋 Session files list request received');
        
        // Get files from session directory
        let files = [];
        if (fs.existsSync(sessionFilesDir)) {
            const localFiles = fs.readdirSync(sessionFilesDir);
            files = localFiles
                .filter(file => file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    size: fs.statSync(path.join(sessionFilesDir, file)).size,
                    lastModified: fs.statSync(path.join(sessionFilesDir, file)).mtime
                }));
        }
        
        res.status(200).json({
            success: true,
            files: files
        });
    } catch (error) {
        console.error('❌ Session list error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list session files',
            error: error.message
        });
    }
});

// Endpoint for uploading session files as JSON (fallback for when FormData fails)
app.post('/api/sessions/upload-json', async (req, res) => {
    try {
        console.log('📤 JSON Session file upload request received');
        
        const { filename, content } = req.body;
        
        if (!filename || !content) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing filename or content' 
            });
        }
        
        console.log(`📄 Received JSON data for file: ${filename}`);
        
        // Save file to session files directory
        const localFilePath = path.join(sessionFilesDir, filename);
        fs.writeFileSync(localFilePath, content);
        console.log(`💾 Saved session file to: ${localFilePath}`);
        
        res.status(200).json({ 
            success: true, 
            message: 'Session file uploaded successfully via JSON',
            filename: filename,
            size: content.length
        });
    } catch (error) {
        console.error('❌ JSON Session upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload session file',
            error: error.message
        });
    }
});

// Add these update-related endpoints before the error handling middleware
// This needs to go before the error handling middleware and after existing endpoints

// Define the updates directory path
const updatesDirectory = path.join(__dirname, 'updates');
const updatesHistoryPath = path.join(updatesDirectory, 'updates_history.json');

// Create updates directory if it doesn't exist
if (!fs.existsSync(updatesDirectory)) {
    fs.mkdirSync(updatesDirectory, { recursive: true });
    console.log(`✅ Created updates directory at: ${updatesDirectory}`);
}

// Initialize updates history file if it doesn't exist
if (!fs.existsSync(updatesHistoryPath)) {
    fs.writeFileSync(updatesHistoryPath, JSON.stringify([], null, 2));
    console.log(`✅ Created updates history file at: ${updatesHistoryPath}`);
}

// Helper function to read updates history
function getUpdatesHistory() {
    try {
        if (fs.existsSync(updatesHistoryPath)) {
            return JSON.parse(fs.readFileSync(updatesHistoryPath, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Error reading updates history:', error);
        return [];
    }
}

// Helper function to save updates history
function saveUpdatesHistory(history) {
    try {
        fs.writeFileSync(updatesHistoryPath, JSON.stringify(history, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving updates history:', error);
        return false;
    }
}

// Endpoint to get updates history
app.get('/updates/history', (req, res) => {
    try {
        const history = getUpdatesHistory();
        res.json(history);
    } catch (error) {
        console.error('Error getting updates history:', error);
        res.status(500).json({ error: 'Failed to get updates history' });
    }
});

// Helper function to get session by ID
function getSessionById(sessionId) {
    if (!sessionId) return null;
    
    const sessions = getSessions();
    for (const username in sessions) {
        if (sessions[username].sessionId === sessionId) {
            return {
                ...sessions[username],
                username
            };
        }
    }
    
    return null;
}

// Modify the upload update endpoint to also save to history
app.post('/admin/upload-update', updateUpload.single('updateFile'), async (req, res) => {
    try {
        console.log('Received update upload request with file size:', req.file ? req.file.size : 'unknown');
        const { version, platform, architecture, releaseNotes } = req.body;
        const updateFile = req.file;
        const updateLatestJson = req.body.updateLatestJson;
        
        // Verify authentication
        const sessionId = req.body.sessionId;
        const session = getSessionById(sessionId);
        if (!session || session.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized. Admin privileges required.'
            });
        }
        
        // Validate inputs
        if (!version || !platform || !architecture || !updateFile) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }
        
        // Create platform-specific directory
        const platformDir = path.join(updatesDirectory, platform, architecture);
        fs.mkdirSync(platformDir, { recursive: true });
        
        // Get the file extension from original file
        const fileExt = path.extname(updateFile.originalname);
        
        // Generate new filename with app name and version
        const filename = `venzell-${version}${fileExt}`;
        const filePath = path.join(platformDir, filename);
        
        // If file exists, delete it first
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        console.log(`Moving file from ${updateFile.path} to ${filePath}, size: ${updateFile.size} bytes`);
        
        // Move the uploaded file with the new name
        fs.renameSync(updateFile.path, filePath);
        
        // Create download URL using the production server URL
        // Ensure SERVER_URL is properly formatted
        let baseServerUrl = SERVER_URL;
        if (!baseServerUrl.startsWith('http')) {
            baseServerUrl = `http://${baseServerUrl}`;
        }
        // Remove any trailing slash
        baseServerUrl = baseServerUrl.replace(/\/$/, '');
        const downloadUrl = `${baseServerUrl}/updates/${platform}/${architecture}/${filename}`;
        
        console.log(`Generated download URL: ${downloadUrl}`);
        
        // Add to update history
        const history = getUpdatesHistory();
        history.push({
            version,
            platform,
            architecture,
            releaseDate: new Date().toISOString(),
            releaseNotes: releaseNotes || `Version ${version} update`,
            downloadUrl,
            status: 'Available',
            fileName: filename
        });
        saveUpdatesHistory(history);
        
        // Update latest.json if requested
        if (updateLatestJson === 'true') {
            const latestJsonPath = path.join(updatesDirectory, 'latest.json');
            let latestData = {};
            
            if (fs.existsSync(latestJsonPath)) {
                try {
                    latestData = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
                } catch (err) {
                    console.error('Error reading latest.json:', err);
                }
            }
            
            // Update the latest.json data with the production server URL
            latestData.version = version;
            latestData.releaseDate = new Date().toISOString();
            latestData.releaseNotes = releaseNotes || `Version ${version} release`;
            latestData.downloadUrl = downloadUrl;
            
            // Add/update platform information
            if (!latestData.platforms) latestData.platforms = {};
            latestData.platforms[`${platform}-${architecture}`] = {
                updateFile: filename,
                downloadUrl: downloadUrl
            };
            
            // Write updated latest.json
            try {
                fs.writeFileSync(latestJsonPath, JSON.stringify(latestData, null, 2));
                console.log(`✅ Updated latest.json to version ${version}`);
                console.log(`📊 Content: ${JSON.stringify(latestData)}`);
            } catch (writeError) {
                console.error(`❌ Error writing latest.json: ${writeError.message}`);
            }
            
            // Also update version.json to maintain consistency
            const versionJsonPath = path.join(updatesDirectory, 'version.json');
            const versionData = {
                version: version,
                releaseDate: new Date().toISOString(),
                downloadUrl: downloadUrl,
                notes: releaseNotes || `Version ${version} release`
            };
            
            try {
                fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));
                console.log(`✅ Updated version.json to version ${version}`);
                console.log(`📊 Content: ${JSON.stringify(versionData)}`);
            } catch (writeError) {
                console.error(`❌ Error writing version.json: ${writeError.message}`);
            }
        }
        
        res.json({ 
            status: 'success', 
            message: 'Update file uploaded successfully',
            version,
            filename,
            downloadUrl,
            latestJsonUpdated: updateLatestJson === 'true'
        });
    } catch (error) {
        console.error('Error uploading update file:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to upload update file',
            error: error.message
        });
    }
});

// Endpoint to delete an update
app.delete('/updates/:version/:platform', (req, res) => {
    try {
        const { version, platform } = req.params;
        
        // Get updates history
        const history = getUpdatesHistory();
        
        // Find the update to delete
        const updateIndex = history.findIndex(update => 
            update.version === version && update.platform === platform
        );
        
        if (updateIndex === -1) {
            return res.status(404).json({
                status: 'error',
                message: 'Update not found'
            });
        }
        
        const update = history[updateIndex];
        
        // Delete the actual file
        const filePath = path.join(updatesDirectory, platform, update.architecture, update.fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        // Remove from history
        history.splice(updateIndex, 1);
        saveUpdatesHistory(history);
        
        res.json({
            status: 'success',
            message: 'Update deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting update:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete update'
        });
    }
});

// Endpoint to get latest version information
app.get('/updates/latest.json', (req, res) => {
    try {
        // Set headers to prevent caching
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        console.log(`🔍 Received request for /updates/latest.json from ${req.ip} with query: ${JSON.stringify(req.query)}`);
        
        // Path to files
        const latestJsonPath = path.join(updatesDirectory, 'latest.json');
        const versionFilePath = path.join(updatesDirectory, 'version.json');
        
        // Check if latest.json exists
        if (fs.existsSync(latestJsonPath)) {
            // We prefer latest.json because it contains platform-specific information
            const fileContent = fs.readFileSync(latestJsonPath, 'utf8');
            try {
                const latestInfo = JSON.parse(fileContent);
                console.log(`✅ Serving latest.json: Version ${latestInfo.version}`);
                console.log(`📊 Content: ${JSON.stringify(latestInfo)}`);
                res.json(latestInfo);
                return;
            } catch (parseError) {
                console.error(`❌ Error parsing latest.json: ${parseError.message}`);
                console.log(`📄 Raw content: ${fileContent}`);
                // Continue to try version.json
            }
        } else {
            console.log(`❌ latest.json not found at: ${latestJsonPath}`);
        }
        
        // Fallback to version.json if latest.json doesn't exist or has parsing issues
        if (fs.existsSync(versionFilePath)) {
            const fileContent = fs.readFileSync(versionFilePath, 'utf8');
            try {
                const versionInfo = JSON.parse(fileContent);
                console.log(`✅ Serving version.json: Version ${versionInfo.version}`);
                console.log(`📊 Content: ${JSON.stringify(versionInfo)}`);
                res.json(versionInfo);
                return;
            } catch (parseError) {
                console.error(`❌ Error parsing version.json: ${parseError.message}`);
                console.log(`📄 Raw content: ${fileContent}`);
                // Fall through to default version
            }
        } else {
            console.log(`❌ version.json not found at: ${versionFilePath}`);
        }
        
        // Create default version file if neither exists
        const defaultVersion = {
            version: '1.0.0', // Initial version
            releaseDate: new Date().toISOString(),
            downloadUrl: `${req.protocol}://${req.get('host')}/updates/download/1.0.0`,
            notes: "Initial release"
        };
        
        console.log(`⚠️ No version files found, creating default version: ${defaultVersion.version}`);
        
        // Save both files with default version
        fs.writeFileSync(versionFilePath, JSON.stringify(defaultVersion, null, 2));
        fs.writeFileSync(latestJsonPath, JSON.stringify({
            ...defaultVersion,
            platforms: {}
        }, null, 2));
        
        console.log('✅ Created default version files');
        res.json(defaultVersion);
    } catch (error) {
        console.error('❌ Error getting version information:', error);
        res.status(500).json({ error: 'Failed to get version information' });
    }
});

// Endpoint to update version information (admin only)
app.post('/admin/update-version', (req, res) => {
    try {
        const { version, notes, downloadUrl } = req.body;
        const sessionId = req.body.sessionId;
        
        // Verify admin privileges
        const sessions = getSessions();
        let isAdmin = false;
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'admin') {
                isAdmin = true;
                break;
            }
        }
        
        if (!isAdmin) {
            return res.status(403).json({ 
                status: 'error', 
                message: 'Unauthorized. Only admins can update version information.' 
            });
        }
        
        // Validate version format (semver)
        if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Invalid version format. Use semantic versioning (e.g., 1.2.3).' 
            });
        }
        
        // Create version info object
        const versionInfo = {
            version,
            releaseDate: new Date().toISOString(),
            downloadUrl: downloadUrl || `${req.protocol}://${req.get('host')}/updates/download/${version}`,
            notes: notes || `Version ${version} release`
        };
        
        // Save version info to file
        const versionFilePath = path.join(updatesDirectory, 'version.json');
        fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2));
        
        console.log(`✅ Updated version information to ${version}`);
        res.json({ 
            status: 'success', 
            message: 'Version information updated successfully',
            versionInfo
        });
    } catch (error) {
        console.error('Error updating version information:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to update version information'
        });
    }
});

// Endpoint to serve update downloads
app.get('/updates/download/:version', (req, res) => {
    try {
        const { version } = req.params;
        const filename = `venzell-app-${version}.exe`;
        const filePath = path.join(updatesDirectory, filename);
        
        // Check if file exists
        if (fs.existsSync(filePath)) {
            res.download(filePath, filename);
        } else {
            res.status(404).json({ 
                status: 'error', 
                message: 'Update file not found'
            });
        }
    } catch (error) {
        console.error('Error serving update file:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to serve update file'
        });
    }
});

// Find the updates endpoint code and modify it to support the new structure

// Ensure directories exist for platform-specific updates
app.use('/updates', express.static(path.join(__dirname, 'updates')));

// Create platform-specific directories for updates
const platforms = ['win32', 'darwin', 'linux'];
const architectures = ['x64', 'ia32', 'arm64'];

// Create platform and architecture directories
platforms.forEach(platform => {
    architectures.forEach(arch => {
        const platformArchDir = path.join(__dirname, 'updates', platform, arch);
        if (!fs.existsSync(platformArchDir)) {
            fs.mkdirSync(platformArchDir, { recursive: true });
            console.log(`Created directory: ${platformArchDir}`);
            
            // Create default RELEASES files for each platform
            if (platform === 'win32') {
                fs.writeFileSync(path.join(platformArchDir, 'RELEASES'), '');
            } else if (platform === 'darwin') {
                fs.writeFileSync(
                    path.join(platformArchDir, 'RELEASES.json'), 
                    JSON.stringify({ releases: [] })
                );
            }
        }
    });
});

// Update the /admin/upload-update endpoint to handle platform-specific uploads
app.post('/admin/upload-update', updateUpload.single('updateFile'), async (req, res) => {
    try {
        // Verify admin privileges
        const session = getSessionById(req.body.sessionId);
        if (!session || session.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        console.log(`Processing large file upload with size: ${req.file ? req.file.size : 'unknown'} bytes`);

        // Validate required fields
        const { version, releaseNotes, platform, architecture } = req.body;
        if (!version || !platform || !architecture) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: version, platform, and architecture are required' 
            });
        }

        // Validate version (semver)
        if (!semver.valid(version)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid version format. Must be a valid semantic version (e.g., 1.0.0)' 
            });
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No update file uploaded' });
        }

        // Create platform-specific directory if it doesn't exist
        const platformDir = path.join(__dirname, 'updates', platform, architecture);
        if (!fs.existsSync(platformDir)) {
            fs.mkdirSync(platformDir, { recursive: true });
        }

        // Get file extension
        const fileExt = path.extname(req.file.originalname);
        
        // Generate filename based on version and original extension
        const filename = `app-${version}${fileExt}`;
        const filePath = path.join(platformDir, filename);

        console.log(`Moving file from ${req.file.path} to ${filePath}, size: ${req.file.size} bytes`);

        // Move the uploaded file to the updates directory with the new name
        try {
            // Create a read stream from the source file
            const readStream = fs.createReadStream(req.file.path);
            // Create a write stream to the destination
            const writeStream = fs.createWriteStream(filePath);
            
            // Handle any errors that occur during the streaming process
            readStream.on('error', (err) => {
                console.error('Error reading from source file:', err);
                throw err;
            });
            
            writeStream.on('error', (err) => {
                console.error('Error writing to destination file:', err);
                throw err;
            });
            
            // Return a promise that resolves when the stream is done
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
                readStream.pipe(writeStream);
            });
            
            // Delete the source file after successful move
            fs.unlinkSync(req.file.path);
            
            console.log(`File successfully moved to ${filePath}`);
        } catch (copyError) {
            console.error('Error moving file:', copyError);
            return res.status(500).json({ 
                success: false, 
                message: 'Error saving update file', 
                error: copyError.message 
            });
        }

        // Update RELEASES files according to platform
        if (platform === 'win32') {
            // For Windows, create or update RELEASES file and .nupkg
            // Generate a simple NUPKG entry
            const nupkgFileName = `app-${version}-full.nupkg`;
            const nupkgPath = path.join(platformDir, nupkgFileName);
            
            // Rename the file if it's already a .nupkg, otherwise copy it
            if (fileExt.toLowerCase() === '.nupkg') {
                fs.renameSync(filePath, nupkgPath);
            } else {
                fs.copyFileSync(filePath, nupkgPath);
            }
            
            // Generate RELEASES file content
            const releaseId = crypto.randomBytes(16).toString('hex');
            const releasesContent = `${releaseId} ${nupkgFileName} ${version}`;
            fs.writeFileSync(path.join(platformDir, 'RELEASES'), releasesContent);
        } else if (platform === 'darwin') {
            // For macOS, update the RELEASES.json file
            const releasesPath = path.join(platformDir, 'RELEASES.json');
            let releasesData = { releases: [] };
            
            if (fs.existsSync(releasesPath)) {
                try {
                    releasesData = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));
                } catch (err) {
                    console.error('Error parsing RELEASES.json:', err);
                }
            }
            
            // Add the new release
            releasesData.releases.push({
                version,
                updateTo: {
                    version,
                    pub_date: new Date().toISOString(),
                    notes: releaseNotes || `Update to version ${version}`,
                    name: `Version ${version}`,
                    url: `/updates/${platform}/${architecture}/${filename}`
                }
            });
            
            // Sort releases by version (newest first)
            releasesData.releases.sort((a, b) => 
                semver.compare(b.version, a.version)
            );
            
            // Write back to file
            fs.writeFileSync(releasesPath, JSON.stringify(releasesData, null, 2));
        }

        // Update the latest.json file with the new version info
        const latestData = {
            version,
            releaseDate: new Date().toISOString(),
            releaseNotes: releaseNotes || `Update to version ${version}`,
            platforms: {}
        };

        // Add platform-specific download URLs
        platforms.forEach(plat => {
            architectures.forEach(arch => {
                const platformKey = `${plat}-${arch}`;
                latestData.platforms[platformKey] = {
                    updateUrl: `/updates/${plat}/${arch}/${platform === 'win32' ? 'RELEASES' : 'RELEASES.json'}`,
                    fileUrl: `/updates/${plat}/${arch}/app-${version}${plat === 'win32' ? '.exe' : plat === 'darwin' ? '.zip' : '.AppImage'}`
                };
            });
        });

        // Write the latest.json file
        fs.writeFileSync(
            path.join(__dirname, 'updates', 'latest.json'),
            JSON.stringify(latestData, null, 2)
        );

        // Return success response
        res.json({
            success: true,
            message: 'Update uploaded successfully',
            version,
            filePath: `/updates/${platform}/${architecture}/${filename}`
        });
    } catch (error) {
        console.error('Error handling update upload:', error);
        res.status(500).json({ success: false, message: 'Error uploading update', error: error.message });
    }
});

// Add a dedicated endpoint to serve update files
app.get('/updates/:platform/:architecture/:filename', (req, res) => {
    try {
        const { platform, architecture, filename } = req.params;
        const filePath = path.join(updatesDirectory, platform, architecture, filename);
        
        // Log the file request for debugging
        console.log(`📥 Update file requested: ${platform}/${architecture}/${filename}`);
        console.log(`📂 Looking for file at: ${filePath}`);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.log(`❌ File not found: ${filePath}`);
            return res.status(404).json({
                status: 'error',
                message: 'Update file not found'
            });
        }
        
        console.log(`✅ File found, serving: ${filePath}`);
        
        // Set appropriate headers for download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        // Handle errors
        fileStream.on('error', (error) => {
            console.error('Error streaming update file:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    status: 'error',
                    message: 'Error serving update file'
                });
            }
        });
    } catch (error) {
        console.error('Error serving update file:', error);
        if (!res.headersSent) {
            res.status(500).json({
                status: 'error',
                message: 'Error serving update file'
            });
        }
    }
});

// Add a debug endpoint to check update files
app.get('/debug/update-files', (req, res) => {
    try {
        const result = {
            updatesDirectory: updatesDirectory,
            files: {}
        };
        
        // Check latest.json
        const latestJsonPath = path.join(updatesDirectory, 'latest.json');
        if (fs.existsSync(latestJsonPath)) {
            try {
                result.files.latest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
            } catch (error) {
                result.files.latest = {
                    error: `Failed to parse latest.json: ${error.message}`,
                    raw: fs.readFileSync(latestJsonPath, 'utf8')
                };
            }
        } else {
            result.files.latest = { error: 'File does not exist' };
        }
        
        // Check version.json
        const versionJsonPath = path.join(updatesDirectory, 'version.json');
        if (fs.existsSync(versionJsonPath)) {
            try {
                result.files.version = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            } catch (error) {
                result.files.version = {
                    error: `Failed to parse version.json: ${error.message}`,
                    raw: fs.readFileSync(versionJsonPath, 'utf8')
                };
            }
        } else {
            result.files.version = { error: 'File does not exist' };
        }
        
        // List platform directories
        result.platforms = {};
        try {
            const platforms = fs.readdirSync(updatesDirectory)
                .filter(item => fs.statSync(path.join(updatesDirectory, item)).isDirectory())
                .filter(item => !['logs', 'history'].includes(item));
                
            platforms.forEach(platform => {
                result.platforms[platform] = [];
                try {
                    const architectures = fs.readdirSync(path.join(updatesDirectory, platform))
                        .filter(item => fs.statSync(path.join(updatesDirectory, platform, item)).isDirectory());
                    
                    architectures.forEach(arch => {
                        const archDir = path.join(updatesDirectory, platform, arch);
                        const files = fs.readdirSync(archDir);
                        result.platforms[platform].push({
                            architecture: arch,
                            files: files
                        });
                    });
                } catch (error) {
                    result.platforms[platform] = { error: error.message };
                }
            });
        } catch (error) {
            result.platforms = { error: error.message };
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a utility endpoint to reset/update version files
app.post('/admin/reset-version-files', (req, res) => {
    try {
        const { version, downloadUrl, notes, sessionId } = req.body;
        
        // Basic validation
        if (!version) {
            return res.status(400).json({ error: 'Version is required' });
        }
        
        // Verify admin privileges
        const sessions = getSessions();
        let isAdmin = false;
        
        for (const user in sessions) {
            if (sessions[user].sessionId === sessionId && sessions[user].role === 'admin') {
                isAdmin = true;
                break;
            }
        }
        
        if (!isAdmin) {
            return res.status(403).json({ 
                status: 'error', 
                message: 'Unauthorized. Only admins can update version information.' 
            });
        }
        
        const finalDownloadUrl = downloadUrl || `${SERVER_URL}/updates/download/${version}`;
        const finalNotes = notes || `Version ${version} release`;
        
        // Create version info objects
        const versionData = {
            version,
            releaseDate: new Date().toISOString(),
            downloadUrl: finalDownloadUrl,
            notes: finalNotes
        };
        
        const latestData = {
            ...versionData,
            platforms: {}
        };
        
        // Add dummy entries for common platforms
        ['win32', 'darwin', 'linux'].forEach(platform => {
            ['x64', 'ia32', 'arm64'].forEach(arch => {
                const key = `${platform}-${arch}`;
                latestData.platforms[key] = {
                    updateFile: `app-${version}.exe`,
                    downloadUrl: finalDownloadUrl
                };
            });
        });
        
        // Write files
        const versionJsonPath = path.join(updatesDirectory, 'version.json');
        const latestJsonPath = path.join(updatesDirectory, 'latest.json');
        
        fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));
        fs.writeFileSync(latestJsonPath, JSON.stringify(latestData, null, 2));
        
        console.log(`🔧 Admin manually reset version files to ${version}`);
        
        res.json({
            status: 'success',
            message: `Version files reset to ${version}`,
            versionData,
            latestData
        });
    } catch (error) {
        console.error('❌ Error resetting version files:', error);
        res.status(500).json({ error: error.message });
    }
});