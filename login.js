// login.js
// Add API base URL helper function
function getApiBaseUrl() {
    // Try to get from window.electron if available (for Electron app)
    if (window.electron && window.electron.apiBaseUrl) {
        return window.electron.apiBaseUrl;
    }
    
    // Try to get from window.config if available (for web app)
    if (window.config && window.config.API_BASE_URL) {
        return window.config.API_BASE_URL;
    }
    
    // Fallback to the production URL without port
    return 'http://venzell.skplay.net';
}

// Add a function to get the WebSocket URL
function getWsUrl() {
    // Try to get from window.electron if available (for Electron app)
    if (window.electron && window.electron.wsUrl) {
        return window.electron.wsUrl;
    }
    
    // Try to get from window.config if available (for web app)
    if (window.config && window.config.WS_URL) {
        return window.config.WS_URL;
    }
    
    // Fallback to the production WebSocket URL without port
    return 'ws://venzell.skplay.net';
}

// Debug helper function
function debugNetworkRequest(url, options = {}) {
    console.log(`🔍 DEBUG - Making request to: ${url}`);
    console.log(`🔍 DEBUG - Request options:`, options);
    
    return fetch(url, options)
        .then(response => {
            console.log(`🔍 DEBUG - Response status: ${response.status}`);
            console.log(`🔍 DEBUG - Response headers:`, Object.fromEntries([...response.headers]));
            return response;
        })
        .catch(error => {
            console.error(`🔍 DEBUG - Fetch error:`, error);
            throw error; // Re-throw the error for the caller to handle
        });
}

// Check which login button exists and add the appropriate event listener
document.addEventListener('DOMContentLoaded', function() {
    const loginButton = document.getElementById('loginButton');
    const loginForm = document.getElementById('loginForm');
    
    if (loginButton) {
        loginButton.addEventListener('click', handleLoginButtonClick);
    }
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginFormSubmit);
    }
    
    // Initialize WebSocket connection if there's an active session
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
        connectWebSocket(sessionId);
    }
    
    // Add logout button handler if it exists
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
});

// Main login button handler
async function handleLoginButtonClick(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }

    try {
        console.log(`🔄 Attempting login for user: ${email}`);
        
        const options = {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username: email, password })
        };
        
        const response = await fetch(getApiBaseUrl() + '/auth', options);
        const data = await response.json();
        
        if (!response.ok) {
            // Handle specific error cases
            if (response.status === 403) {
                alert('This account is already logged in on another device. Please log out from other devices first.');
                return;
            }
            throw new Error(data.message || 'Login failed');
        }

        if (data.status === 'success') {
            // Clear any previous data
            localStorage.clear();
            
            // Store new session data
            localStorage.setItem('session_id', data.sessionId);
            localStorage.setItem('user_role', data.role);
            localStorage.setItem('user_email', email);
            localStorage.setItem('username', email);
            
            console.log("✅ Login successful, session established");
            
            // Notify Electron if available
            if (window.electron) {
                window.electron.setMenuByRole(data.role);
                if (window.electron.notifyRoleChange) {
                    window.electron.notifyRoleChange(data.role);
                }
            }

            // Redirect based on role
            setTimeout(() => {
                if (data.role === 'admin') {
                    window.location.href = 'admin.html';
                } else if (data.role === 'reseller') {
                    window.location.href = 'reseller.html';
                } else {
                    window.location.href = 'user.html';
                }
            }, 100);
        } else {
            throw new Error(data.message || 'Login failed');
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        alert(error.message || 'Login failed. Please check your credentials and try again.');
    }
}

// Login form submit handler 
function handleLoginFormSubmit(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        alert('Please enter both username and password.');
        return;
    }
    
    fetch(getApiBaseUrl() + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Clear any previous data
            localStorage.clear();
            
            // Store all necessary data
            localStorage.setItem('session_id', data.sessionId);
            localStorage.setItem('user_role', data.role);
            localStorage.setItem('user_email', username);
            localStorage.setItem('username', username);
            
            console.log("Session data stored:", {
                session_id: data.sessionId,
                user_role: data.role,
                user_email: username,
                username: username
            });
            
            // Notify Electron if available
            if (window.electron) {
                window.electron.setMenuByRole(data.role);
                if (window.electron.notifyRoleChange) {
                    window.electron.notifyRoleChange(data.role);
                }
            }
            
            // Connect to WebSocket for session monitoring
            connectWebSocket(data.sessionId);
            
            // Redirect with a small delay to ensure localStorage is saved
            setTimeout(() => {
                if (data.role === 'admin') {
                    window.location.href = 'admin.html';
                } else if (data.role === 'reseller') {
                    window.location.href = 'reseller.html';
                } else {
                    window.location.href = 'user.html';
                }
            }, 100);
        } else {
            alert('Login failed: ' + (data.message || 'Invalid credentials'));
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            alert('Network error: Cannot connect to server');
        } else {
            alert('Login failed. Please try again.');
        }
    });
}

// Logout handler
function handleLogout() {
    const sessionId = localStorage.getItem('session_id');
    const username = localStorage.getItem('username');
    const apiUrl = getApiBaseUrl();

    // Log the attempt
    console.log('Attempting to logout...');

    // First, try to close WebSocket connection if it exists
    if (typeof ws !== 'undefined' && ws) {
        try {
            ws.close();
            console.log('WebSocket connection closed');
        } catch (e) {
            console.error('Error closing WebSocket:', e);
        }
    }

    // Show loading indicator if available
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
        logoutBtn.disabled = true;
    }

    // Prepare the request to server logout endpoint
    const requestOptions = {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': sessionId ? `Bearer ${sessionId}` : ''
        },
        body: JSON.stringify({ 
            sessionId: sessionId,
            username: username,
            timestamp: new Date().toISOString()
        })
    };

    // Try to call the server logout endpoint with retry mechanism
    const callServerLogout = (retryCount = 0) => {
        console.log(`Attempting server logout (attempt ${retryCount + 1})...`);
        
        // Try the primary endpoint first
        fetch(`${apiUrl}/logout`, requestOptions)
            .then(response => {
                console.log('Logout response status:', response.status);
                
                if (response.ok) {
                    return response.json().then(data => {
                        console.log('Server logout successful:', data);
                        performLocalCleanup();
                    });
                } else if (response.status === 404 && retryCount < 1) {
                    // If first attempt fails, try the auth/signout endpoint as fallback
                    console.log('Primary logout endpoint not found, trying fallback...');
                    fetch(`${apiUrl}/auth/signout`, requestOptions)
                        .then(fallbackResponse => {
                            console.log('Fallback logout response:', fallbackResponse.status);
                            performLocalCleanup();
                        })
                        .catch(fallbackError => {
                            console.error('Fallback logout error:', fallbackError);
                            performLocalCleanup();
                        });
                } else {
                    // If all server attempts fail, just do local cleanup
                    console.warn('Server logout failed, performing local cleanup only');
                    performLocalCleanup();
                }
            })
            .catch(error => {
                console.error('Logout request error:', error);
                
                // Retry once if it's a network error
                if (retryCount < 2 && error.message.includes('Failed to fetch')) {
                    console.log(`Retrying logout in 1 second... (${retryCount + 1}/2)`);
                    setTimeout(() => callServerLogout(retryCount + 1), 1000);
                } else {
                    console.warn('Server logout failed after retries, performing local cleanup only');
                    performLocalCleanup();
                }
            });
    };

    // Function to perform local cleanup
    const performLocalCleanup = () => {
        console.log('Performing local cleanup...');
        try {
            // Clear all storage
            localStorage.clear();
            sessionStorage.clear();
            
            // Clear all cookies
            document.cookie.split(";").forEach(function(c) {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
            
            console.log('Local cleanup completed');
        } catch (e) {
            console.error('Error during local cleanup:', e);
        } finally {
            // Always redirect to login page
            console.log('Redirecting to login page...');
            window.location.href = 'login-popup.html';
        }
    };

    // Start the logout process
    callServerLogout();
}

// Add WebSocket connection for force logout handling
let ws;

function connectWebSocket(sessionId) {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
        if (!sessionId) {
            console.error('Cannot connect WebSocket: No session ID provided');
            return;
        }
        
        console.log(`Connecting WebSocket with session ID: ${sessionId}`);
        ws = new WebSocket(getWsUrl());
        
        ws.onopen = () => {
            console.log('WebSocket connection established');
            // Register the session
            ws.send(JSON.stringify({
                type: 'register',
                sessionId: sessionId
            }));
        };
        
        ws.onmessage = (event) => {
            console.log('WebSocket message received:', event.data);
            try {
                const data = JSON.parse(event.data);
                
                if (data.action === 'force_logout' || data.type === 'force_logout') {
                    // Check if this force logout is for our session
                    const currentSessionId = localStorage.getItem('session_id');
                    if (!data.targetSessionId || data.targetSessionId === currentSessionId) {
                        console.log('Received force logout command for current session');
                        
                        // Clear local session data
                        localStorage.removeItem('session_id');
                        localStorage.removeItem('user_role');
                        localStorage.removeItem('user_email');
                        localStorage.removeItem('username');
                        
                        // Show notification to user
                        alert(data.message || 'Your session has been terminated by an administrator');
                        
                        // Close WebSocket connection
                        if (ws) {
                            ws.close();
                            ws = null;
                        }
                        
                        // Redirect to login page
                        window.location.href = 'login-popup.html';
                    } else {
                        console.log('Received force logout for different session:', data.targetSessionId);
                    }
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };
        
        ws.onclose = () => {
            console.log('WebSocket connection closed');
            // Only attempt to reconnect if we still have a valid session
            const currentSessionId = localStorage.getItem('session_id');
            if (currentSessionId) {
                setTimeout(() => connectWebSocket(currentSessionId), 5000);
            } else {
                console.log('No session ID found, not reconnecting WebSocket');
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    } else {
        console.log('WebSocket connection already exists');
    }
}

function makeRequest(url, options = {}) {
    const defaultOptions = {
        credentials: 'include', // Include credentials in all requests
        headers: {
            'Content-Type': 'application/json'
        }
    };
    return fetch(url, { ...defaultOptions, ...options })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        });
} 