// Add this at the top of admin.js
// Safe process access through the electron API
const process = window.electron?.process || { env: {} };

// Function to get API base URL - ALWAYS USE PRODUCTION
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

// ... existing code ...
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

// Update existing fetch calls to use await or .then with getApiBaseUrl()
async function updateDashboardStats() {
    try {
        const apiUrl = await getApiBaseUrl();
        console.log(`Fetching dashboard stats from: ${apiUrl}/admin/dashboard-stats`);
        
        makeRequest(`${apiUrl}/admin/dashboard-stats`)
            .then(data => {
                // Update stats display with the data
                updateDashboardCounters(data);
            })
            .catch(error => {
                console.error('Error fetching dashboard stats:', error);
                showNotification('Failed to load dashboard statistics', 'error');
            });
    } catch (error) {
        console.error('API URL error:', error);
        showNotification('API configuration error', 'error');
    }
}

// Function to fetch all users and their assigned services
function loadUsers() {
    const manageUsersList = document.getElementById('manageUsersList');
    manageUsersList.innerHTML = ''; // Clear existing rows

    makeRequest(getApiBaseUrl() + '/admin/users')
        .then(users => {
            // Populate the table with new user data
            for (const user in users) {
                const tr = document.createElement('tr');
                const userServices = users[user].services ? users[user].services.join(", ") : "No services assigned";
                
                manageUsersList.appendChild(tr);
            }

            // Add event listeners to dropdowns
            document.querySelectorAll('.service-dropdown').forEach(dropdown => {
                dropdown.addEventListener('change', handleServiceSelection);
            });
        })
        .catch(err => console.error('Error loading users:', err));
}

function loadAllUsers() {
    makeRequest(getApiBaseUrl() + '/admin/users')
        .then(users => {
            const tableBody = document.getElementById('userList');
            tableBody.innerHTML = '';

            Object.entries(users).forEach(([username, user]) => {
                const tr = document.createElement('tr');
                
                tr.innerHTML = `
                    <td>
                        <div class="user-info">
                            <span class="user-name">${username}</span>
                        </div>
                    </td>
                    <td>${user.role || 'User'}</td>
                    <td>${formatLastActive(user.joinDate)}</td>
                    <td>${formatLastActive(user.lastActiveTime)}</td>
                    <td>
                        <span class="user-status ${user.isActive ? 'status-active' : 'status-inactive'}">
                            ${user.isActive ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>${user.services?.join(', ') || 'No services'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="table-action-btn" onclick="showUserDetails('${username}', ${JSON.stringify(user)})">
                                View
                            </button>
                            <button class="table-action-btn delete" onclick="deleteUser('${username}')">
                                Delete
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            // Initialize refresh button functionality
            const refreshButton = document.getElementById('refreshAllUsersTable');
            if (refreshButton) {
                refreshButton.addEventListener('click', function() {
                    this.classList.add('rotating');
                    loadAllUsers();
                    setTimeout(() => {
                        this.classList.remove('rotating');
                    }, 1000);
                });
            }
        })
        .catch(err => console.error('Error loading users:', err));
}

// Helper functions for formatting and display
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return getPakistanTime(dateString);
}

function formatLastActive(user) {
    if (user.isActive) return 'Currently Active';
    if (!user.lastActiveTime) return 'Never Active';
    return `Last active: ${getPakistanTime(user.lastActiveTime)}`;
}

function getStatusDisplay(user) {
    if (user.isActive) return '🟢 Online';
    if (user.sessionHistory && user.sessionHistory.length > 0) return '🔴 Offline';
    return '⚫ Never Connected';
}

function getStatusTooltip(user) {
    if (user.isActive) return 'User is currently online';
    if (user.sessionHistory && user.sessionHistory.length > 0) {
        return `Last session: ${new Date(user.sessionHistory[0].loginTime).toLocaleString()}`;
    }
    return 'User has never logged in';
}

function getActivityTooltip(user) {
    if (!user.sessionHistory || user.sessionHistory.length === 0) {
        return 'No session history available';
    }

    return user.sessionHistory
        .map(session => `
            Login: ${new Date(session.loginTime).toLocaleString()}
            ${session.logoutTime ? `\nLogout: ${new Date(session.logoutTime).toLocaleString()}` : ''}
        `)
        .join('\n\n');
}


// Add some styles for the table
const style = document.createElement('style');
style.textContent = `
    .users-table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
        background-color: #1a0329;
        border-radius: 8px;
        overflow: hidden;
    }

    .users-table th,
    .users-table td {
        padding: 12px 15px;
        text-align: left;
        border-bottom: 1px solid #2a0439;
    }

    .users-table th {
        background-color: #ff0033;
        color: white;
        font-weight: bold;
    }

    .users-table tr:hover {
        background-color: #2a0439;
    }

    .status-badge {
        padding: 5px 10px;
        border-radius: 12px;
        font-size: 0.9em;
    }

    .status-badge.active {
        color: #4CAF50;
    }

    .status-badge.inactive {
        color: #f44336;
    }

    .action-btn {
        padding: 5px 10px;
        margin: 0 5px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: white;
    }

    .view-btn {
        background-color: #2196F3;
    }

    .delete-btn {
        background-color: #f44336;
    }

    .action-btn:hover {
        opacity: 0.8;
    }
`;
document.head.appendChild(style);

// Add some additional styles
const additionalStyle = document.createElement('style');
additionalStyle.textContent = `
    .activity-info {
        font-size: 0.9em;
        color: #888;
        cursor: help;
    }

    .status-badge {
        padding: 5px 10px;
        border-radius: 12px;
        font-size: 0.9em;
        display: inline-block;
        min-width: 80px;
        text-align: center;
    }

    .status-badge.active {
        background-color: rgba(76, 175, 80, 0.1);
        color: #4CAF50;
    }

    .status-badge.inactive {
        background-color: rgba(244, 67, 54, 0.1);
        color: #f44336;
    }
`;
document.head.appendChild(additionalStyle);

// Function to update dashboard statistics with real-time trends
function updateDashboardStats() {
    makeRequest(getApiBaseUrl() + '/api/dashboard/stats')
        .then(data => {
            // Update Users Stats
            updateCardStats('totalUsersCount', data.users.total, data.users.previousTotal);
            updateCardStats('activeUsersCount', data.users.active, data.users.previousActive);
            updateCardStats('newUsersCount', data.users.new, data.users.previousNew);
            updateCardStats('adminUsersCount', data.users.admin, data.users.previousAdmin);

            // Update Services Stats
            updateCardStats('totalServices', data.services.total, data.services.previousTotal);
            updateCardStats('serviceUsers', data.services.activeUsers, data.services.previousActiveUsers);
            updateCardStats('servicesRevenue', data.services.revenue, data.services.previousRevenue, true);
            updateCardStats('avgServiceUsage', data.services.avgUsage, data.services.previousAvgUsage);

            // Update Sessions Stats
            updateCardStats('activeSessions', data.sessions.active, data.sessions.previousActive);
            updateCardStats('totalSessions', data.sessions.total, data.sessions.previousTotal);
            updateCardStats('avgSessionDuration', data.sessions.avgDuration, data.sessions.previousAvgDuration);
            updateCardStats('terminatedSessions', data.sessions.terminated, data.sessions.previousTerminated);
        })
        .catch(error => console.error('Error fetching dashboard stats:', error));
}

// Function to update individual card stats and trends
function updateCardStats(elementId, currentValue, previousValue, isCurrency = false) {
    const valueElement = document.getElementById(elementId);
    const trendElement = valueElement?.closest('.stats-card')?.querySelector('.stats-trend');
    
    if (valueElement) {
        // Update the value
        valueElement.textContent = isCurrency ? 
            `$${currentValue.toLocaleString()}` : 
            currentValue.toLocaleString();

        // Calculate and update trend
        if (trendElement && previousValue) {
            const trendPercentage = calculateTrend(currentValue, previousValue);
            const trendDirection = trendPercentage > 0 ? 'up' : trendPercentage < 0 ? 'down' : 'stable';
            
            trendElement.className = `stats-trend ${trendDirection}`;
            trendElement.innerHTML = `
                <i class="fas fa-arrow-${trendDirection === 'stable' ? 'right' : trendDirection}"></i>
                <span>${Math.abs(trendPercentage)}%</span>
            `;
        }
    }
}

// Function to calculate trend percentage
function calculateTrend(currentValue, previousValue) {
    if (!previousValue) return 0;
    return ((currentValue - previousValue) / previousValue * 100).toFixed(1);
}

// Initialize and set up auto-refresh
document.addEventListener('DOMContentLoaded', () => {
    updateDashboardStats();
    setInterval(updateDashboardStats, 30000); // Update every 30 seconds
});

// Function to handle service selection
function handleServiceSelection(event) {
    const selectedService = event.target.value;
    const username = event.target.getAttribute('data-user');

    if (selectedService) {
        showServiceAccessModal(username, selectedService);
    }
}

// Function to update service access (Grant/Remove)
function updateServiceAccess(user, service) {
    console.log(`Updating service access: User=${user}, Service=${service}`);
    
    // Show loading indicator
    const confirmBtn = document.getElementById('confirmServiceChange');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }
    
    // Get current date in ISO format for assignment date
    const currentDate = new Date().toISOString();
    // Set expiry date to 30 days from now
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    
    // Prepare service details
    const serviceDetails = {
        assignedDate: currentDate,
        expirationDate: expiryDate.toISOString()
    };
    
    makeRequest(getApiBaseUrl() + '/admin/update-service', {
        method: 'POST',
        body: JSON.stringify({ 
            user, 
            service,
            serviceDetails: serviceDetails,
            adminSession: localStorage.getItem('session_id')
        })
    })
    .then(data => {
        console.log('Service update successful:', data);
        
        // Show success notification
        showNotification(data.message || `Service ${service} updated for user ${user}`, 'success');
        
        // Hide the modal
        const servicePopup = document.getElementById('servicePopup');
        if (servicePopup) {
            servicePopup.style.display = 'none';
        }
        
        // Refresh data
        Promise.all([
            loadUsers(),
            loadUserServices(),
            updateServiceStats()
        ]).catch(err => {
            console.warn('Error refreshing data after service update:', err);
        });
    })
    .catch(err => {
        console.error('Error updating service:', err);
        showNotification(`Failed to update service: ${err.message}`, 'error');
        
        // Reset button state if error occurs
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Confirm';
        }
    });
}

// Load users on page load
loadUsers();

// Add this helper function for retrying operations
function retryOperation(operation, retries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
        function attempt() {
            operation()
                .then(resolve)
                .catch((error) => {
                    if (retries === 0) {
                        // If no more retries, fail silently but log the error
                        console.warn('Operation failed after all retries:', error);
                        resolve([]); // Return empty array instead of rejecting
                    } else {
                        retries--;
                        setTimeout(attempt, delay);
                    }
                });
        }
        attempt();
    });
}

// Update the loadActiveSessions function with retry logic
function loadActiveSessions() {
    retryOperation(() => 
        makeRequest(getApiBaseUrl() + "/admin/sessions")
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch sessions');
                }
                return response.json();
            })
    )
    .then(sessions => {
        const sessionList = document.getElementById("sessionList");
        if (!sessionList) return; // Guard clause if element doesn't exist

        sessionList.innerHTML = ""; // Clear previous list

        if (!sessions || Object.keys(sessions).length === 0) {
            sessionList.innerHTML = "<li>No active sessions</li>";
            return;
        }

        Object.keys(sessions).forEach(user => {
            try {
                let loginTime = new Date(sessions[user].loginTime);
                let formattedDate = isNaN(loginTime) ? "Unknown Date" : loginTime.toLocaleString();

                const li = document.createElement("li");
                li.innerHTML = `
                    <strong>User:</strong> ${user} <br>
                    <strong>Active Since:</strong> ${formattedDate}
                    <button class="terminate-session" data-username="${user}">Terminate</button>
                `;

                sessionList.appendChild(li);
            } catch (err) {
                console.warn(`Error processing session for user ${user}:`, err);
                // Continue with other sessions even if one fails
            }
        });

        // Add event listeners for session termination
        document.querySelectorAll(".terminate-session").forEach(button => {
            button.addEventListener("click", function() {
                const username = this.getAttribute('data-username');
                if (username) {
                    terminateSession(username);
                }
            });
        });
    })
    .catch(err => {
        console.warn("Warning: Session loading encountered an issue:", err);
        // Don't show error to user unless critical
        const sessionList = document.getElementById("sessionList");
        if (sessionList && !sessionList.children.length) {
            sessionList.innerHTML = "<li>Loading sessions...</li>";
        }
    });
}

// Update the interval to be more resilient
let sessionRefreshInterval;

function startSessionRefresh() {
    // Clear any existing interval
    if (sessionRefreshInterval) {
        clearInterval(sessionRefreshInterval);
    }

    // Initial load
    loadActiveSessions();

    // Set up new interval - refresh every 3 seconds instead of 10
    sessionRefreshInterval = setInterval(() => {
        loadActiveSessions();
    }, 3000);
}

// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    startSessionRefresh();
});

// Clean up on page unload
window.addEventListener('unload', function() {
    if (sessionRefreshInterval) {
        clearInterval(sessionRefreshInterval);
    }
});

// admin.js

// admin.js

function getSessionHistory() {
    makeRequest(getApiBaseUrl() + '/admin/session-history')
        .then(sessionHistory => {
            const sessionHistoryList = document.getElementById('sessionHistoryList');
            sessionHistoryList.innerHTML = '';  

            sessionHistory.forEach(session => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>${session.username}</strong> (${session.role}) - 
                    <span style="color: ${session.status === "active" ? "green" : "red"}">
                        ${session.status.toUpperCase()}
                    </span> 
                    <br>Login: ${new Date(session.loginTime).toLocaleString()}
                    ${session.logoutTime ? `<br>Logout: ${new Date(session.logoutTime).toLocaleString()}` : ""}
                `;

                // ✅ Only add the "Terminate" button for active sessions
                if (session.status === "active") {
                    const terminateButton = document.createElement("button");
                    terminateButton.innerText = "Terminate";
                    terminateButton.onclick = () => terminateSession(session.username);
                    li.appendChild(terminateButton);
                }

                sessionHistoryList.appendChild(li);
            });
        })
        .catch(err => console.error('Error loading session history:', err));
}

// ✅ Load session history on page load
window.onload = () => {
    getSessionHistory();
};

// The correct implementation of terminateSession that will force logout users
function terminateSession(usernameOrEvent) {
    // Handle both direct username calls and event-based calls
    let username, sessionId;
    
    if (typeof usernameOrEvent === 'string') {
        // Called with username directly
        username = usernameOrEvent;
        console.log(`Terminating session for user: ${username}`);
    } else if (usernameOrEvent && usernameOrEvent.target) {
        // Called from event handler with data-session-id
        sessionId = usernameOrEvent.target.getAttribute('data-session-id');
        console.log(`Terminating session with ID: ${sessionId}`);
    } else {
        console.error("Invalid parameters for terminateSession");
        showNotification("Error: Could not terminate session due to invalid parameters", "error");
        return;
    }
    
    // First, try to get all sessions to find complete information
    makeRequest(getApiBaseUrl() + "/admin/sessions")
        .then(sessions => {
            // If we have a username but no sessionId, find it
            if (username && !sessionId) {
                const userSession = sessions[username];
                if (userSession && userSession.sessionId) {
                    sessionId = userSession.sessionId;
                    console.log(`Found sessionId ${sessionId} for user ${username}`);
                } else {
                    console.warn(`No active session found for user ${username}`);
                }
            }
            
            // If we have a sessionId but no username, find it
            if (sessionId && !username) {
                for (const user in sessions) {
                    if (sessions[user].sessionId === sessionId) {
                        username = user;
                        console.log(`Found username ${username} for session ${sessionId}`);
                        break;
                    }
                }
            }
            
            // If we still don't have both pieces of information, try to proceed with what we have
            if (!username && !sessionId) {
                throw new Error("Could not find session information");
            }
            
            // Show confirmation dialog with the username
            const confirmMessage = `Are you sure you want to terminate the session for ${username || 'this user'}? They will be immediately logged out.`;
            
            if (!confirm(confirmMessage)) {
                console.log('Session termination cancelled by admin');
                return Promise.reject(new Error('Cancelled by user'));
            }
            
            // Prepare the payload with all available information
            const payload = {
                sessionId: sessionId,
                username: username
            };
            
            console.log(`Terminating session with payload:`, payload);
            
            // Show loading notification
            showNotification(`Terminating session for ${username || 'user'}...`, 'info');
            
            // First try the force-logout endpoint which handles WebSocket notifications
            return makeRequest(getApiBaseUrl() + "/admin/force-logout", {
                method: "POST",
                body: JSON.stringify(payload)
            })
            .catch(error => {
                // If force-logout fails, try the regular logout endpoint as fallback
                console.warn("Force logout failed, trying regular logout endpoint:", error);
                return makeRequest(getApiBaseUrl() + "/logout", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
            });
        })
        .then(data => {
            if (data.status === "success") {
                showNotification(`Session for ${username || 'user'} has been terminated successfully`, 'success');
                // Refresh the sessions tables
                updateSessionsTable();
                // Also refresh active sessions list
                loadActiveSessions();
            } else {
                showNotification(`Failed to terminate session: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            if (error.message === 'Cancelled by user') {
                // User cancelled the operation, no need to show error
                return;
            }
            console.error("Error in terminateSession:", error);
            showNotification(`Error terminating session: ${error.message}`, 'error');
        });
}

// Function to add a new user
function addUser() {
    const newUsername = document.getElementById('newUsername').value;
    const newPassword = document.getElementById('newPassword').value;
    const newRole = document.getElementById('newRole').value;
    const fullName = document.getElementById('fullName').value;
    const sessionId = localStorage.getItem('session_id');

    if (!newUsername || !newPassword || !newRole || !fullName) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    makeRequest(getApiBaseUrl() + '/admin/add-user', {
        method: 'POST',
        body: JSON.stringify({
            sessionId,
            newUsername,
            newPassword,
            newRole,
            fullName
        })
    })
    .then(data => {
        if (data.status === 'success') {
            showNotification('User added successfully', 'success');
            closeAddUserModal();
            loadUsers(); // Refresh user list
            document.getElementById('addUserForm').reset();
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Failed to add user', 'error');
    });
}

// Function to delete a user
function deleteUser(username) {
    if (confirm(`Are you sure you want to delete user: ${username}? This action cannot be undone.`)) {
        const sessionId = localStorage.getItem('session_id');

        // Check if user is trying to delete themselves
        makeRequest(getApiBaseUrl() + '/validate-session', {
            method: 'POST',
            body: JSON.stringify({ sessionId })
        })
        .then(data => {
            if (data.user === username) {
                alert("You cannot delete your own account while logged in!");
                return;
            }

            // Proceed with deletion
            return makeRequest(getApiBaseUrl() + '/admin/delete-user', {
                method: 'POST',
                body: JSON.stringify({ sessionId, usernameToDelete: username })
            });
        })
        .then(data => {
            if (data && data.status === 'success') {
                alert("User deleted successfully!");
                loadAllUsers(); // Refresh both lists
            } else if (data) {
                alert(data.message || "Failed to delete user");
            }
        })
        .catch(err => {
            console.error('Error deleting user:', err);
            alert('Error deleting user. Please try again.');
        });
    }
}

// Function to validate session and check admin role
function validateAdminSession() {
    const sessionId = localStorage.getItem('session_id');

    if (!sessionId) {
        window.location.href = 'login-popup.html'; // Redirect if no session
        return;
    }

    makeRequest(getApiBaseUrl() + '/validate-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
    })
    .then(data => {
        if (data.status !== 'success' || data.role !== 'admin') {
            // Redirect non-admins to their appropriate dashboard
            if (data.role === 'reseller') {
                window.location.href = 'reseller.html';
            } else {
                window.location.href = 'home.html';
            }
        } else {
            document.getElementById('admin-info').textContent = `Logged in as: ${data.user} (Admin)`;
        }
    })
    .catch(() => {
        window.location.href = 'login-popup.html'; // Redirect on error
    });
}

// Logout function
document.getElementById('logoutButton').addEventListener('click', function () {
    const sessionId = localStorage.getItem('session_id');
    const apiUrl = getApiBaseUrl();

    // Log the attempt
    console.log('Attempting to logout from admin panel...');

    // Prepare the request
    const requestOptions = {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    // Add Authorization header if we have a session
    if (sessionId) {
        requestOptions.headers['Authorization'] = `Bearer ${sessionId}`;
    }

    // Make the request to logout endpoint
    fetch(`${apiUrl}/auth/signout`, requestOptions)
        .then(response => {
            console.log('Logout response status:', response.status);
            // Even if the server responds with an error, we'll clean up locally
            return response.ok ? response.json() : null;
        })
        .catch(error => {
            console.error('Logout request error:', error);
            // We'll continue with local cleanup even if the request fails
        })
        .finally(() => {
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
            }
            
            // Always redirect to login page
            console.log('Redirecting to login page...');
            window.location.href = 'login-popup.html';
        });
});

// Initialize the dashboard when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initial loads
    loadAllUsers();
    refreshServicesList();
    updateDashboardTimestamp();
    
    // Set up auto-refresh
    setInterval(loadAllUsers, 30000); // Refresh every 30 seconds
    setInterval(refreshServicesList, 30000); // Refresh services every 30 seconds
    setInterval(updateDashboardTimestamp, 1000); // Update timestamp every second

    // Initialize services page when clicked
    const servicesNavItem = document.querySelector('.nav-item[data-page="services"]');
    if (servicesNavItem) {
        servicesNavItem.addEventListener('click', () => {
            refreshServicesList();
        });
    }
});

// Navigation and Page Management
document.addEventListener('DOMContentLoaded', function() {
    const navItems = document.querySelectorAll('.nav-item');
    
    // Function to switch active page
    function switchPage(pageId) {
        // Remove active class from all nav items and pages
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.content-page').forEach(page => page.classList.remove('active'));
        
        // Add active class to selected nav item and page
        const selectedNavItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
        const selectedPage = document.getElementById(`${pageId}-page`);
        
        if (selectedNavItem && selectedPage) {
            selectedNavItem.classList.add('active');
            selectedPage.classList.add('active');
            
            // Execute specific actions for each page when loaded
            switch (pageId) {
                case 'dashboard':
                    updateDashboardCounters();
                    break;
                case 'users':
                    updateTableStyling();
                    break;
                case 'services':
                    refreshServicesList();
                    break;
                case 'sessions':
                    updateSessionsTable();
                    break;
                case 'updates':
                    initializeUpdatesPage();
                    break;
            }
        }
        
        // Store current page in localStorage
        localStorage.setItem('currentAdminPage', pageId);
        // Update URL hash without triggering reload
        history.replaceState(null, null, `#${pageId}`);
    }
    
    // Add click event to each nav item
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const pageId = this.getAttribute('data-page');
            switchPage(pageId);
        });
    });

    // Handle page load and refresh
    function loadCurrentPage() {
        // Check URL hash first, then localStorage, then default to dashboard
        const hashPage = window.location.hash.slice(1);
        const storedPage = localStorage.getItem('currentAdminPage');
        const pageToLoad = hashPage || storedPage || 'dashboard';
        
        // Load initial data based on page
        switch(pageToLoad) {
            case 'users':
                loadAllUsers();
                break;
            case 'services':
                refreshServicesList();
                break;
            case 'dashboard':
                updateDashboardStats();
                break;
            case 'updates':
                initializeUpdatesPage();
                break;
        }
        
        switchPage(pageToLoad);
    }

    // Load correct page on initial load and refresh
    loadCurrentPage();

    // Handle browser back/forward buttons
    window.addEventListener('hashchange', function() {
        loadCurrentPage(); // This will handle both loading data and switching pages
    });
});

// Function to update service statistics
function updateServiceStats() {
    return new Promise((resolve, reject) => {
        makeRequest(getApiBaseUrl() + '/admin/service-stats')
            .then(data => {
                try {
                    // Update total services count
                    const totalServicesEl = document.getElementById('totalServices');
                    const serviceUsersEl = document.getElementById('serviceUsers');
                    
                    if (totalServicesEl) {
                        totalServicesEl.textContent = data.totalServices;
                    }
                    if (serviceUsersEl) {
                        serviceUsersEl.textContent = data.totalActiveUsers;
                    }

                    // Update individual service stats
                    if (data.services) {
                        data.services.forEach(service => {
                            const userCountElement = document.getElementById(`${service.name.toLowerCase()}-users`);
                            if (userCountElement) {
                                userCountElement.textContent = service.activeUsers || 0;
                            }
                        });
                    }

                    resolve();
                } catch (err) {
                    console.error('Error updating service stats DOM:', err);
                    // Don't reject here, as this is a non-critical update
                    resolve();
                }
            })
            .catch(err => {
                console.error('Error loading service stats:', err);
                // Don't reject here, as service stats are non-critical
                resolve();
            });
    });
}

// Initialize service page
document.addEventListener('DOMContentLoaded', function() {
    // Load all services immediately when the page loads
    refreshServicesList();
    
    // Set up auto-refresh intervals
    setInterval(updateServiceStats, 30000);
});

// Add Service Modal Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get modal elements for regular service
    const addServiceModal = document.getElementById('ohServiceModal');
    const addServiceBtn = document.getElementById('addNewServiceBtn'); // Updated ID
    const closeModal = document.querySelector('.close-oh-modal'); // Updated class
    const addServiceForm = document.getElementById('quickServiceForm'); // Updated ID
    const imageInput = document.getElementById('quickServiceLogo'); // Updated ID
    const imagePreview = document.getElementById('quickImagePreview'); // Updated ID

    // Show modal when clicking Add Service button
    if (addServiceBtn) {
        addServiceBtn.addEventListener('click', () => {
            if (addServiceModal) {
                addServiceModal.style.display = 'flex';
                document.body.style.overflow = 'hidden'; // Prevent background scrolling
            }
        });
    }

    // Close modal when clicking X
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            addServiceModal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
            // Reset form and preview
            if (addServiceForm) addServiceForm.reset();
            if (imagePreview) imagePreview.innerHTML = '';
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === addServiceModal) {
            addServiceModal.style.display = 'none';
            document.body.style.overflow = '';
            // Reset form and preview
            if (addServiceForm) addServiceForm.reset();
            if (imagePreview) imagePreview.innerHTML = '';
        }
    });

    // Add ESC key handler for regular service modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && addServiceModal && addServiceModal.style.display === 'flex') {
            addServiceModal.style.display = 'none';
            document.body.style.overflow = '';
            // Reset form and preview
            if (addServiceForm) addServiceForm.reset();
            if (imagePreview) imagePreview.innerHTML = '';
        }
    });

    // Image preview for regular service
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file && imagePreview) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100px;">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Handle form submission
    if (addServiceForm) {
        addServiceForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData();
            const name = document.getElementById('quickServiceName').value;
            let url = document.getElementById('quickServiceUrl').value;
            
            // Add http:// if not present
            if (url && !url.startsWith('http')) {
                url = 'https://' + url;
            }
            
            formData.append('name', name);
            formData.append('url', url);
            formData.append('type', 'regular');
            formData.append('image', imageInput.files[0]);
            
            try {
                const response = await makeRequest(getApiBaseUrl() + '/api/services', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                
                if (response.ok) {
                    addServiceModal.style.display = 'none';
                    addServiceForm.reset();
                    imagePreview.innerHTML = '';
                    document.body.style.overflow = '';
                    
                    // Refresh services list
                    refreshServicesList();
                    
                    alert('Service added successfully!');
                } else {
                    throw new Error(data.error || 'Failed to add service');
                }
            } catch (error) {
                console.error('Error adding service:', error);
                alert(error.message);
            }
        });
    }
});

// Function to refresh the services list
function refreshServicesList() {
    return new Promise((resolve, reject) => {
        // Show loading state
        const servicesGrid = document.querySelector('.services-grid');
        if (!servicesGrid) {
            console.error('Services grid element not found');
            reject(new Error('Services grid element not found'));
            return;
        }
        
        servicesGrid.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i> Loading services...
            </div>
        `;

        // First try API, then fallback to file
        makeRequest(getApiBaseUrl() + '/admin/services')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch services from API');
                }
                return response.json();
            })
            .catch(apiError => {
                console.warn('API fetch failed, falling back to local file:', apiError);
                return makeRequest('services.json').then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch services from local file');
                    }
                    return response.json();
                });
            })
            .then(services => {
                servicesGrid.innerHTML = ''; // Clear loading state
                console.log('Loaded services:', services);

                if (!services || Object.keys(services).length === 0) {
                    servicesGrid.innerHTML = `
                        <div class="no-services">
                            <i class="fas fa-info-circle"></i>
                            No services available. Add your first service!
                        </div>
                    `;
                    resolve(); // Resolve even when no services
                    return;
                }

                // Sort services by name
                const sortedServices = Object.entries(services)
                    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB));

                for (const [serviceName, service] of sortedServices) {
                    try {
                        // Convert service name and data to proper format if needed
                        const processedService = {
                            ...service,
                            name: serviceName
                        };
                        
                        const serviceCard = createServiceCard(serviceName, processedService);
                        servicesGrid.appendChild(serviceCard);
                    } catch (cardError) {
                        console.error(`Error creating card for ${serviceName}:`, cardError);
                    }
                }

                // Update service stats and resolve when done
                updateServiceStats()
                    .then(resolve)
                    .catch(err => {
                        console.error('Error updating stats:', err);
                        resolve(); // Still resolve since stats are non-critical
                    });
            })
            .catch(err => {
                console.error('Error refreshing services:', err);
                servicesGrid.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-circle"></i>
                        Error loading services. Please try again.
                    </div>
                `;
                reject(err); // Reject the promise on error
            });
    });
}

// Helper function to create service card
function createServiceCard(name, service) {
    const card = document.createElement('div');
    card.className = 'service-card';
    
    // Improved image path handling with better prioritization
    let logoPath = '';
    const apiBaseUrl = getApiBaseUrl();
    
    // First check if service has an image property from API
    if (service.image && service.image.trim() !== '') {
        // If it's already a full URL, use it directly
        if (service.image.startsWith('http')) {
            logoPath = service.image;
        } 
        // If it's a timestamp format (uploaded image)
        else if (/^\d+-\d+\.(png|jpg|jpeg|gif)$/i.test(service.image)) {
            logoPath = `${apiBaseUrl}/assets/6 Services logos/${service.image}`;
            console.log(`Using timestamp image path: ${logoPath}`);
        }
        // If it starts with /assets or assets
        else if (service.image.startsWith('/assets') || service.image.startsWith('assets')) {
            logoPath = `${apiBaseUrl}/${service.image.startsWith('/') ? service.image.substring(1) : service.image}`;
            console.log(`Using server-based image path: ${logoPath}`);
        }
        // Otherwise use it with the API base URL
        else {
            logoPath = `${apiBaseUrl}/assets/6 Services logos/${service.image}`;
            console.log(`Using constructed image path: ${logoPath}`);
        }
    } 
    // Then check for logo property
    else if (service.logo && service.logo.trim() !== '') {
        if (service.logo.startsWith('http')) {
            logoPath = service.logo;
        } else {
            logoPath = `${apiBaseUrl}/assets/6 Services logos/${service.logo}`;
        }
        console.log(`Using provided logo path: ${logoPath}`);
    } 
    // Finally fall back to the default pattern based on service name
    else {
        logoPath = `${apiBaseUrl}/assets/6 Services logos/${name.toLowerCase()}.png`;
        console.log(`No image provided, using default path: ${logoPath}`);
    }
    
    card.innerHTML = `
        <div class="service-content">
            <div class="service-image-container">
                <img src="${logoPath}" alt="${name}" 
                     onerror="this.onerror=null; this.src='${apiBaseUrl}/assets/6 Services logos/default.png'; console.log('Fallback to placeholder for ${name}');">
            </div>
            <h3>${name}</h3>
            <div class="service-stats">
                <span class="active-users">Active Users: <strong>${service.activeUsers || 0}</strong></span>
                <span class="status ${service.status || 'active'}">${service.status || 'Active'}</span>
            </div>
            <div class="service-actions">
                <button class="manage-btn" title="Manage ${name} access">Manage Access</button>
                <button class="stats-btn" title="View ${name} statistics">View Stats</button>
            </div>
        </div>
    `;
    
    // Add click handlers for buttons
    card.querySelector('.manage-btn').addEventListener('click', function() {
        showNotification(`Managing access for ${name}`, 'info');
    });
    
    card.querySelector('.stats-btn').addEventListener('click', function() {
        showNotification(`Statistics for ${name} coming soon`, 'info');
    });
    
    return card;
}

// Also add click handlers for the static service cards
document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers to all manage access buttons
    document.querySelectorAll('.manage-btn').forEach(button => {
        const parentCard = button.closest('.service-card');
        const serviceName = parentCard.querySelector('h3').textContent;
        
        // Get service URL from services.json
        makeRequest(getApiBaseUrl() + '/admin/services')
            .then(services => {
                if (services[serviceName]) {
                    button.setAttribute('data-url', services[serviceName].url);
                    button.addEventListener('click', function() {
                        const url = this.getAttribute('data-url');
                        // Use electron bridge to open URL with role
                        window.electron.openInApp(url, 'admin');
                    });
                }
            })
            .catch(err => console.error('Error loading service URL:', err));
    });
});

// Function to delete a service
function deleteService(serviceName) {
    return new Promise((resolve, reject) => {
        makeRequest(getApiBaseUrl() + '/admin/delete-service', {
            method: 'POST',
            body: JSON.stringify({ serviceName })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete service');
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Refresh the services list
                refreshServicesList();
                resolve(data);
            } else {
                reject(new Error(data.message || 'Failed to delete service'));
            }
        })
        .catch(reject);
    });
}

// Function to populate the services table and handle service access
function populateServicesTable(users, services) {
    const tableBody = document.getElementById('servicesTableBody');
    tableBody.innerHTML = ''; // Clear existing rows

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.services.join(', ')}</td>
            <td>
                <select class="service-dropdown" data-username="${user.username}">
                    <option value="">Select Service</option>
                    ${services.map(service => `<option value="${service}">${service}</option>`).join('')}
                </select>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Add event listeners to dropdowns
    document.querySelectorAll('.service-dropdown').forEach(dropdown => {
        dropdown.addEventListener('change', function() {
            const selectedService = this.value;
            const username = this.getAttribute('data-username');
            if (selectedService) {
                showServiceAccessModal(username, selectedService);
            }
        });
    });
}

// Function to show the service access confirmation modal
function showServiceAccessModal(username, service) {
    const message = document.getElementById('popupMessage');
    const title = document.getElementById('popupTitle');

    // Fetch the current user services to check if the service is already assigned
    makeRequest(getApiBaseUrl() + '/admin/users')
        .then(users => {
            const userServices = users[username].services || [];
            const hasService = userServices.includes(service);

            // Set the title and message based on the service status
            title.textContent = `Manage Access for ${username}`;
            if (hasService) {
                message.textContent = `Remove access to ${service} for ${username}?`;
            } else {
                message.textContent = `Grant access to ${service} for ${username}?`;
            }

            // Show the popup
            const modal = document.getElementById('servicePopup');
            modal.style.display = 'block';

            // Set up button actions
            document.getElementById('confirmServiceChange').onclick = function() {
                updateServiceAccess(username, service);
                modal.style.display = 'none'; // Hide the modal after confirmation
            };

            document.getElementById('cancelServiceChange').onclick = function() {
                modal.style.display = 'none'; // Hide the modal on cancel
            };
        })
        .catch(err => console.error('❌ Error fetching user services:', err));
}

// Function to grant service access (mock implementation)
function grantServiceAccess(username, service) {
    alert(`Access to ${service} granted to ${username}`);
    // Here you would typically make an API call to update the user's services
}

// Function to sort the table by a specific column
function sortTable(columnIndex) {
    const table = document.querySelector('table');
    const rows = Array.from(table.rows).slice(1); // Exclude header row

    const sortedRows = rows.sort((a, b) => {
        const aText = a.cells[columnIndex].textContent.trim();
        const bText = b.cells[columnIndex].textContent.trim();

        return aText.localeCompare(bText);
    });

    // Append sorted rows to the table
    sortedRows.forEach(row => table.appendChild(row));
}

// Add event listeners to table headers for sorting
document.querySelectorAll('th').forEach((header, index) => {
    header.addEventListener('click', () => sortTable(index));
});

// Update dashboard counters with real data
function updateDashboardCounters() {
    makeRequest(getApiBaseUrl() + '/admin/dashboard-stats')
        .then(stats => {
            // Update total users count
            const totalUsersElement = document.getElementById('totalUsersCount');
            if (totalUsersElement) {
                animateCounter(totalUsersElement, stats.totalUsers);
                updateTrendIndicator('usersTrend', stats.trends.users.trend, stats.trends.users.direction);
            }

            // Update new users count
            const newUsersElement = document.getElementById('newUsersCount');
            if (newUsersElement) {
                animateCounter(newUsersElement, stats.newUsers);
                updateTrendIndicator('newUsersTrend', stats.trends.newUsers.trend, stats.trends.newUsers.direction);
            }

            // Update active users count
            const activeUsersElement = document.getElementById('activeUsersCount');
            if (activeUsersElement) {
                animateCounter(activeUsersElement, stats.activeUsers);
                updateTrendIndicator('activeUsersTrend', stats.trends.activeUsers.trend, stats.trends.activeUsers.direction);
            }

            // Update total services count
            const totalServicesElement = document.getElementById('totalServicesCount');
            if (totalServicesElement) {
                animateCounter(totalServicesElement, stats.totalServices);
                updateTrendIndicator('servicesTotalTrend', stats.trends.services.trend, stats.trends.services.direction);
            }
        })
        .catch(err => {
            console.error('Error fetching dashboard stats:', err);
        });
}

// Helper function to animate counter
function animateCounter(element, targetValue) {
    const startValue = parseInt(element.textContent) || 0;
    const duration = 1000; // Animation duration in milliseconds
    const steps = 60; // Number of steps in animation
    const stepValue = (targetValue - startValue) / steps;
    let currentStep = 0;

    const animation = setInterval(() => {
        currentStep++;
        const currentValue = Math.floor(startValue + (stepValue * currentStep));
        element.textContent = currentValue;

        if (currentStep >= steps) {
            element.textContent = targetValue; // Ensure final value is exact
            clearInterval(animation);
        }
    }, duration / steps);
}

// Function to update reseller statistics
function updateResellerStats() {
    makeRequest(getApiBaseUrl() + '/admin/reseller-stats')
        .then(stats => {
            // Update total resellers count
            const totalResellersElement = document.getElementById('totalResellers');
            if (totalResellersElement) {
                animateCounter(totalResellersElement, stats.totalResellers);
            }

            // Update new resellers count
            const newResellersElement = document.getElementById('newResellers');
            if (newResellersElement) {
                animateCounter(newResellersElement, stats.newResellers);
            }

            // Update active sales
            const activeSalesElement = document.getElementById('activeSales');
            if (activeSalesElement) {
                animateCounter(activeSalesElement, stats.activeSales);
            }

            // Update total revenue with currency formatting
            const totalRevenueElement = document.getElementById('totalRevenue');
            if (totalRevenueElement) {
                const formattedRevenue = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(stats.totalRevenue);
                totalRevenueElement.textContent = formattedRevenue;
            }

            // Update trends
            updateTrendIndicator('resellersTrend', stats.trends.resellers.trend, stats.trends.resellers.direction);
            updateTrendIndicator('newResellersTrend', stats.trends.resellers.trend, stats.trends.resellers.direction);
            updateTrendIndicator('salesTrend', stats.trends.sales.trend, stats.trends.sales.direction);
            updateTrendIndicator('revenueTrend', stats.trends.revenue.trend, stats.trends.revenue.direction);
        })
        .catch(err => {
            console.error('Error updating reseller stats:', err);
        });
}

// Enhanced trend indicator update function
function updateTrendIndicator(elementId, trendValue, direction) {
    const element = document.getElementById(elementId);
    if (element) {
        const trendIndicator = element.closest('.trend-indicator');
        if (trendIndicator) {
            // Remove all possible classes
            trendIndicator.classList.remove('up', 'down', 'stable');
            // Add the appropriate class
            trendIndicator.classList.add(direction);
            
            // Update the icon
            const icon = trendIndicator.querySelector('i');
            if (icon) {
                icon.className = `fas fa-arrow-${direction === 'stable' ? 'right' : direction}`;
            }
        }
        // Update the percentage text with absolute value and sign
        element.textContent = `${Math.abs(trendValue)}%`;
    }
}

// Update the initialization to include reseller stats
document.addEventListener('DOMContentLoaded', function() {
    // Initial load
    updateDashboardCounters();
    updateResellerStats();
    
    // Refresh stats every 30 seconds
    setInterval(() => {
        updateDashboardCounters();
        updateResellerStats();
    }, 30000);
});

// Function to update recent users table with real data from sessions
function updateRecentUsersTable() {
    fetch(getApiBaseUrl() + '/admin/session-history')
        .then(response => response.json())
        .then(sessions => {
            const tableBody = document.getElementById('recentUsersTableBody');
            tableBody.innerHTML = '';

            // Sort sessions by login time (most recent first) and take last 10
            const recentSessions = sessions
                .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime))
                .slice(0, 10);

            recentSessions.forEach(session => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="user-info">
                            <span class="user-name">${session.username}</span>
                        </div>
                    </td>
                    <td>${session.role || 'User'}</td>
                    <td>${formatLastActive(session.loginTime)}</td>
                    <td>
                        <span class="user-status ${session.status === 'active' ? 'status-active' : 'status-inactive'}">
                            ${session.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>${session.services?.join(', ') || 'No services'}</td>
                    <td>
                        <button class="table-action-btn" onclick="viewUserDetails('${session.username}')">
                            View Details
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        })
        .catch(err => {
            console.error('Error loading recent users:', err);
        });
}

// Helper function to format last active time
function formatLastActive(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / 60000);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
}

// Function to view user details
function viewUserDetails(username) {
    fetch(getApiBaseUrl() + '/admin/user/' + username)
        .then(response => response.json())
        .then(userData => {
            // You can implement a modal or navigation here to show user details
            console.log('User Details:', userData);
            // Example: Show user details in a modal
            showUserDetailsModal(userData);
        })
        .catch(err => {
            console.error('Error fetching user details:', err);
        });
}

// Initialize table and refresh functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initial load
    updateRecentUsersTable();

    // Refresh button functionality
    const refreshButton = document.getElementById('refreshUsersTable');
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            this.classList.add('rotating');
            updateRecentUsersTable();
            setTimeout(() => {
                this.classList.remove('rotating');
            }, 1000);
        });
    }

    // Auto refresh every 30 seconds
    setInterval(updateRecentUsersTable, 30000);
});

// Function to update recent resellers table
function updateRecentResellersTable() {
    fetch(getApiBaseUrl() + '/admin/recent-resellers')
        .then(response => response.json())
        .then(resellers => {
            const tableBody = document.getElementById('recentResellersTableBody');
            tableBody.innerHTML = '';

            resellers.forEach(reseller => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="user-info">
                            <span class="user-name">${reseller.username}</span>
                        </div>
                    </td>
                    <td>
                        <span class="user-status ${reseller.isActive ? 'online' : 'offline'}">
                            ${reseller.isActive ? 'Online' : 'Offline'}
                        </span>
                    </td>
                    <td>${formatLastActive(reseller.lastSale)}</td>
                    <td>
                        <span class="sales-count">${reseller.monthlySales}</span>
                        <span class="trend-indicator ${reseller.salesTrend > 0 ? 'up' : 'down'}">
                            <i class="fas fa-arrow-${reseller.salesTrend > 0 ? 'up' : 'down'}"></i>
                            ${Math.abs(reseller.salesTrend)}%
                        </span>
                    </td>
                    <td>
                        <span class="revenue-amount">$${reseller.revenue.toLocaleString()}</span>
                    </td>
                    <td>
                        <div class="user-actions">
                            <button class="action-button view-button" onclick="viewResellerDetails('${reseller.username}')">
                                View
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        })
        .catch(err => console.error('Error loading recent resellers:', err));
}

// Add to your existing DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    updateRecentResellersTable();
    
    // Refresh resellers table every minute
    setInterval(updateRecentResellersTable, 60000);
    
    // Add refresh button handler for resellers table
    const refreshResellersButton = document.querySelector('#refreshResellersTable');
    if (refreshResellersButton) {
        refreshResellersButton.addEventListener('click', () => {
            refreshResellersButton.classList.add('rotating');
            updateRecentResellersTable();
            setTimeout(() => refreshResellersButton.classList.remove('rotating'), 1000);
        });
    }
});

// Function to initialize tabs with first tab always active by default
function initializeTabs() {
    const tabContainers = document.querySelectorAll('.tabs-container');
    
    tabContainers.forEach(container => {
        const tabButtons = container.querySelectorAll('.tab-button');
        const tabContents = container.querySelectorAll('.tab-content');
        
        // Ensure first tab is active by default
        const setDefaultTab = () => {
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Set first tab as active
            if (tabButtons[0]) {
                tabButtons[0].classList.add('active');
                const firstTabId = `${tabButtons[0].dataset.tab}-tab`;
                const firstTabContent = document.getElementById(firstTabId);
                if (firstTabContent) {
                    firstTabContent.classList.add('active');
                }
                
                // Load data for first tab based on its type
                switch (tabButtons[0].dataset.tab) {
                    case 'users':
                    case 'allusers':
                        updateRecentUsersTable();
                        loadAllUsers();
                        break;
                    case 'resellers':
                        updateRecentResellersTable();
                        break;
                    case 'sessions':
                        updateSessionsTable('dashboardSessionsTable');
                        break;
                    case 'services':
                        refreshServicesList();
                        break;
                }
            }
        };

        // Set default tab on page load
        setDefaultTab();
        
        // Add click handlers for tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = `${button.dataset.tab}-tab`;
            document.getElementById(tabId).classList.add('active');

                // Load data based on active tab
                switch (button.dataset.tab) {
                    case 'users':
                    case 'allusers':
                updateRecentUsersTable();
                        loadAllUsers();
                        break;
                    case 'resellers':
                updateRecentResellersTable();
                        break;
                    case 'sessions':
                        updateSessionsTable('dashboardSessionsTable');
                        break;
                    case 'services':
                        refreshServicesList();
                        break;
                    case 'manageservices':
                        loadUserServices();
                        break;
                }
            });
        });
    });
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tabs
    initializeTabs();
    
    // Add refresh button handlers
    const refreshButtons = document.querySelectorAll('.refresh-button');
    refreshButtons.forEach(button => {
        button.addEventListener('click', () => {
            button.classList.add('rotating');
            
            // Find the active tab in the current section
            const tabsContainer = button.closest('.tabs-container');
            if (tabsContainer) {
                const activeTab = tabsContainer.querySelector('.tab-button.active');
                if (activeTab) {
                    // Refresh based on active tab
                    switch (activeTab.dataset.tab) {
                        case 'users':
                        case 'allusers':
            updateRecentUsersTable();
                            loadAllUsers();
                            break;
                        case 'resellers':
                            updateRecentResellersTable();
                            break;
                        case 'sessions':
                            updateSessionsTable('dashboardSessionsTable');
                            break;
                        case 'services':
                            refreshServicesList();
                            break;
                        case 'manageservices':
                            loadUserServices();
                            break;
                    }
                }
            }
            
            setTimeout(() => button.classList.remove('rotating'), 1000);
        });
    });

    // Set up auto-refresh intervals
    setInterval(() => {
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab) {
            switch (activeTab.dataset.tab) {
                case 'users':
                case 'allusers':
                    updateRecentUsersTable();
                    loadAllUsers();
                    break;
                case 'resellers':
                    updateRecentResellersTable();
                    break;
                case 'sessions':
                    updateSessionsTable('dashboardSessionsTable');
                    break;
            }
        }
    }, 30000); // Refresh every 30 seconds
});

// Function to update tools statistics
function updateToolsStats() {
    fetch(getApiBaseUrl() + '/admin/tools-stats')
        .then(response => response.json())
        .then(stats => {
            // Update total tools count
            const totalToolsElement = document.getElementById('totalTools');
            if (totalToolsElement) {
                animateCounter(totalToolsElement, stats.totalTools);
            }

            // Update top selling tools count
            const topSellingElement = document.getElementById('topSellingTools');
            if (topSellingElement) {
                animateCounter(topSellingElement, stats.topSelling);
            }

            // Update tools revenue with currency formatting
            const toolsRevenueElement = document.getElementById('toolsRevenue');
            if (toolsRevenueElement) {
                const formattedRevenue = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'PKR'
                }).format(stats.revenue);
                toolsRevenueElement.textContent = formattedRevenue;
            }

            // Update active users count
            const activeUsersElement = document.getElementById('activeToolUsers');
            if (activeUsersElement) {
                animateCounter(activeUsersElement, stats.activeUsers);
            }

            // Update trends
            updateTrendIndicator('toolsTrend', stats.trends.tools.trend, stats.trends.tools.direction);
            updateTrendIndicator('topSellingTrend', stats.trends.topSelling.trend, stats.trends.topSelling.direction);
            updateTrendIndicator('toolsRevenueTrend', stats.trends.revenue.trend, stats.trends.revenue.direction);
            updateTrendIndicator('toolsUsageTrend', stats.trends.usage.trend, stats.trends.usage.direction);
        })
        .catch(err => {
            console.error('Error updating tools stats:', err);
        });
}

// Add to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    updateToolsStats();
    // Refresh tools stats every 5 minutes
    setInterval(updateToolsStats, 300000);
});

// Helper function to calculate session duration
function calculateSessionDuration(start, end) {
    if (!start) return '-';
    
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime - startTime;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// Add this function to handle session loading with better error handling
function updateSessionsTable(options = {}) {
    const tableBody = document.getElementById('sessionsTableBody');
    if (!tableBody) return;
    
    // Only show loading state if not in silent mode
    if (!options.silent) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i> Loading sessions...
                </td>
            </tr>
        `;
    }
    
    // Add retry mechanism
    let retryCount = 0;
    const maxRetries = 3;
    
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    // First, get active sessions
    fetch(`${getApiBaseUrl()}/admin/sessions?t=${timestamp}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(activeSessions => {
            // Then, get session history
            return fetch(`${getApiBaseUrl()}/admin/session-history?t=${timestamp}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Server responded with status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(sessionHistory => {
                    return { activeSessions, sessionHistory };
                });
        })
        .then(({ activeSessions, sessionHistory }) => {
            // Combine active sessions and session history
            const combinedSessions = [];
            
            // Add active sessions
            Object.entries(activeSessions).forEach(([username, session]) => {
                // Ensure loginTime is a valid date string or timestamp
                const loginTime = session.loginTime || new Date().toISOString();
                combinedSessions.push({
                    username,
                    role: session.role || 'User',
                    loginTime: loginTime,
                    logoutTime: null,
                    duration: calculateSessionDuration(loginTime, null),
                    status: 'Active',
                    sessionId: session.sessionId
                });
            });
            
            // Add historical sessions
            sessionHistory.forEach(session => {
                // Skip if already in active sessions
                if (session.status === 'active' && combinedSessions.some(s => s.username === session.username)) {
                    return;
                }
                
                // Ensure loginTime is a valid date string or timestamp
                const loginTime = session.loginTime || new Date().toISOString();
                combinedSessions.push({
                    username: session.username,
                    role: session.role || 'User',
                    loginTime: loginTime,
                    logoutTime: session.logoutTime,
                    duration: session.duration || calculateSessionDuration(loginTime, session.logoutTime),
                    status: session.status,
                    sessionId: session.sessionId
                });
            });
            
            // Sort combined sessions by login time (newest first)
            combinedSessions.sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));
            
            if (combinedSessions.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="no-data">
                            <i class="fas fa-info-circle"></i> No sessions found
                        </td>
                    </tr>
                `;
                return;
            }

            // Store current scroll position if we're doing a silent refresh
            let scrollTop = 0;
            if (options.silent && tableBody.parentElement) {
                scrollTop = tableBody.parentElement.scrollTop;
            }

            tableBody.innerHTML = ''; // Clear loading state
            
            // Display combined sessions
            combinedSessions.forEach(session => {
                // Safely format dates to prevent "Invalid Date"
                const loginTimeStr = safeFormatDate(session.loginTime);
                const logoutTimeStr = session.logoutTime ? safeFormatDate(session.logoutTime) : '-';
                
                // Continuously update duration for active sessions
                const duration = session.status === 'Active' ? 
                                 calculateSessionDuration(session.loginTime, null) : 
                                 session.duration;
                
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${session.username}</td>
                    <td>${session.role}</td>
                    <td>${loginTimeStr}</td>
                    <td>${logoutTimeStr}</td>
                    <td>${duration}</td>
                    <td><span class="session-status ${session.status.toLowerCase()}">${session.status}</span></td>
                    <td>
                        ${session.status === 'Active' ? 
                        `<button class="table-action-btn terminate" onclick="terminateSession('${session.username}')">
                            <i class="fas fa-times"></i> Terminate
                        </button>` : 
                        `<span class="session-ended"><i class="fas fa-check-circle"></i> Ended</span>`}
                    </td>
                `;
                tableBody.appendChild(row);
            });
            
            // Restore scroll position for silent refreshes
            if (options.silent && tableBody.parentElement) {
                tableBody.parentElement.scrollTop = scrollTop;
            }
        })
        .catch(error => {
            console.error('Error loading sessions:', error);
            
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`Retrying session fetch (${retryCount}/${maxRetries})...`);
                setTimeout(() => updateSessionsTable(options), 1000);
            } else {
                // Only show error if not in silent mode
                if (!options.silent) {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="7" class="error-state">
                                <i class="fas fa-exclamation-circle"></i> Error loading sessions. 
                                <button class="retry-btn" onclick="updateSessionsTable()">Retry</button>
                            </td>
                        </tr>
                    `;
                }
            }
        });
}

// Initialize sessions table when the page loads
document.addEventListener('DOMContentLoaded', () => {
    updateSessionsTable();
    
    // Set up refresh button
    const refreshButton = document.getElementById('refreshSessionsTable');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshButton.classList.add('rotating');
            updateSessionsTable(); // Use visible refresh when button is clicked
            setTimeout(() => refreshButton.classList.remove('rotating'), 1000);
        });
    }
    
    // Refresh sessions more frequently (every 10 seconds) to catch logout events quickly
    setInterval(() => updateSessionsTable({silent: true}), 10000);
});

// Update the admin name in both the welcome header and sidebar
function updateAdminInfo() {
    // Get username from session history or localStorage
    fetch(getApiBaseUrl() + '/admin/session-history')
        .then(response => response.json())
        .then(sessions => {
            // Get the most recent active session
            const currentSession = sessions
                .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime))
                .find(session => session.status === 'active');

            if (currentSession) {
                // Update welcome header
                const adminNameElement = document.getElementById('adminName');
                if (adminNameElement) {
                    adminNameElement.textContent = currentSession.username;
                }

                // Update sidebar admin info
                const sidebarAdminName = document.getElementById('admin-name');
                if (sidebarAdminName) {
                    sidebarAdminName.textContent = currentSession.username;
                }

                // Update sidebar role if available
                const sidebarAdminRole = document.getElementById('admin-role');
                if (sidebarAdminRole && currentSession.role) {
                    sidebarAdminRole.textContent = currentSession.role.charAt(0).toUpperCase() + currentSession.role.slice(1);
                }

                // Store username in localStorage for persistence
                localStorage.setItem('username', currentSession.username);
            }
        })
        .catch(err => {
            console.error('Error fetching admin info:', err);
        });
}

// Add to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    // Initial update of admin info
    updateAdminInfo();
    
    // Refresh admin info every minute
    setInterval(updateAdminInfo, 60000);
});

// Function to load and display services
function loadServices() {
    // Try to fetch from API first
    fetch(getApiBaseUrl() + '/admin/services')
        .then(response => {
            if (!response.ok) {
                throw new Error(`API responded with status ${response.status}`);
            }
            return response.json();
        })
        .then(services => {
            displayServices(services);
        })
        .catch(err => {
            console.error('Error loading services from API:', err);
            console.log('Falling back to local services.json file');
            
            // Fallback to local services.json if API fails
            fetch('services.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Local file responded with status ${response.status}`);
                    }
                    return response.json();
                })
                .then(services => {
                    console.log('Successfully loaded services from local file');
                    displayServices(services);
                })
                .catch(localErr => {
                    console.error('Error loading services from local file:', localErr);
                    
                    // Show error in the table
                    const tableBody = document.getElementById('servicesList');
                    if (tableBody) {
                        tableBody.innerHTML = `
                            <tr>
                                <td colspan="6" class="error-state">
                                    <i class="fas fa-exclamation-circle"></i> 
                                    <p>Failed to load services. Please check your network connection.</p>
                                    <button onclick="loadServices()">Retry</button>
                                </td>
                            </tr>
                        `;
                    }
                });
        });
        
    // Function to display services in the table
    function displayServices(services) {
        const tableBody = document.getElementById('servicesList');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';

        if (Object.keys(services).length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="info-state">
                        <i class="fas fa-info-circle"></i> No services found.
                    </td>
                </tr>
            `;
            return;
        }

        Object.entries(services).forEach(([serviceName, service]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="service-info">
                        <span class="service-name">${serviceName}</span>
                    </div>
                </td>
                <td>${service.description || 'No description'}</td>
                <td>$${service.price || 0}</td>
                <td>${service.activeUsers || 0}</td>
                <td>
                    <span class="user-status ${service.active ? 'status-active' : 'status-inactive'}">
                        ${service.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="table-action-btn" onclick="editService('${serviceName}', ${JSON.stringify(service).replace(/"/g, '&quot;')})">
                            Edit
                        </button>
                        <button class="table-action-btn delete" onclick="deleteService('${serviceName}')">
                            Delete
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

// Add this function if it doesn't exist
function showNotification(message, type = 'info') {
    console.log(`${type}: ${message}`); // Debug log
    alert(message); // Basic notification
}

// Add this function if it doesn't exist
async function refreshServicesList() {
    try {
        // Try API endpoint first
        let services;
        try {
            const response = await fetch(getApiBaseUrl() + '/admin/services');
            if (!response.ok) {
                throw new Error(`API responded with status ${response.status}`);
            }
            services = await response.json();
            console.log('Successfully fetched services from API');
        } catch (apiError) {
            console.error('Error loading services from API:', apiError);
            console.log('Falling back to local services.json file');
            
            // Fallback to local services.json
            const localResponse = await fetch('services.json');
            if (!localResponse.ok) {
                throw new Error(`Failed to load services from local file: ${localResponse.status}`);
            }
            services = await localResponse.json();
            console.log('Successfully loaded services from local file');
        }
        
        // Update services container
        const servicesGrid = document.querySelector('.services-grid');
        if (servicesGrid) {
            servicesGrid.innerHTML = ''; // Clear existing services
            
            if (Object.keys(services).length === 0) {
                servicesGrid.innerHTML = `
                    <div class="no-services-message">
                        <i class="fas fa-info-circle"></i>
                        <p>No services found</p>
                    </div>
                `;
                return;
            }
            
            Object.entries(services).forEach(([name, service]) => {
                const serviceCard = createServiceCard(name, service);
                servicesGrid.appendChild(serviceCard);
            });
        }
    } catch (err) {
        console.error('Error refreshing services list:', err);
        
        // Show error in the services grid
        const servicesGrid = document.querySelector('.services-grid');
        if (servicesGrid) {
            servicesGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load services: ${err.message}</p>
                    <button onclick="refreshServicesList()">Retry</button>
                </div>
            `;
        }
    }
}

// Helper function to create service card
function createServiceCard(name, service) {
    const card = document.createElement('div');
    card.className = 'service-card';
    
    // Improved image path handling with better prioritization
    let logoPath = '';
    const apiBaseUrl = getApiBaseUrl();
    
    // First check if service has an image property from API
    if (service.image && service.image.trim() !== '') {
        // If it's already a full URL, use it directly
        if (service.image.startsWith('http')) {
            logoPath = service.image;
        } 
        // If it's a timestamp format (uploaded image)
        else if (/^\d+-\d+\.(png|jpg|jpeg|gif)$/i.test(service.image)) {
            logoPath = `${apiBaseUrl}/assets/6 Services logos/${service.image}`;
            console.log(`Using timestamp image path: ${logoPath}`);
        }
        // If it starts with /assets or assets
        else if (service.image.startsWith('/assets') || service.image.startsWith('assets')) {
            logoPath = `${apiBaseUrl}/${service.image.startsWith('/') ? service.image.substring(1) : service.image}`;
            console.log(`Using server-based image path: ${logoPath}`);
        }
        // Otherwise use it with the API base URL
        else {
            logoPath = `${apiBaseUrl}/assets/6 Services logos/${service.image}`;
            console.log(`Using constructed image path: ${logoPath}`);
        }
    } 
    // Then check for logo property
    else if (service.logo && service.logo.trim() !== '') {
        if (service.logo.startsWith('http')) {
            logoPath = service.logo;
        } else {
            logoPath = `${apiBaseUrl}/assets/6 Services logos/${service.logo}`;
        }
        console.log(`Using provided logo path: ${logoPath}`);
    } 
    // Finally fall back to the default pattern based on service name
    else {
        logoPath = `${apiBaseUrl}/assets/6 Services logos/${name.toLowerCase()}.png`;
        console.log(`No image provided, using default path: ${logoPath}`);
    }
    
    card.innerHTML = `
        <div class="service-content">
            <div class="service-image-container">
                <img src="${logoPath}" alt="${name}" 
                     onerror="this.onerror=null; this.src='${apiBaseUrl}/assets/6 Services logos/default.png'; console.log('Fallback to placeholder for ${name}');">
            </div>
            <h3>${name}</h3>
            <div class="service-stats">
                <span class="active-users">Active Users: <strong>${service.activeUsers || 0}</strong></span>
                <span class="status ${service.status || 'active'}">${service.status || 'Active'}</span>
            </div>
            <div class="service-actions">
                <button class="manage-btn" title="Manage ${name} access">Manage Access</button>
                <button class="stats-btn" title="View ${name} statistics">View Stats</button>
            </div>
        </div>
    `;
    
    // Add click handlers for buttons
    card.querySelector('.manage-btn').addEventListener('click', function() {
        showNotification(`Managing access for ${name}`, 'info');
    });
    
    card.querySelector('.stats-btn').addEventListener('click', function() {
        showNotification(`Statistics for ${name} coming soon`, 'info');
    });
    
    return card;
}

// Function to delete a service
function deleteService(serviceName) {
    if (confirm(`Are you sure you want to delete the service: ${serviceName}?`)) {
        fetch(getApiBaseUrl() + '/admin/services/' + serviceName, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                showNotification('Service deleted successfully', 'success');
                loadServices();
            } else {
                showNotification('Failed to delete service', 'error');
            }
        })
        .catch(err => {
            console.error('Error deleting service:', err);
            showNotification('Error deleting service', 'error');
        });
    }
}

// Function to load and display user services
function loadUserServices() {
    // Show loading state in the table
    const tableBody = document.getElementById('userServicesList');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i> Loading services...
                </td>
            </tr>
        `;
    }

    return Promise.all([
        fetch(getApiBaseUrl() + '/admin/users').then(res => res.json()),
        fetch(getApiBaseUrl() + '/admin/services').then(res => res.json())
    ])
    .then(([users, services]) => {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        Object.entries(users).forEach(([username, userData]) => {
            const row = document.createElement('tr');
            const currentServices = userData.services || [];
            
            row.innerHTML = `
                <td>${username}</td>
                <td>${userData.role}</td>
                <td>
                    <button class="table-action-btn" onclick='showUserServiceDetails("${username}", ${JSON.stringify(userData)})'>
                        <i class="fas fa-eye"></i> View Services
                    </button>
                </td>
                <td>
                    <select class="service-select" onchange="handleServiceAction('${username}', this.value, 'add')" 
                            ${Object.keys(services).length === currentServices.length ? 'disabled' : ''}>
                        <option value="">Add service...</option>
                        ${Object.keys(services)
                            .filter(service => !currentServices.includes(service))
                            .map(service => `<option value="${service}">${service}</option>`)
                            .join('')}
                    </select>
                </td>
                <td>
                    ${currentServices.length} services assigned
                </td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error loading user services:', error);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="error-state">
                        <i class="fas fa-exclamation-circle"></i> Error loading services. Please try again.
                    </td>
                </tr>
            `;
        }
    });
}

// Function to handle service actions (add/remove)
function handleServiceAction(username, service, action) {
    if (!service) return;

    const detailsPopup = document.getElementById('userServicesPopup');
    const popup = document.getElementById('serviceAssignPopup');
    const usernameSpan = document.getElementById('popupUsername');
    const serviceSpan = document.getElementById('popupService');
    const confirmBtn = document.getElementById('confirmAssign');
    const confirmMessage = popup.querySelector('.confirmation-message');
    
    // Store current user data for later use
    let currentUserData = null;
    
    // Get current user data before proceeding
    fetch(getApiBaseUrl() + '/admin/users')
        .then(res => res.json())
        .then(users => {
            currentUserData = users[username];
            
            // Setup popup display
            detailsPopup.style.display = 'none';
            document.querySelectorAll('.popup-overlay').forEach(p => p.classList.remove('active'));
            popup.classList.add('active');
            
            usernameSpan.textContent = username;
            serviceSpan.textContent = service;
            
            // Update popup content based on action
            if (action === 'add') {
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Grant Access';
                confirmBtn.classList.remove('delete');
                confirmMessage.innerHTML = `
                    Do you want to grant access to <span class="service-name">${service}</span> 
                    for <span class="username">${username}</span>?
                `;
            } else {
                confirmBtn.innerHTML = '<i class="fas fa-times"></i> Remove Access';
                confirmBtn.classList.add('delete');
                confirmMessage.innerHTML = `
                    Do you want to remove access to <span class="service-name">${service}</span> 
                    from <span class="username">${username}</span>?
                `;
            }
            
            popup.style.display = 'flex';

            // Handle confirm action
            const handleConfirm = () => {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                fetch(getApiBaseUrl() + '/admin/update-service', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: username, service })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        // Update the current user data based on the action
                        const updatedServices = action === 'add'
                            ? [...(currentUserData.services || []), service]
                            : (currentUserData.services || []).filter(s => s !== service);
                        
                        currentUserData = { ...currentUserData, services: updatedServices };

                        // Perform all updates simultaneously
                        Promise.all([
                            // Refresh main services table
                            loadUserServices(),
                            // Update user services popup
                            showUserServiceDetails(username, currentUserData),
                            // Refresh service statistics
                            updateServiceStats()
                        ]).then(() => {
                            showNotification(data.message, 'success');
                            
                            // Reset any service dropdowns
                            document.querySelectorAll('.service-select').forEach(select => {
                                select.value = '';
                            });
                        });
                    } else {
                        showNotification(data.message || 'Operation failed', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showNotification('Operation failed', 'error');
                })
                .finally(() => {
                    popup.style.display = 'none';
                    popup.classList.remove('active');
                    confirmBtn.disabled = false;
                    
                    // Show the details popup again after operation is complete
                    if (action === 'remove') {
                        detailsPopup.style.display = 'flex';
                        detailsPopup.classList.add('active');
                        // Refresh the details popup content
                        showUserServiceDetails(username, currentUserData);
                    }
                });
            };

            confirmBtn.onclick = handleConfirm;
            
            // Handle close
            const handleClose = () => {
                popup.style.display = 'none';
                popup.classList.remove('active');
                // Show the details popup again when closing
                detailsPopup.style.display = 'flex';
                detailsPopup.classList.add('active');
            };

            document.getElementById('cancelAssign').onclick = handleClose;
            popup.querySelector('.close-popup').onclick = handleClose;
        })
        .catch(error => {
            console.error('Error fetching user data:', error);
            showNotification('Error fetching user data', 'error');
        });
}

// Update the initializeUsersTabs function to include the manageservices tab
function initializeUsersTabs() {
    const tabButtons = document.querySelectorAll('#users-page .tab-button');
    const tabContents = document.querySelectorAll('#users-page .tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = `${button.dataset.tab}-tab`;
            document.getElementById(tabId).classList.add('active');

            // Load data based on active tab
            switch (button.dataset.tab) {
                case 'allusers':
                    loadAllUsers();
                    break;
                case 'services':
                    loadServices();
                    break;
                case 'manageservices':
                    loadUserServices();
                    break;
            }
        });
    });
}

// Add to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    initializeUsersTabs();
    
    // Add refresh button handler for user services table
    const refreshUserServicesButton = document.getElementById('refreshUserServicesTable');
    if (refreshUserServicesButton) {
        refreshUserServicesButton.addEventListener('click', () => {
            refreshUserServicesButton.classList.add('rotating');
            loadUserServices();
            setTimeout(() => refreshUserServicesButton.classList.remove('rotating'), 1000);
        });
    }
});

// Add this function to show user services details
function showUserServiceDetails(username, userData) {
    const popup = document.getElementById('userServicesPopup');
    document.querySelectorAll('.popup-overlay').forEach(p => p.classList.remove('active'));
    popup.classList.add('active');
    
    const usernameEl = popup.querySelector('.username');
    const roleBadge = popup.querySelector('.role-badge');
    const servicesList = popup.querySelector('.services-list');
    
    usernameEl.textContent = username;
    roleBadge.textContent = userData.role;
    servicesList.innerHTML = '';

    // Store intervals for cleanup
    const intervals = [];
    
    const services = userData.services || [];
    
    if (services.length === 0) {
        servicesList.innerHTML = `
            <div class="no-services">
                <i class="fas fa-info-circle"></i>
                No services assigned to this user
            </div>
        `;
    } else {
        services.forEach(service => {
            const serviceDetails = userData.serviceDetails?.[service] || {};
            const now = new Date();
            const assignedDate = serviceDetails.assignedDate ? new Date(serviceDetails.assignedDate) : null;
            const expirationDate = serviceDetails.expirationDate ? new Date(serviceDetails.expirationDate) : null;
            
            let timeLeft = 0;
            let timeLeftDisplay = '(Expired)';
            
            if (expirationDate && expirationDate > now) {
                timeLeft = expirationDate - now;
                timeLeftDisplay = formatTimeRemaining(timeLeft);
            }

            const serviceItem = document.createElement('div');
            serviceItem.className = 'service-item';
            serviceItem.innerHTML = `
                <div class="service-info">
                    <div class="service-icon">
                        <i class="fas fa-cog"></i>
                    </div>
                    <div class="service-details">
                        <span class="service-name">${service}</span>
                        <div class="service-status">
                            <div class="assigned-date">
                                Assigned: ${assignedDate ? formatDateTime(assignedDate) : 'N/A'}
                            </div>
                            <div class="expiration-date ${timeLeft > 0 && timeLeft < (24 * 60 * 60 * 1000) ? 'expiring-soon' : ''}">
                                Expires: ${expirationDate ? formatDateTime(expirationDate) : 'N/A'}
                                <span class="time-remaining">${timeLeftDisplay}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="service-actions">
                    <button class="remove-service" onclick="handleServiceAction('${username}', '${service}', 'remove')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            servicesList.appendChild(serviceItem);

            // Update time remaining every hour if service is not expired
            if (timeLeft > 0) {
                const timeRemainingSpan = serviceItem.querySelector('.time-remaining');
                const expirationDiv = serviceItem.querySelector('.expiration-date');
                
                const updateInterval = setInterval(() => {
                    const currentTime = new Date();
                    const remainingTime = expirationDate - currentTime;
                    
                    if (remainingTime <= 0) {
                        clearInterval(updateInterval);
                        timeRemainingSpan.textContent = '(Expired)';
                        expirationDiv.classList.remove('expiring-soon');
                        checkExpiredServices();
                    } else {
                        timeRemainingSpan.textContent = formatTimeRemaining(remainingTime);
                        if (remainingTime < (24 * 60 * 60 * 1000)) { // Less than 24 hours
                            expirationDiv.classList.add('expiring-soon');
                        }
                    }
                }, 3600000); // Update every hour
                
                intervals.push(updateInterval);
            }
        });
    }
    
    popup.style.display = 'flex';
    
    // Clean up intervals when closing popup
    const closeBtn = popup.querySelector('.close-popup');
    closeBtn.onclick = () => {
        intervals.forEach(interval => clearInterval(interval));
        popup.style.display = 'none';
        popup.classList.remove('active');
    };

    // Also clean up intervals when popup is hidden
    popup.addEventListener('hidden', () => {
        intervals.forEach(interval => clearInterval(interval));
    }, { once: true });
}

// Update the formatDateTime function for better time display
function formatDateTime(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return 'N/A';
        }
        return getPakistanTime(date);
    } catch (error) {
        console.error('Date formatting error:', error);
        return 'N/A';
    }
}

// Add this function to check for expired services
function checkExpiredServices() {
    fetch(getApiBaseUrl() + '/admin/check-expired-services')
        .then(response => response.json())
        .then(data => {
            if (data.expiredServices.length > 0) {
                // Refresh all views
                loadUserServices();
                
                // If the details popup is open, refresh it
                const detailsPopup = document.getElementById('userServicesPopup');
                if (detailsPopup.style.display === 'flex') {
                    const username = detailsPopup.querySelector('.username').textContent;
                    fetch(getApiBaseUrl() + '/admin/users')
                        .then(res => res.json())
                        .then(users => {
                            if (users[username]) {
                                showUserServiceDetails(username, users[username]);
                            }
                        });
                }

                // Show notification for expired services
                data.expiredServices.forEach(({ username, service }) => {
                    showNotification(`Service '${service}' has expired for user '${username}'`, 'info');
                });
            }
        })
        .catch(error => console.error('Error checking expired services:', error));
}

// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    // Check for expired services every 10 seconds
    setInterval(checkExpiredServices, 10000);
});

// Add this helper function to format time remaining
function formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return '(Expired)';

    const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
    const hours = Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) {
        return `(${days}d ${hours}h remaining)`;
    } else if (hours > 0) {
        return `(${hours}h ${minutes}m remaining)`;
    } else {
        return `(${minutes}m remaining)`;
    }
}

// Add image preview functionality
document.getElementById('serviceImage')?.addEventListener('change', function(e) {
    const preview = document.getElementById('imagePreview');
    const file = e.target.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 64px; max-height: 64px;">`;
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = '';
    }
});

// Add this debugging code
document.addEventListener('DOMContentLoaded', function() {
    // Debug form existence
    const form = document.getElementById('addServiceForm');
    console.log('Add Service Form found:', !!form);
    
    if (form) {
        // Debug form fields
        console.log('Service Name field:', !!document.getElementById('serviceName'));
        console.log('Service Description field:', !!document.getElementById('serviceDescription'));
        console.log('Service Price field:', !!document.getElementById('servicePrice'));
        console.log('Service Image field:', !!document.getElementById('serviceImage'));
    }
});

// Remove any existing service-related code and add this:
document.addEventListener('DOMContentLoaded', function() {
    // Initialize services manager
    if (document.getElementById('addServiceForm')) {
        window.serviceManager = new ServiceManager();
    }
});

// Add this to your existing admin.js file
document.addEventListener('DOMContentLoaded', function() {
    // Get modal elements
    const ohServiceModal = document.getElementById('ohServiceModal');
    const ohServiceBtn = document.getElementById('ohServiceBtn');
    const closeOhModal = document.querySelector('.close-oh-modal');
    const quickServiceForm = document.getElementById('quickServiceForm');
    const quickImagePreview = document.getElementById('quickImagePreview');

    // Show modal when clicking Oh Service button
    ohServiceBtn?.addEventListener('click', () => {
        ohServiceModal.style.display = 'flex'; // Changed from 'block' to 'flex'
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    });

    // Close modal when clicking X
    closeOhModal?.addEventListener('click', () => {
        ohServiceModal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
    });

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === ohServiceModal) {
            ohServiceModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });

    // Handle image preview
    document.getElementById('quickServiceLogo')?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        const label = document.querySelector('.file-upload-label span');
        
        if (file) {
            label.textContent = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                quickImagePreview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                `;
            };
            reader.readAsDataURL(file);
        } else {
            label.textContent = 'Choose a file';
            quickImagePreview.innerHTML = '';
        }
    });

    // Handle form submission
    quickServiceForm?.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('name', document.getElementById('quickServiceName').value);
        formData.append('url', document.getElementById('quickServiceUrl').value);
        formData.append('price', document.getElementById('quickServicePrice').value || '0');
        formData.append('type', 'regular');
        formData.append('image', document.getElementById('quickServiceLogo').files[0]);

        try {
            const response = await fetch(getApiBaseUrl() + '/api/services', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (response.ok) {
                ohServiceModal.style.display = 'none';
                quickServiceForm.reset();
                quickImagePreview.innerHTML = '';
                document.body.style.overflow = '';
                
                // Refresh services list
                refreshServicesList();
                
                alert('Service added successfully!');
            } else {
                throw new Error(data.error || 'Failed to add service');
            }
        } catch (error) {
            console.error('Error adding service:', error);
            alert(error.message);
        }
    });
});

// Add this to your existing admin.js
document.addEventListener('DOMContentLoaded', function() {
    // Load admin settings
    loadAdminSettings();
    
    // Load reseller list
    loadResellers();
    
    // Handle admin settings form submission
    document.getElementById('adminSettingsForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        updateAdminSettings();
    });
});

// Function to load admin settings
function loadAdminSettings() {
    fetch(getApiBaseUrl() + '/admin/settings')
        .then(response => response.json())
        .then(data => {
            document.getElementById('adminEmail').value = data.email;
        })
        .catch(error => console.error('Error loading admin settings:', error));
}

// Function to update admin settings
async function updateAdminSettings() {
    const currentPassword = document.getElementById('adminCurrentPassword').value;
    const newPassword = document.getElementById('adminNewPassword').value;
    const confirmPassword = document.getElementById('adminConfirmPassword').value;
    const email = document.getElementById('adminEmail').value;

    if (newPassword && newPassword !== confirmPassword) {
        alert('New passwords do not match!');
        return;
    }

    try {
        const response = await fetch(getApiBaseUrl() + '/admin/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                currentPassword,
                newPassword
            })
        });

        const data = await response.json();
        
        if (data.status === 'success') {
            alert('Settings updated successfully!');
            document.getElementById('adminCurrentPassword').value = '';
            document.getElementById('adminNewPassword').value = '';
            document.getElementById('adminConfirmPassword').value = '';
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        alert(error.message);
    }
}

// Function to load resellers
function loadResellers() {
    fetch(getApiBaseUrl() + '/admin/resellers')
        .then(response => response.json())
        .then(resellers => {
            const resellerList = document.querySelector('.reseller-list');
            resellerList.innerHTML = '';

            resellers.forEach(reseller => {
                const card = createResellerCard(reseller);
                resellerList.appendChild(card);
            });
        })
        .catch(error => console.error('Error loading resellers:', error));
}

// Function to create reseller card
function createResellerCard(reseller) {
    const div = document.createElement('div');
    div.className = 'reseller-card';
    
    div.innerHTML = `
        <div class="reseller-info">
            <span class="reseller-email">${reseller.email}</span>
        </div>
        <div class="reseller-actions">
            <button class="edit-btn glass-btn" onclick="editReseller('${reseller.email}')">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="delete-btn glass-btn" onclick="deleteReseller('${reseller.email}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    return div;
}

// Add this standardized table CSS to the document
const tableStyle = document.createElement('style');
tableStyle.textContent = `
    /* Unified Table Styling */
    .admin-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: rgba(123, 74, 226, 0.1);
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        margin: 1rem 0;
    }

    .admin-table thead {
        background: rgba(123, 74, 226, 0.3);
    }

    .admin-table th {
        font-size: 0.8rem;
        font-weight: 600;
        color: #ffffff;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 1rem;
    }

    .admin-table td {
        padding: 0.85rem 1rem;
        font-size: 0.85rem;
        color: #e0e0e0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .admin-table tbody tr {
        transition: all 0.3s ease;
        background: rgba(15, 15, 26, 0.3);
    }

    .admin-table tbody tr:hover {
        background: rgba(123, 74, 226, 0.2);
    }

    /* Status Badges */
    .status-badge {
        padding: 0.35rem 0.75rem;
        border-radius: 6px;
        font-size: 0.813rem;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
    }

    .status-badge.active {
        background: rgba(76, 175, 80, 0.1);
        color: #4CAF50;
        border: 1px solid rgba(76, 175, 80, 0.2);
    }

    .status-badge.inactive,
    .status-badge.ended {
        background: rgba(255, 71, 87, 0.1);
        color: #ff4757;
        border: 1px solid rgba(255, 71, 87, 0.2);
    }

    .status-badge.pending,
    .status-badge.terminated {
        background: rgba(255, 159, 67, 0.1);
        color: #ff9f43;
        border: 1px solid rgba(255, 159, 67, 0.2);
    }

    /* Action Buttons */
    .table-actions {
        display: flex;
        gap: 0.5rem;
    }

    .table-action-btn {
        padding: 0.5rem;
        border-radius: 6px;
        background: none;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #a0a0a0;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .table-action-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #ffffff;
    }

    .table-action-btn.terminate,
    .table-action-btn.delete {
        color: #ff4757;
        border-color: rgba(255, 71, 87, 0.2);
    }

    .table-action-btn.terminate:hover,
    .table-action-btn.delete:hover {
        background: rgba(255, 71, 87, 0.1);
    }

    /* User Role Badges */
    .user-role-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 500;
    }

    .user-role-badge.admin {
        background: rgba(123, 74, 226, 0.1);
        color: #7b4ae2;
        border: 1px solid rgba(123, 74, 226, 0.2);
    }

    .user-role-badge.user {
        background: rgba(46, 213, 115, 0.1);
        color: #2ed573;
        border: 1px solid rgba(46, 213, 115, 0.2);
    }

    .user-role-badge.reseller {
        background: rgba(41, 196, 255, 0.1);
        color: #29c4ff;
        border: 1px solid rgba(41, 196, 255, 0.2);
    }

    /* Session Duration */
    .session-duration {
        color: #7b4ae2;
        font-weight: 500;
    }

    /* Loading and Empty States */
    .table-loading,
    .table-empty {
        text-align: center;
        padding: 2rem;
        color: #e0e0e0;
    }

    .table-loading i {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

document.head.appendChild(tableStyle);

// Function to update all tables to use the new unified styling
function updateTableStyling() {
    // Get all tables that should use the admin styling
    const tables = document.querySelectorAll(
        '.sessions-table, .recent-users-table, .recent-resellers-table, .services-table'
    );

    tables.forEach(table => {
        // Add the admin-table class
        table.classList.add('admin-table');
        
        // Update status cells to use the new badge styling
        table.querySelectorAll('td:has(.status)').forEach(cell => {
            const status = cell.textContent.trim().toLowerCase();
            cell.innerHTML = `
                <span class="status-badge ${status}">
                    <i class="fas fa-${getStatusIcon(status)}"></i>
                    ${capitalizeFirst(status)}
                </span>
            `;
        });

        // Update action buttons to use the new styling
        table.querySelectorAll('.action-buttons').forEach(actionContainer => {
            actionContainer.classList.add('table-actions');
            actionContainer.querySelectorAll('button').forEach(button => {
                button.classList.add('table-action-btn');
            });
        });
    });
}

// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    // Update all tables with the new styling
    updateTableStyling();
    
    // Update table styling after any dynamic content updates
    const observers = new MutationObserver(updateTableStyling);
    
    // Observe all table containers for changes
    document.querySelectorAll('.table-container').forEach(container => {
        observers.observe(container, { 
            childList: true, 
            subtree: true 
        });
    });
});

// Add this HTML template for the price input
const priceInputHtml = `
    <div class="form-group">
        <label for="quickServicePrice">Price (PKR)</label>
        <input 
            type="number" 
            id="quickServicePrice" 
            name="price" 
            placeholder="Enter price in PKR" 
            min="0" 
            step="0.01"
            class="form-control"
            required
        >
    </div>
`;

// Update the modal form HTML when creating it
document.addEventListener('DOMContentLoaded', function() {
    // Get modal elements
    const quickServiceForm = document.getElementById('quickServiceForm');
    if (quickServiceForm) {
        // Find the URL input's form-group
        const urlFormGroup = quickServiceForm.querySelector('#quickServiceUrl').closest('.form-group');
        
        // Insert price field after the URL input
        urlFormGroup.insertAdjacentHTML('afterend', priceInputHtml);
    }

    // Update form submission handler to include price
    quickServiceForm?.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('name', document.getElementById('quickServiceName').value);
        formData.append('url', document.getElementById('quickServiceUrl').value);
        formData.append('price', document.getElementById('quickServicePrice').value);
        formData.append('image', document.getElementById('quickServiceLogo').files[0]);

        try {
            const response = await fetch(getApiBaseUrl() + '/api/services', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (response.ok) {
                ohServiceModal.style.display = 'none';
                quickServiceForm.reset();
                quickImagePreview.innerHTML = '';
                refreshServicesList();
                alert('Service added successfully!');
            } else {
                throw new Error(data.error || 'Failed to add service');
            }
        } catch (error) {
            console.error('Error adding service:', error);
            alert(error.message);
        }
    });
});

// Add analytics update functions
function updateAnalytics() {
    fetch(getApiBaseUrl() + '/admin/analytics')
        .then(response => response.json())
        .then(data => {
            // Update total revenue with PKR
            document.getElementById('totalRevenue').textContent = `PKR ${data.totalRevenue.toFixed(2)}`;
            document.getElementById('revenueTrend').textContent = `${data.revenueTrend}%`;

            // Update service revenue with PKR
            document.getElementById('toolsRevenue').textContent = `PKR ${data.serviceRevenue.toFixed(2)}`;
            document.getElementById('toolsRevenueTrend').textContent = `${data.serviceRevenueTrend}%`;

            // Update other analytics
            document.getElementById('totalServices').textContent = data.totalServices;
            document.getElementById('activeToolUsers').textContent = data.activeUsers;
            document.getElementById('topSellingTools').textContent = data.topSelling;

            updateTrendIndicators(data);
        })
        .catch(error => console.error('Error updating analytics:', error));
}

function updateTrendIndicators(data) {
    const indicators = {
        'revenueTrend': data.revenueTrend,
        'toolsRevenueTrend': data.serviceRevenueTrend,
        'toolsUsageTrend': data.usageTrend,
        'topSellingTrend': data.topSellingTrend
    };

    for (const [id, value] of Object.entries(indicators)) {
        const element = document.getElementById(id);
        if (element) {
            const icon = element.previousElementSibling;
            if (value > 0) {
                icon.className = 'fas fa-arrow-up';
                element.parentElement.classList.add('up');
            } else {
                icon.className = 'fas fa-arrow-down';
                element.parentElement.classList.remove('up');
            }
        }
    }
}

// Add this to your existing setInterval for auto-refresh
setInterval(() => {
    updateAnalytics();
}, 30000); // Update every 30 seconds

// Function to calculate percentage change
function calculateTrend(currentValue, previousValue) {
    if (!previousValue) return 0;
    return ((currentValue - previousValue) / previousValue * 100).toFixed(1);
}

// Function to handle tab switching
function switchTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedTab = document.getElementById(`${tabId}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
        
        // If it's the add user tab, show the form directly
        if (tabId === 'adduser') {
            // Remove modal styling for add user form
            const addUserForm = document.getElementById('addUserForm');
            const modalContent = document.querySelector('#adduser-tab .modal-content');
            
            if (modalContent) {
                modalContent.style.position = 'relative';
                modalContent.style.margin = '0';
                modalContent.style.width = '100%';
                modalContent.style.maxWidth = '600px';
                modalContent.style.animation = 'none';
                modalContent.parentElement.style.display = 'block';
                modalContent.parentElement.style.position = 'relative';
                modalContent.parentElement.style.background = 'none';
            }
        }
    }
}

// Update the HTML structure in the tab content
document.getElementById('adduser-tab').innerHTML = `
    <div class="add-user-section">
        <div class="add-user-header">
            <i class="fas fa-user-plus"></i>
            <h2>Add New User</h2>
        </div>
        <form id="addUserForm" onsubmit="event.preventDefault(); addUser();">
            <div class="add-user-form">
                <div class="form-group">
                    <label for="fullName">Full Name</label>
                    <input type="text" id="fullName" required placeholder="Enter full name">
                </div>
                <div class="form-group">
                    <label for="newUsername">Username</label>
                    <input type="text" id="newUsername" required placeholder="Enter username">
                </div>
                <div class="form-group">
                    <label for="newPassword">Password</label>
                    <div class="password-input">
                        <input type="password" id="newPassword" required placeholder="Enter password">
                        <i class="fas fa-eye toggle-password"></i>
                    </div>
                </div>
                <div class="form-group">
                    <label for="newRole">Role</label>
                    <select id="newRole" required>
                        <option value="">Select role</option>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="reseller">Reseller</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="submit" class="save-btn">
                        <i class="fas fa-user-plus"></i>
                        Add User
                    </button>
                    <button type="button" class="cancel-btn" onclick="clearForm()">
                        <i class="fas fa-times"></i>
                        Clear
                    </button>
                </div>
            </div>
        </form>
    </div>
`;

// Add a function to clear the form
function clearForm() {
    document.getElementById('addUserForm').reset();
}

// Add password toggle functionality
document.querySelectorAll('.toggle-password').forEach(icon => {
    icon.addEventListener('click', function() {
        const input = this.previousElementSibling;
        if (input.type === 'password') {
            input.type = 'text';
            this.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            this.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// Update the services endpoint handler
document.addEventListener('DOMContentLoaded', function() {
    // Get modal elements
    const quickServiceForm = document.getElementById('quickServiceForm');
    const ohServiceModal = document.getElementById('ohServiceModal');
    
    // Remove any existing event listeners
    if (quickServiceForm) {
        const newForm = quickServiceForm.cloneNode(true);
        quickServiceForm.parentNode.replaceChild(newForm, quickServiceForm);
        
        // Add single event listener to the new form
        newForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData();
            const name = document.getElementById('quickServiceName').value;
            let url = document.getElementById('quickServiceUrl').value;
            const price = document.getElementById('quickServicePrice').value || '0';
            const imageFile = document.getElementById('quickServiceLogo').files[0];

            // Add http:// if not present
            if (url && !url.startsWith('http')) {
                url = 'https://' + url;
            }
            
            // Validate required fields
            if (!name || !url) {
                alert('Please fill in all required fields');
                return;
            }
            
            // Notify user if no image was selected
            if (!imageFile) {
                console.log('No image file selected, will use default path');
                if (!confirm('No image selected. Continue with default service icon?')) {
                    return;
                }
            }
            
            // Add form data
            formData.append('name', name);
            formData.append('url', url);
            formData.append('price', price);
            formData.append('type', 'regular');
            
            // Only add image if one was selected
            if (imageFile) {
                formData.append('image', imageFile);
            }

            // Show loading indicator
            const submitBtn = newForm.querySelector('button[type="submit"]');
            let originalText = '';  // Declare originalText outside the if block
            if (submitBtn) {
                originalText = submitBtn.innerHTML;  // Assign value inside if block
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding service...';
            }

            try {
                const response = await fetch(getApiBaseUrl() + '/api/services', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                
                if (response.ok) {
                    // Properly close the modal
                    if (ohServiceModal) {
                        ohServiceModal.style.display = 'none';
                        document.body.style.overflow = ''; // Re-enable scrolling
                        document.body.style.paddingRight = ''; // Remove padding
                    }
                    
                    // Reset form and preview
                    newForm.reset();
                    const quickImagePreview = document.getElementById('quickImagePreview');
                    if (quickImagePreview) {
                        quickImagePreview.innerHTML = '';
                    }
                    
                    // Update services list in background
                    setTimeout(() => {
                        refreshServicesList();
                        showNotification('Service added successfully!', 'success');
                    }, 100);
                    
                } else {
                    throw new Error(data.error || 'Failed to add service');
                }
            } catch (error) {
                console.error('Error adding service:', error);
                showNotification(error.message, 'error');
            } finally {
                // Reset button state
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
        });
    }

    // Add modal cleanup handlers
    if (ohServiceModal) {
        // Close modal when clicking outside
        ohServiceModal.addEventListener('click', function(e) {
            if (e.target === ohServiceModal) {
                ohServiceModal.style.display = 'none';
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }
        });

        // Close modal when pressing ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && ohServiceModal.style.display === 'flex') {
                ohServiceModal.style.display = 'none';
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }
        });
    }
});

// Add this function to handle input field focus issues
document.addEventListener('DOMContentLoaded', function() {
    // Prevent click events from being blocked on input fields
    document.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            e.stopPropagation();
            e.target.focus();
        }
    }, true); // Using capture phase to ensure this runs before other handlers

    // Fix modal input fields specifically
    const modalInputs = document.querySelectorAll('.modal input, .modal select, .modal textarea');
    modalInputs.forEach(input => {
        input.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        input.addEventListener('focus', function(e) {
            e.stopPropagation();
        });
    });

    // Fix form input fields
    const formInputs = document.querySelectorAll('form input, form select, form textarea');
    formInputs.forEach(input => {
        input.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
    });
});

// Add password toggle functionality if not already present
document.querySelectorAll('.toggle-password').forEach(icon => {
    icon.addEventListener('click', function() {
        const input = this.previousElementSibling;
        if (input.type === 'password') {
            input.type = 'text';
            this.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            this.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// Add this function to handle service card clicks
function handleServiceClick(service) {
    console.log('Service clicked:', service);
    if (service && service.url) {
        // Use electron bridge to open URL with role
        window.electron.openInApp(service.url, 'admin');
    }
}

// Add click handler to service cards
function createServiceCard(service) {
    const card = document.createElement('div');
    card.className = 'service-card';
    
    // Improved image handling with fallbacks and logging
    let logoPath = '';
    const serviceName = service.name || '';
    
    if (service.image) {
        logoPath = service.image;
        console.log(`Using image for ${serviceName}: ${logoPath}`);
    } else if (service.logo) {
        logoPath = service.logo;
        console.log(`Using logo for ${serviceName}: ${logoPath}`);
    } else {
        // Try to generate based on name
        logoPath = `assets/6 Services logos/${serviceName.toLowerCase()}.png`;
        console.log(`No image found, using generated path: ${logoPath}`);
    }
    
    // Check if the image exists
    const img = new Image();
    img.onload = () => console.log(`Image for ${serviceName} loaded successfully`);
    img.onerror = () => console.warn(`Image at ${logoPath} for ${serviceName} could not be loaded`);
    img.src = logoPath;
    
    card.innerHTML = `
        <div class="service-image-container">
            <img src="${logoPath}" alt="${serviceName}" 
                 onerror="this.onerror=null; this.src='assets/images/service-placeholder.png'; console.warn('Fallback to placeholder for ${serviceName}');">
        </div>
        <h3>${serviceName}</h3>
        <p class="price">PKR ${service.price || 0}</p>
        <div class="service-actions">
            <button class="visit-btn">Visit Service</button>
        </div>
    `;

    // Add click handler to the visit button
    card.querySelector('.visit-btn').addEventListener('click', () => {
        if (service.url) {
            handleServiceClick(service);
        } else {
            showNotification('Service URL not available', 'warning');
        }
    });

    return card;
}

// Utility function for Pakistani time
function getPakistanTime(date) {
    return new Date(date).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Function to update dashboard timestamp
function updateDashboardTimestamp() {
    const timestampElement = document.getElementById('dashboardTimestamp');
    if (timestampElement) {
        const now = new Date();
        const pakistanTime = now.toLocaleString('en-US', {
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        timestampElement.textContent = `Last Updated: ${pakistanTime}`;
    }
}

// Helper function to safely format date
function safeFormatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? '-' : date.toLocaleString();
    } catch (e) {
        return '-';
    }
}

// Add to DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    const servicesTab = document.querySelector('.nav-item[data-page="services"]');
    if (servicesTab) {
        servicesTab.addEventListener('click', function() {
            console.log('Services tab clicked, refreshing services list...');
            if (typeof refreshServicesList === 'function') {
                refreshServicesList();
            } else {
                console.error('refreshServicesList function not found');
            }
        });
    }
    
    // Initialize services section if we're starting on the services page
    const hasServicesHash = window.location.hash === '#services';
    const servicesPage = document.getElementById('services-page');
    if (hasServicesHash && servicesPage) {
        console.log('Starting on services page, initializing...');
        if (typeof refreshServicesList === 'function') {
            refreshServicesList();
        } else {
            console.error('refreshServicesList function not found');
        }
    }
});

// Utility function to get the API base URL
function getApiBaseUrl() {
    return process.env.API_BASE_URL || 'http://venzell.skplay.net';
}

document.addEventListener("DOMContentLoaded", async () => {
    const sessionId = localStorage.getItem("session_id");
    const userRole = localStorage.getItem("user_role");
    
    console.log("Admin session validation - Session ID:", sessionId);
    console.log("Admin session validation - User Role:", userRole);

    if (!sessionId) {
        console.error("No session ID found. Redirecting to login page...");
        window.location.href = "login-popup.html";
        return;
    }

    try {
        // Initialize timestamp
        updateAdminDashboardTimestamp();
        // Update timestamp every second
        setInterval(updateAdminDashboardTimestamp, 1000);

        console.log("Fetching session and user data...");
        // Load all required data
        const [sessionRes, usersRes] = await Promise.all([
            fetch("sessions.json"),
            fetch("users.json")
        ]);

        if (!sessionRes.ok || !usersRes.ok) {
            throw new Error('Failed to fetch data: ' + 
                (!sessionRes.ok ? `Sessions (${sessionRes.status})` : '') + 
                (!usersRes.ok ? `Users (${usersRes.status})` : ''));
        }

        const sessions = await sessionRes.json();
        const users = await usersRes.json();
        
        console.log("Sessions data received:", Object.keys(sessions).length, "sessions");
        console.log("Users data received:", Object.keys(users).length, "users");

        // Find logged in admin
        let loggedInAdmin = null;
        let validAdminFound = false;
        
        // First try by session ID in sessions.json
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId) {
                loggedInAdmin = username;
                console.log("Found matching session for admin:", username);
                validAdminFound = true;
                break;
            }
        }
        
        // If not found by session, try matching the username directly from localStorage
        if (!validAdminFound) {
            const username = localStorage.getItem("username") || localStorage.getItem("user_email");
            if (username && users[username]) {
                loggedInAdmin = username;
                console.log("Using username from localStorage:", username);
                validAdminFound = true;
            }
        }

        // Validate that the user exists and is an admin
        if (!validAdminFound || !loggedInAdmin || !users[loggedInAdmin]) {
            console.error("Invalid admin session. Logged in user:", loggedInAdmin,
                "User exists:", loggedInAdmin ? !!users[loggedInAdmin] : false);
            localStorage.removeItem("session_id");
            localStorage.removeItem("user_role");
            window.location.href = "login-popup.html";
            return;
        }
        
        // Check if the user is actually an admin
        if (users[loggedInAdmin].role !== "admin") {
            console.error("User is not an admin. Role:", users[loggedInAdmin].role);
            // Redirect to appropriate page based on role
            if (users[loggedInAdmin].role === "reseller") {
                window.location.href = "reseller.html";
            } else if (users[loggedInAdmin].role === "user") {
                window.location.href = "user.html";
            } else {
                // For other roles or if unsure, go to login
                localStorage.removeItem("session_id");
                localStorage.removeItem("user_role");
                window.location.href = "login-popup.html";
            }
            return;
        }

        // Store current admin data
        const adminData = {
            ...users[loggedInAdmin],
            username: loggedInAdmin
        };
        window.currentAdmin = adminData;
        console.log("Admin data loaded successfully:", loggedInAdmin);

        // Update admin display
        document.querySelector('#adminName').textContent = adminData.username || 'Admin';
        
        // Set up WebSocket connection
        setupWebSocket(sessionId);
        
        // Load dashboard data
        await loadDashboardData();
        
        // Load all other data
        await Promise.all([
            loadUsers(),
            loadServices(adminData),
            loadTransactions()
        ]);

    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <p>Unable to load admin dashboard: ${error.message}</p>
            <button onclick="location.reload()">Retry</button>
            <button onclick="window.location.href='login-popup.html'">Return to Login</button>
        `;
        document.querySelector('.dashboard-container').prepend(errorMessage);
    }
});

// Add WebSocket setup function for admin panel
function setupWebSocket(sessionId) {
    if (!sessionId) {
        console.error("Cannot setup WebSocket: No session ID provided");
        return;
    }

    // Get the WebSocket server URL from the current URL
    let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host = window.location.host;
    
    // If host is empty (like in Electron apps or local file), use the API server
    if (!host || host === '') {
        getApiBaseUrl().then(apiUrl => {
            let apiHost = new URL(apiUrl).host;
            connectWebSocket(`${protocol}//${apiHost}?sessionId=${sessionId}`);
        }).catch(err => {
            console.error("Failed to get API URL for WebSocket:", err);
            // Try fallback to hardcoded URL
            connectWebSocket(`ws://venzell.skplay.net?sessionId=${sessionId}`);
        });
    } else {
        // Use current host if available
        connectWebSocket(`${protocol}//${host}?sessionId=${sessionId}`);
    }
    
    // Separate function to connect WebSocket to avoid duplicated code
    function connectWebSocket(wsUrl) {
        console.log(`Setting up WebSocket connection to: ${wsUrl}`);
        const socket = new WebSocket(wsUrl);

        socket.onopen = function() {
            console.log('WebSocket connection established');
        };

        socket.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data);

                if (data.action === 'service_updated') {
                    // Show notification to admin
                    const message = data.message || `Service ${data.service} has been ${data.operation} for user ${data.user || 'unknown'}.`;
                    const notificationType = 'info';
                    
                    showNotification(message, notificationType);
                    
                    // Refresh admin panels
                    Promise.all([
                        loadUsers(),
                        loadUserServices(),
                        updateServiceStats()
                    ]).catch(err => {
                        console.warn('Error refreshing data after service update notification:', err);
                    });
                }
                
                // Handle user logout events
                if (data.action === 'user_logout') {
                    showNotification(`User ${data.username} has logged out`, 'info');
                    // Refresh session tables
                    updateSessionsTable();
                }
                
                // Handle force logout events
                if (data.action === 'force_logout') {
                    // If this is directed at the admin, log them out
                    const currentSessionId = localStorage.getItem('session_id');
                    const socketSessionId = new URLSearchParams(socket.url.split('?')[1]).get('sessionId');
                    
                    if (currentSessionId === socketSessionId) {
                        // This admin's session was terminated
                        showNotification(data.message || 'Your session has been terminated by another admin', 'error');
                        
                        // Clear local session data
                        localStorage.removeItem('session_id');
                        localStorage.removeItem('user_role');
                        localStorage.removeItem('username');
                        
                        // Redirect to login page after a short delay
                        setTimeout(() => {
                            window.location.href = 'login-popup.html';
                        }, 2000);
                    } else {
                        // Another user's session was terminated
                        updateSessionsTable();
                        loadActiveSessions();
                        showNotification('A user session has been terminated', 'info');
                    }
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        socket.onclose = function() {
            console.log('WebSocket connection closed');
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log('Attempting to reconnect WebSocket...');
                setupWebSocket(sessionId);
            }, 5000);
        };

        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
        };

        window.adminWebSocket = socket;
        return socket;
    }
}

// Add updates page handler to the document ready function
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    // Add event listener for the updates menu item
    document.getElementById('menuUpdates').addEventListener('click', function() {
        switchPage('updates');
        loadVersionInfo();
        loadUpdateHistory();
    });
    
    // Add event listener for the update form
    const updateForm = document.getElementById('updateForm');
    if (updateForm) {
        updateForm.addEventListener('submit', handleUpdateUpload);
    }
    
    // ... existing code ...
});

// Add these functions at the end of the file
// Function to load the current version information
function loadVersionInfo() {
    const versionInfoContainer = document.getElementById('currentVersionInfo');
    versionInfoContainer.innerHTML = '<div class="loading-spinner"></div> Loading version information...';
    
    fetch(`${getApiBaseUrl()}/updates/latest.json`)
        .then(response => {
            if (!response.ok) {
                // Create a more user-friendly error message based on status code
                let errorMessage = '';
                if (response.status === 404) {
                    errorMessage = 'Update information not found. The update server may not be configured yet.';
                } else if (response.status >= 500) {
                    errorMessage = 'Server error. Please try again later.';
                } else {
                    errorMessage = `Server responded with ${response.status}`;
                }
                throw new Error(errorMessage);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.version) {
                const releaseDate = data.releaseDate ? formatDate(new Date(data.releaseDate)) : 'Unknown';
                const platformsHtml = data.platforms ? 
                    Object.keys(data.platforms)
                        .map(platform => {
                            const [os, arch] = platform.split('-');
                            return `<li><strong>${os === 'win32' ? 'Windows' : os === 'darwin' ? 'macOS' : 'Linux'} (${arch}):</strong> Available</li>`;
                        })
                        .join('') : '';
                
                versionInfoContainer.innerHTML = `
                    <div class="version-info">
                        <div class="version-header">
                            <h3>Version ${data.version}</h3>
                            <span class="version-date">Released: ${releaseDate}</span>
                        </div>
                        <div class="version-details">
                            <p><strong>Release Notes:</strong></p>
                            <p>${data.releaseNotes || 'No release notes provided.'}</p>
                            
                            <p><strong>Available Platforms:</strong></p>
                            <ul>
                                ${platformsHtml || '<li>No platform information available</li>'}
                            </ul>
                        </div>
                    </div>
                `;
            } else {
                versionInfoContainer.innerHTML = `
                    <div class="version-info">
                        <p>No version information available.</p>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('Error loading version info:', error);
            versionInfoContainer.innerHTML = `
                <div class="version-info">
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Error loading version information: ${error.message}</span>
                    </div>
                    <button class="btn btn-primary" onclick="loadVersionInfo()">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        });
}

// Function to load update history
function loadUpdateHistory() {
    const updateHistoryTable = document.getElementById('updateHistoryTable');
    if (!updateHistoryTable) return;
    
    const tableBody = updateHistoryTable.querySelector('tbody');
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center">
                <div class="loading-spinner"></div>
                <div>Loading update history...</div>
            </td>
        </tr>
    `;
    
    // Fetch the update history from the server
    fetch(getApiBaseUrl() + '/updates/history')
        .then(response => {
            if (!response.ok) {
                // Create a more user-friendly error message based on status code
                let errorMessage = '';
                if (response.status === 404) {
                    errorMessage = 'Update history not found. The update server may not be configured yet.';
                } else if (response.status >= 500) {
                    errorMessage = 'Server error. Please try again later.';
                } else {
                    errorMessage = `Server responded with ${response.status}`;
                }
                throw new Error(errorMessage);
            }
            return response.json();
        })
        .then(updates => {
            if (!updates || updates.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center">
                            <div class="empty-state">
                                <i class="fas fa-info-circle"></i>
                                <p>No updates have been uploaded yet.</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            // Sort updates by date (newest first)
            updates.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

            // Generate table rows for each update
            const html = updates.map(update => {
                const status = update.status || 'Available';
                const statusClass = getUpdateStatusClass(status);
                
                return `
                    <tr>
                        <td>${update.version}</td>
                        <td>${update.platform || 'All'}</td>
                        <td>${update.architecture || 'All'}</td>
                        <td>${formatDate(update.releaseDate)}</td>
                        <td>
                            <div class="release-notes-preview">
                                ${update.releaseNotes || 'No release notes available.'}
                            </div>
                        </td>
                        <td>
                            <span class="status-badge ${statusClass}">
                                ${status}
                            </span>
                        </td>
                        <td>
                            <div class="table-actions">
                                <a href="${update.downloadUrl || '#'}" 
                                   target="_blank" 
                                   class="table-action-btn download"
                                   ${!update.downloadUrl ? 'disabled' : ''}>
                                    <i class="fas fa-download"></i> Download
                                </a>
                                ${update.status === 'Available' ? `
                                <button class="table-action-btn delete" 
                                        onclick="deleteUpdate('${update.version}', '${update.platform}')">
                                    <i class="fas fa-trash"></i>
                                </button>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
            
            tableBody.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading update history:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>Failed to load update history: ${error.message}</span>
                        </div>
                        <button class="btn btn-primary" onclick="loadUpdateHistory()" style="margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> Retry
                        </button>
                    </td>
                </tr>
            `;
        });
}

// Helper function to get status class for updates
function getUpdateStatusClass(status) {
    switch (status.toLowerCase()) {
        case 'available':
            return 'status-success';
        case 'pending':
            return 'status-warning';
        case 'deprecated':
            return 'status-danger';
        default:
            return 'status-info';
    }
}

// Function to delete an update
function deleteUpdate(version, platform) {
    if (!confirm(`Are you sure you want to delete version ${version} for ${platform}?`)) {
        return;
    }

    fetch(`${getApiBaseUrl()}/updates/${version}/${platform}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete update');
        }
        showNotification('Update deleted successfully', 'success');
        loadUpdateHistory(); // Refresh the table
    })
    .catch(error => {
        console.error('Error deleting update:', error);
        showNotification('Failed to delete update: ' + error.message, 'error');
    });
}

// Function to handle update upload
function handleUpdateUpload(event) {
    event.preventDefault();
    
    const formData = new FormData(document.getElementById('updateForm'));
    const sessionId = localStorage.getItem('session_id');
    
    // Get form values for validation
    const version = formData.get('version');
    const platform = formData.get('platform');
    const architecture = formData.get('architecture');
    const releaseNotes = formData.get('releaseNotes') || `Version ${version} update`;
    const updateFile = document.getElementById('updateFile').files[0];
    
    // Add additional fields needed for latest.json
    formData.append('updateLatestJson', 'true'); // Flag to tell server to update latest.json
    formData.append('releaseDate', new Date().toISOString()); // Current date as release date
    
    // Create the expected download URL path that users will access
    const platformArchPath = `${platform}-${architecture}`;
    const downloadFileName = updateFile.name;
    const downloadUrl = `${getApiBaseUrl()}/updates/${platformArchPath}/${downloadFileName}`;
    formData.append('downloadUrl', downloadUrl);
    
    // Validate version format (semver)
    const semverPattern = /^\d+\.\d+\.\d+$/;
    if (!semverPattern.test(version)) {
        showNotification('Invalid version format. Must be in format: x.y.z (e.g., 1.0.0)', 'error');
        return;
    }
    
    // Validate file extension based on platform
    const fileName = updateFile.name;
    const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    
    const validFormats = {
        win32: ['.exe', '.msi', '.nupkg', '.zip'],
        darwin: ['.dmg', '.pkg', '.zip'],
        linux: ['.appimage', '.deb', '.rpm', '.snap', '.tar.gz', '.zip']
    };

    const validExtensions = validFormats[platform] || [];
    
    if (!validExtensions.includes(fileExt)) {
        showNotification(
            `Invalid file format for ${platform}. Allowed formats: ${validExtensions.join(', ')}`, 
            'error'
        );
        return;
    }
    
    // Show loading state and create progress bar
    const submitButton = document.querySelector('#updateForm button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;

    // Create or get progress container
    let progressContainer = document.querySelector('.upload-progress-container');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.className = 'upload-progress-container';
        submitButton.parentNode.insertBefore(progressContainer, submitButton.nextSibling);
    }

    // Create progress elements
    progressContainer.innerHTML = `
        <div class="progress-bar-container">
            <div class="progress-bar"></div>
        </div>
        <div class="progress-text">0%</div>
    `;

    const progressBar = progressContainer.querySelector('.progress-bar');
    const progressText = progressContainer.querySelector('.progress-text');
    
    // Create XMLHttpRequest to track progress
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percentComplete + '%';
            progressText.textContent = percentComplete + '%';
            
            // Update button text with percentage
            submitButton.innerHTML = `<i class="fas fa-upload"></i> Uploading... ${percentComplete}%`;
        }
    });

    xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success || response.status === 'success') {
                    showNotification(`Update v${version} uploaded successfully! latest.json has been updated.`, 'success');
                    document.getElementById('updateForm').reset();
                    
                    // Refresh the version info and history
                    loadVersionInfo();
                    loadUpdateHistory();
                } else {
                    showNotification(`Failed to upload update: ${response.message}`, 'error');
                }
            } catch (error) {
                showNotification('Error processing server response', 'error');
            }
        } else {
            showNotification(`Upload failed with status: ${xhr.status}`, 'error');
        }

        // Reset UI
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        progressContainer.remove();
    });

    xhr.addEventListener('error', () => {
        showNotification('Error uploading update. Check console for details.', 'error');
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        progressContainer.remove();
    });

    xhr.addEventListener('abort', () => {
        showNotification('Upload was cancelled', 'warning');
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        progressContainer.remove();
    });

    // Open and send the request
    xhr.open('POST', `${getApiBaseUrl()}/admin/upload-update`);
    xhr.setRequestHeader('Authorization', `Bearer ${sessionId}`);
    xhr.send(formData);
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Initialize the updates page functionality
function initializeUpdatesPage() {
    // Check if the updates page is active
    const updatesPage = document.getElementById('updates-page');
    if (!updatesPage || !updatesPage.classList.contains('active')) {
        return;
    }
    
    console.log('Initializing updates page');
    
    // Load current version info
    loadVersionInfo();
    
    // Load update history
    loadUpdateHistory();
    
    // Set up event listener for update form submission
    const updateForm = document.getElementById('updateForm');
    if (updateForm) {
        updateForm.addEventListener('submit', handleUpdateUpload);
    }
    
    // Add responsive behavior for the updates page
    handleUpdatesPageResponsiveness();
}

// Handle responsive behavior for updates page
function handleUpdatesPageResponsiveness() {
    // Check if we're on a mobile device
    const isMobile = window.innerWidth <= 768;
    
    // Get updates page elements
    const updatesPage = document.getElementById('updates-page');
    if (!updatesPage) return;
    
    // Adjust form layout for mobile
    const formActions = updatesPage.querySelector('.form-actions');
    if (formActions) {
        formActions.style.flexDirection = isMobile ? 'column' : 'row';
        
        // Adjust button width
        const buttons = formActions.querySelectorAll('.btn');
        buttons.forEach(btn => {
            btn.style.width = isMobile ? '100%' : 'auto';
            btn.style.justifyContent = isMobile ? 'center' : 'flex-start';
        });
    }
    
    // Make table scrollable on mobile
    const tableContainer = updatesPage.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.style.overflowX = 'auto';
    }
}

// Add window resize event listener for responsive behavior
window.addEventListener('resize', handleUpdatesPageResponsiveness);

// Add event listeners when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Set up navigation and page switching
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-page') === 'updates') {
            item.addEventListener('click', function() {
                // Initialize updates page when the tab is clicked
                setTimeout(() => {
                    console.log('Updates tab clicked');
                    initializeUpdatesPage();
                    
                    // Initialize reset version buttons
                    const resetVersionButton = document.getElementById('resetVersionButton');
                    const debugVersionButton = document.getElementById('debugVersionButton');
                    
                    if (resetVersionButton) {
                        resetVersionButton.addEventListener('click', resetVersionFiles);
                    }
                    
                    if (debugVersionButton) {
                        debugVersionButton.addEventListener('click', debugVersionFiles);
                    }
                }, 100); // Small delay to ensure the page is active
            });
        }
    });
    
    // Check if we should initialize the updates page on load
    const currentPage = localStorage.getItem('currentAdminPage');
    const hashPage = window.location.hash.slice(1);
    if (currentPage === 'updates' || hashPage === 'updates') {
        setTimeout(() => {
            console.log('Initializing updates page on load');
            initializeUpdatesPage();
            
            // Initialize reset version buttons
            const resetVersionButton = document.getElementById('resetVersionButton');
            const debugVersionButton = document.getElementById('debugVersionButton');
            
            if (resetVersionButton) {
                resetVersionButton.addEventListener('click', resetVersionFiles);
            }
            
            if (debugVersionButton) {
                debugVersionButton.addEventListener('click', debugVersionFiles);
            }
        }, 100);
    }
});

// Function to reset version files
function resetVersionFiles() {
    console.log('Reset version files button clicked');
    const version = document.getElementById('resetVersion').value;
    const downloadUrl = document.getElementById('resetDownloadUrl').value;
    const notes = document.getElementById('resetNotes').value;
    
    if (!version) {
        showNotification('Version number is required', 'error');
        return;
    }
    
    const sessionId = localStorage.getItem('session_id');
    
    // Show processing notification
    showNotification('Resetting version files...', 'info');
    
    // Send request to reset version files
    fetch(`${getApiBaseUrl()}/admin/reset-version-files`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({
            version,
            downloadUrl,
            notes,
            sessionId
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Version files reset:', data);
        showNotification(`Version files reset to ${version}`, 'success');
        
        // Clear form
        document.getElementById('resetVersion').value = '';
        document.getElementById('resetDownloadUrl').value = '';
        document.getElementById('resetNotes').value = '';
        
        // Refresh version info
        loadVersionInfo();
    })
    .catch(error => {
        console.error('Error resetting version files:', error);
        showNotification(`Error: ${error.message}`, 'error');
    });
}

// Debug version files
function debugVersionFiles() {
    console.log('Debug version files button clicked');
    
    // Show processing notification
    showNotification('Fetching version file debug info...', 'info');
    
    // Open debug endpoint in new window/tab
    window.open(`${getApiBaseUrl()}/debug/update-files`, '_blank');
}

