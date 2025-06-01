// user.js - Enhanced with detailed dates
const DEBUG = true;

// Safe process access through the electron API
const process = window.electron?.process || { env: {} };

// Add CSS styles for the update progress bar when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    const updateProgressStyles = document.createElement('style');
    updateProgressStyles.textContent = `
    /* Background overlay for download progress */
    .update-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9998;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    
    .update-progress-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #1a1a2e;
        border: 2px solid #0f3460;
        border-radius: 8px;
        padding: 20px;
        width: 400px;
        z-index: 9999;
        color: #e7e7e7;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
    }

    .update-progress-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-weight: bold;
        font-size: 14px;
    }

    .update-progress-percent {
        color: #16c79a;
        font-weight: bold;
    }

    .progress-bar-container {
        width: 100%;
        height: 15px;
        background-color: #2a2a4a;
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 8px;
    }

    .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #16c79a, #3f72af);
        width: 0%;
        transition: width 0.3s ease;
        box-shadow: 0 0 10px rgba(22, 199, 154, 0.5);
    }

    .update-progress-details {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #b3b3b3;
    }

    .update-complete {
        color: #16c79a;
        font-weight: bold;
    }

    /* Add some animation for the download speed display */
    .download-speed {
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0% { opacity: 0.7; }
        50% { opacity: 1; }
        100% { opacity: 0.7; }
    }
    `;
    document.head.appendChild(updateProgressStyles);
});

// Function to get the API base URL - ALWAYS USE PRODUCTION
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

function debugLog(...args) {
    if (DEBUG) {
        console.log('[DEBUG]', ...args);
    }
}

// Function to update user dashboard timestamp
function updateUserDashboardTimestamp() {
    const timestampElement = document.getElementById('userDashboardTimestamp');
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

document.addEventListener("DOMContentLoaded", async () => {
    const sessionId = localStorage.getItem("session_id");
    const userRole = localStorage.getItem("user_role");
    
    console.log("Session validation - Session ID:", sessionId);
    console.log("Session validation - User Role:", userRole);

    if (!sessionId) {
        console.error("No session ID found. Redirecting to login page...");
        window.location.href = "login-popup.html";
        return;
    }

    try {
        // Initialize timestamp immediately
        updateUserDashboardTimestamp();
        // Update timestamp every second
        setInterval(updateUserDashboardTimestamp, 1000);

        // Get API base URL
        const apiBaseUrl = getApiBaseUrl();
        console.log("Using API base URL:", apiBaseUrl);

        // Load all required data from API
        console.log("Fetching session and user data from API...");
        let sessionRes, usersRes;

        try {
            // Try to fetch from API first
            [sessionRes, usersRes] = await Promise.all([
                fetch(`${apiBaseUrl}/admin/sessions`),
                fetch(`${apiBaseUrl}/admin/users`)
            ]);
        } catch (apiError) {
            console.error("Error fetching from API:", apiError);
            console.log("Falling back to local files...");
            
            // Fall back to local files if API fails
            [sessionRes, usersRes] = await Promise.all([
                fetch("sessions.json"),
                fetch("users.json")
            ]);
        }

        if (!sessionRes.ok || !usersRes.ok) {
            throw new Error('Failed to fetch data: ' + 
                (!sessionRes.ok ? `Sessions (${sessionRes.status})` : '') + 
                (!usersRes.ok ? `Users (${usersRes.status})` : ''));
        }

        const sessions = await sessionRes.json();
        const users = await usersRes.json();
        
        console.log("Sessions data received:", Object.keys(sessions).length, "sessions");
        console.log("Users data received:", Object.keys(users).length, "users");

        // Find logged in user
        let loggedInUser = null;
        let validUserFound = false;
        
        // First try by session ID in sessions.json
        for (const username in sessions) {
            if (sessions[username].sessionId === sessionId) {
                loggedInUser = username;
                console.log("Found matching session for user:", username);
                validUserFound = true;
                break;
            }
        }
        
        // If not found by session, try matching the username directly from localStorage
        if (!validUserFound) {
            const username = localStorage.getItem("username") || localStorage.getItem("user_email");
            if (username && users[username]) {
                loggedInUser = username;
                console.log("Using username from localStorage:", username);
                validUserFound = true;
            }
        }
        
        // Final validation to ensure we have a valid user
        if (!validUserFound || !loggedInUser || !users[loggedInUser]) {
            console.error("Invalid session. Logged in user:", loggedInUser, 
                "User exists in database:", loggedInUser ? !!users[loggedInUser] : false);
            localStorage.removeItem("session_id");
            localStorage.removeItem("user_role");
            window.location.href = "login-popup.html";
            return;
        }
        
        // Check if user role is admin and redirect if necessary
        if (users[loggedInUser].role === 'admin') {
            console.log("User is an admin. Redirecting to admin page...");
            window.location.href = "admin.html";
            return;
        }

        // Check if user role is reseller and redirect if necessary
        if (users[loggedInUser].role === 'reseller') {
            console.log("User is a reseller. Redirecting to reseller page...");
            window.location.href = "reseller.html";
            return;
        }

        // Store current user data with username
        const userData = {
            ...users[loggedInUser],
            username: loggedInUser
        };
        window.currentUser = userData;
        console.log("User data loaded successfully:", loggedInUser);

        // Update UI elements
        document.querySelector('#userName').textContent = userData.username || 'User';
        
        // Update profile information
        updateUserProfile(userData);

        // Load services with the updated function
        await loadServices(userData);

    } catch (error) {
        console.error("Error loading dashboard:", error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <p>Unable to load dashboard data: ${error.message}</p>
            <button onclick="location.reload()">Retry</button>
            <button onclick="window.location.href='login-popup.html'">Return to Login</button>
        `;
        document.querySelector('.container').prepend(errorMessage);
    }
});

function updateMembershipDetails(userData) {
    const membershipCard = document.querySelector('.membership-card .card-content');
    if (membershipCard) {
        membershipCard.innerHTML = `
            <h3>Membership Details</h3>
            <p id="subscriptionPlan">${userData.subscription || 'Basic Plan'}</p>
            <p class="join-date">Joined: ${formatDetailedDate(userData.joinDate)}</p>
            <p id="membershipStatus">Status: ${userData.status || 'Active'}</p>
            <p id="expiryDate">Expires: ${formatDetailedDate(userData.expiryDate)}</p>
        `;
    }
}

function createServiceCard(serviceName, serviceData) {
    const card = document.createElement("div");
    card.className = "card";
    
    const now = new Date();
    const assignedDate = serviceData.assignedDate ? new Date(serviceData.assignedDate) : null;
    const expirationDate = serviceData.expiryDate ? new Date(serviceData.expiryDate) : null;
    
    let timeLeft = 0;
    let timeLeftDisplay = '(Expired)';
    let statusClass = 'expired';
    
    if (expirationDate && expirationDate > now) {
        timeLeft = expirationDate - now;
        timeLeftDisplay = formatTimeRemaining(timeLeft);
        statusClass = timeLeft < (24 * 60 * 60 * 1000) ? 'warning' : 'active';
    }

    // Improved image path handling
    let logoPath = '';
    const apiBaseUrl = getApiBaseUrl();
    
    // Check for image in service data
    if (serviceData.image) {
        // If the image is already a full URL, use it directly
        if (serviceData.image.startsWith('http') || serviceData.image.startsWith('data:')) {
            logoPath = serviceData.image;
        } else {
            // Otherwise, prepend the API base URL
            logoPath = `${apiBaseUrl}/${serviceData.image.replace(/^\/+/, '')}`;
        }
        console.log(`Using provided image: ${logoPath}`);
    } else if (serviceData.logo) {
        // If the logo is already a full URL, use it directly
        if (serviceData.logo.startsWith('http') || serviceData.logo.startsWith('data:')) {
            logoPath = serviceData.logo;
        } else {
            // Otherwise, prepend the API base URL
            logoPath = `${apiBaseUrl}/${serviceData.logo.replace(/^\/+/, '')}`;
        }
        console.log(`Using provided logo: ${logoPath}`);
    } else {
        // Use a placeholder image with API base URL
        logoPath = `${apiBaseUrl}/assets/images/service-placeholder.png`;
        console.log(`No image found for service '${serviceName}', using placeholder`);
    }

    card.innerHTML = `
        <div class="service-status ${statusClass}">
            <i class="fas ${statusClass === 'active' ? 'fa-check-circle' : 
                          statusClass === 'warning' ? 'fa-exclamation-circle' : 
                          'fa-times-circle'}"></i>
            ${statusClass.charAt(0).toUpperCase() + statusClass.slice(1)}
        </div>
        
        <div class="card-header">
            <img src="${logoPath}" 
                 alt="${serviceName}" 
                 onerror="this.onerror=null; this.src='${apiBaseUrl}/assets/images/service-placeholder.png'">
            <div class="card-title">
                <h3>${serviceName}</h3>
            </div>
        </div>

        <div class="service-dates">
            <div class="date-item">
                <span class="date-label">
                    <i class="fas fa-calendar-plus"></i>
                    Assigned Date
                </span>
                <span class="date-value">
                    ${assignedDate ? formatDateTime(assignedDate) : 'N/A'}
                </span>
            </div>
            <div class="date-item ${timeLeft > 0 && timeLeft < (24 * 60 * 60 * 1000) ? 'expiring-soon' : ''}">
                <span class="date-label">
                    <i class="fas fa-calendar-times"></i>
                    Expiry Date
                </span>
                <span class="date-value">
                    ${expirationDate ? formatDateTime(expirationDate) : 'N/A'}
                    ${timeLeft > 0 ? `<span class="time-remaining">${timeLeftDisplay}</span>` : ''}
                </span>
            </div>
        </div>

        <div class="service-actions">
            <button class="service-btn access-btn" data-service="${serviceName}">
                <i class="fas fa-arrow-right"></i>
                Access Service
            </button>
            ${timeLeft > 0 && timeLeft < (7 * 24 * 60 * 60 * 1000) ? `
            ` : ''}
        </div>
    `;

    // IMPORTANT: Remove any existing click handlers first
    const accessButton = card.querySelector('.access-btn');
    const clonedButton = accessButton.cloneNode(true);
    accessButton.parentNode.replaceChild(clonedButton, accessButton);

    // Add our new click handler
    clonedButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop event bubbling
        
        debugLog('Button clicked');
        debugLog('Service data:', serviceData);
        
        try {
            debugLog('Opening regular service in new tab');
            window.electron.openInApp(serviceData.url, 'user');
        } catch (error) {
            console.error('Error handling service access:', error);
            // Fallback to direct URL opening
            window.electron.openInApp(serviceData.url, 'user');
        }
    });

    return card;
}

// Utility function for Pakistani time
function getPakistanTime(date) {
    return new Date(date).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Update formatDetailedDate function
function formatDetailedDate(dateString) {
    return getPakistanTime(dateString);
}

// Update formatDateTime function
function formatDateTime(date) {
    return getPakistanTime(date);
}

function calculateDaysLeft(expiryDate) {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateHoursLeft(expiryDate) {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60));
}

function getStatusClass(daysLeft) {
    if (daysLeft <= 0) return 'expired';
    if (daysLeft <= 7) return 'warning';
    return 'active';
}

// Keep existing logout functionality
function logout() {
    const sessionId = localStorage.getItem("session_id");

    if (!sessionId || sessionId.trim() === "") {
        alert("No active session found.");
        return;
    }

    // First clear local storage to ensure user can log out even if the API call fails
    // Notify main process about role change before clearing storage
    if (window.electron && window.electron.notifyRoleChange) {
        window.electron.notifyRoleChange(null); // null indicates logged out
    }
    
    // Clear local storage
    localStorage.removeItem("session_id");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_email");
    
    // Try to notify the server, but don't block logout if it fails
    fetch(getApiBaseUrl() + "/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId })
    })
    .then(response => {
        try {
            return response.json();
        } catch (error) {
            console.warn("Non-JSON response from logout endpoint:", error);
            return { status: "error", message: "Invalid server response" };
        }
    })
    .then(data => {
        if (data.status === "success") {
            console.log("✅ Logout successful:", data);
        } else {
            console.warn("Server reported logout issue:", data.message);
        }
        // Always redirect regardless of server response
        window.location.href = "login-popup.html";
    })
    .catch(err => {
        console.error("❌ Error during logout:", err);
        // Still redirect to login page even if the server request failed
        window.location.href = "login-popup.html";
    });
}

// Update the showNotification function to handle update notifications
function showNotification(message, type = "info", onClick = null) {
    const notificationContainer = document.getElementById('notificationContainer') || createNotificationContainer();
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Add appropriate icon based on notification type
    let icon;
    switch (type) {
        case 'success':
            icon = 'check-circle';
            break;
        case 'error':
            icon = 'exclamation-circle';
            break;
        case 'warning':
            icon = 'exclamation-triangle';
            break;
        case 'update':
            icon = 'sync';
            break;
        default:
            icon = 'info-circle';
    }
    
    // Set notification content with icon
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
        <button class="close-notification"><i class="fas fa-times"></i></button>
    `;
    
    // Add click handler if provided
    if (onClick && typeof onClick === 'function') {
        notification.addEventListener('click', (e) => {
            // Don't trigger onClick if clicking the close button
            if (!e.target.closest('.close-notification')) {
                onClick();
            }
        });
        
        // Add cursor pointer to indicate it's clickable
        notification.style.cursor = 'pointer';
    }
    
    // Add click handler for close button
    notification.querySelector('.close-notification').addEventListener('click', () => {
        notification.classList.add('closing');
        setTimeout(() => {
            notificationContainer.removeChild(notification);
            
            // Remove container if empty
            if (notificationContainer.children.length === 0) {
                document.body.removeChild(notificationContainer);
            }
        }, 300);
    });
    
    // Add to container
    notificationContainer.appendChild(notification);
    
    // Auto-remove after delay (except for update notifications)
    if (type !== 'update') {
        setTimeout(() => {
            // Check if notification still exists
            if (notification.parentNode) {
                notification.classList.add('closing');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notificationContainer.removeChild(notification);
                        
                        // Remove container if empty
                        if (notificationContainer.children.length === 0) {
                            document.body.removeChild(notificationContainer);
                        }
                    }
                }, 300);
            }
        }, 5000);
    }
    
    return notification;
}

// Helper function to create notification container if it doesn't exist
function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notificationContainer';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

// Add a function to check for updates manually
async function checkForUpdates() {
    console.log('Checking for updates...');
    const updateMessage = document.getElementById('updateMessage');
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
    
    // Disable update button while checking
    if (checkUpdatesBtn) {
        checkUpdatesBtn.disabled = true;
        checkUpdatesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    }
    
    if (updateMessage) {
        updateMessage.textContent = 'Checking for updates...';
    }
    
    // Clear any existing progress containers
    removeProgressContainer();
    
    // Clear any previous install link behavior
    const installLink = document.getElementById('installUpdateLink');
    if (installLink) {
        // Reset to default state
        const newInstallLink = installLink.cloneNode(true);
        installLink.parentNode.replaceChild(newInstallLink, installLink);
        newInstallLink.textContent = 'Install Update';
        newInstallLink.classList.remove('ready-to-install');
    }
    
    // Get API base URL
    const apiBaseUrl = getApiBaseUrl();
    const updateUrl = `${apiBaseUrl}/updates/latest.json`;
    
    // Add cache-busting parameter
    const cacheBuster = `?_=${Date.now()}`;
    
    // Perform the update check
    fetch(`${updateUrl}${cacheBuster}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => processUpdateData(data))
        .catch(error => {
            console.error('Update check failed:', error);
            if (updateMessage) {
                updateMessage.textContent = `Failed to check for updates: ${error.message}`;
            }
            showNotification(`Failed to check for updates: ${error.message}`, 'error');
            
            // Re-enable update button
            if (checkUpdatesBtn) {
                checkUpdatesBtn.disabled = false;
                checkUpdatesBtn.innerHTML = '<i class="fas fa-sync"></i> Check for Updates';
            }
        });
}

function formatTimeRemaining(timeInMs) {
    const days = Math.floor(timeInMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeInMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeInMs % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) return `(${days}d ${hours}h remaining)`;
    if (hours > 0) return `(${hours}h ${minutes}m remaining)`;
    return `(${minutes}m remaining)`;
}

// Update the profile display function to remove password change functionality
function updateUserProfile(userData) {
    // Update welcome message with username and daily message
    const username = userData.username || loggedInUser;
    document.querySelector('#userName').textContent = username;
    document.querySelector('.welcome-message').innerHTML = `
        <h1>Welcome, <span id="userName">${username}</span>!</h1>
        <p class="daily-message">What will you try today?</p>
    `;
    
    // Update profile card without password change button
    const profileCard = document.querySelector('.profile-card .card-content');
    if (profileCard) {
        profileCard.innerHTML = `
            <div class="card-icon">
                <i class="fas fa-user-shield"></i>
            </div>
            <h3>Profile Information</h3>
            <p><i class="fas fa-user"></i> Username: ${username}</p>
            <p><i class="fas fa-shield-alt"></i> Role: ${userData.role || 'User'}</p>
        `;
    }

    // Update membership card
    const membershipCard = document.querySelector('.membership-card .card-content');
    if (membershipCard) {
        const joinDate = userData.joinDate ? formatDateTime(new Date(userData.joinDate)) : 'N/A';
        const status = userData.status || 'Active';
        const statusClass = status.toLowerCase();

        membershipCard.innerHTML = `
            <h3>Membership Details</h3>
            <div class="membership-info">
                <p class="join-date">
                    <i class="fas fa-calendar-plus"></i>
                    Joined: ${joinDate}
                </p>
                <div class="status-badge ${statusClass}">
                    <i class="fas fa-circle"></i>
                    ${status}
                </div>
            </div>
        `;
    }
}

// Update form submission handler to remove password change functionality
document.addEventListener('submit', async (e) => {
    // No password change form handling needed
});

// Update getCurrentUserData to properly fetch from window.currentUser
function getCurrentUserData() {
    if (!window.currentUser) {
        const sessionId = localStorage.getItem("session_id");
        const username = localStorage.getItem("username") || localStorage.getItem("user_email");
        
        if (!sessionId || !username) {
            return {};
        }
        
        // Try to reload user data from API
        console.log("Current user data not found in memory, fetching from API...");
        const apiBaseUrl = getApiBaseUrl();
        
        // We'll return an empty object now, but try to load the data for next time
        fetch(`${apiBaseUrl}/admin/users`)
            .then(res => res.json())
            .then(users => {
                if (users[username]) {
                    console.log("Retrieved user data from API:", users[username]);
                    window.currentUser = {
                        ...users[username],
                        username: username
                    };
                } else {
                    console.warn("User not found in API data");
                    // Try local fallback as last resort
                    return fetch("users.json");
                }
            })
            .then(res => {
                if (res && res.ok) return res.json();
                return null;
            })
            .then(users => {
                if (users && users[username]) {
                    console.log("Retrieved user data from local file:", users[username]);
                    window.currentUser = {
                        ...users[username],
                        username: username
                    };
                }
            })
            .catch(err => console.error("Error loading user data:", err));
    }
    return window.currentUser || {};
}

// Simplified modal for password change only
function createEditProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'editProfileModal';
    modal.className = 'modal';
    
    // Add styles for disabled form state
    const style = document.createElement('style');
    style.textContent = `
        .form-group.disabled {
            opacity: 0.7;
            pointer-events: none;
        }
        .form-group.disabled input {
            background-color: #f5f5f5;
        }
        .password-input {
            position: relative;
            display: flex;
            align-items: center;
        }
        .password-input input {
            flex: 1;
            padding-right: 40px;
        }
        .password-input .toggle-password {
            position: absolute;
            right: 10px;
            cursor: pointer;
            color: #6c757d;
        }
        .password-input .toggle-password:hover {
            color: #495057;
        }
        .save-btn.loading {
            position: relative;
            pointer-events: none;
        }
        .save-btn.loading:after {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            margin: auto;
            border: 2px solid transparent;
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: button-loading-spinner 1s ease infinite;
        }
        @keyframes button-loading-spinner {
            from {
                transform: rotate(0turn);
            }
            to {
                transform: rotate(1turn);
            }
        }
    `;
    document.head.appendChild(style);
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Change Password</h2>
                <button class="close-btn" onclick="closeEditProfileModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="editProfileForm">
                    <div class="form-group">
                        <label for="currentPassword">Current Password</label>
                        <div class="password-input">
                            <input type="password" id="currentPassword" required>
                            <i class="fas fa-eye toggle-password"></i>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="newPassword">New Password</label>
                        <div class="password-input">
                            <input type="password" id="newPassword" required>
                            <i class="fas fa-eye toggle-password"></i>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="confirmPassword">Confirm New Password</label>
                        <div class="password-input">
                            <input type="password" id="confirmPassword" required>
                            <i class="fas fa-eye toggle-password"></i>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="save-btn">Update Password</button>
                        <button type="button" class="cancel-btn" onclick="closeEditProfileModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Add password toggle functionality
    modal.querySelectorAll('.toggle-password').forEach(icon => {
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

    document.body.appendChild(modal);
}

// Add these functions for modal handling
function openEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) {
        createEditProfileModal();
    }
    
    const userData = getCurrentUserData();
    
    // Pre-fill the form with current user data
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    document.getElementById('editProfileModal').style.display = 'block';
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    modal.style.display = 'none';
}

// Update the loadServices function
async function loadServices(userData) {
    try {
        console.log("=== LOADING SERVICES - DEBUG INFO ===");
        console.log("1. User data received:", userData);
        
        // Clear any previous error messages
        const errorElements = document.querySelectorAll('.error-message');
        errorElements.forEach(el => el.remove());
        
        // Get services container
        const servicesContainer = document.getElementById("servicesContainer");
        if (!servicesContainer) {
            console.error("Services container not found in DOM");
            return;
        }
        
        // Show loading indicator
        servicesContainer.innerHTML = `
            <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading your services...</p>
            </div>
        `;
        
        // 2. Fetch FRESH user data and services concurrently from server API
        console.log("2. Fetching fresh data from server API");
        let freshUserData = null;
        let availableServices = {};
        
        // Get the API base URL
        const apiBaseUrl = getApiBaseUrl();
        console.log("Using API base URL:", apiBaseUrl);
        
        try {
            // Make all requests concurrently to speed things up
            const [usersRes, servicesRes] = await Promise.all([
                fetch(`${apiBaseUrl}/admin/users`),
                fetch(`${apiBaseUrl}/api/services`)
            ]);
            
            // Process responses
            if (usersRes.ok) {
                const users = await usersRes.json();
                if (users[userData.username]) {
                    freshUserData = {
                        ...users[userData.username],
                        username: userData.username
                    };
                    console.log("Fresh user data from server API:", freshUserData);
                }
            } else {
                console.warn("Failed to fetch users data from API, trying local fallback");
                // Try local fallback
                const localUsersRes = await fetch("users.json");
                if (localUsersRes.ok) {
                    const users = await localUsersRes.json();
                    if (users[userData.username]) {
                        freshUserData = {
                            ...users[userData.username],
                            username: userData.username
                        };
                        console.log("Fresh user data from local users.json:", freshUserData);
                    }
                } else {
                    console.error("Failed to fetch users.json");
                }
            }
            
            if (servicesRes.ok) {
                availableServices = await servicesRes.json();
                console.log("Available services from API:", Object.keys(availableServices));
            } else {
                console.warn("Failed to fetch services from API, trying local fallback");
                // Try local fallback
                const localServicesRes = await fetch("services.json");
                if (localServicesRes.ok) {
                    availableServices = await localServicesRes.json();
                    console.log("Available services from local services.json:", Object.keys(availableServices));
                } else {
                    console.error("Failed to fetch services.json");
                }
            }
        } catch (err) {
            console.error("Error fetching data from API:", err);
            console.log("Trying local fallback...");
            
            // Try local fallback
            try {
                const [localUsersRes, localServicesRes] = await Promise.all([
                    fetch("users.json"),
                    fetch("services.json")
                ]);
                
                if (localUsersRes.ok) {
                    const users = await localUsersRes.json();
                    if (users[userData.username]) {
                        freshUserData = {
                            ...users[userData.username],
                            username: userData.username
                        };
                        console.log("Fresh user data from local users.json:", freshUserData);
                    }
                }
                
                if (localServicesRes.ok) {
                    availableServices = await localServicesRes.json();
                    console.log("Available services from local services.json:", Object.keys(availableServices));
                }
            } catch (fallbackErr) {
                console.error("Error fetching local data:", fallbackErr);
            }
        }
        
        // If we couldn't get user data from file, use provided data
        if (!freshUserData) {
            console.warn("Using provided user data as fallback");
            freshUserData = userData;
        }
        
        // If services couldn't be loaded, show error
        if (Object.keys(availableServices).length === 0) {
            console.error("No services could be loaded");
            servicesContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load services information. Please try again later.</p>
                    <button onclick="location.reload()">Retry</button>
                </div>
            `;
            return;
        }
        
        // 3. Get only the services assigned to this user
        console.log("3. Setting up user's assigned services");
        
        // Get user assigned services from users.json
        const userServicesFromFile = Array.isArray(freshUserData.services) ? freshUserData.services : [];
        console.log("User services from server:", userServicesFromFile);
        
        // Filter to only include services that exist in availableServices
        const assignedServices = userServicesFromFile.filter(name => availableServices[name]);
        console.log("Valid assigned services:", assignedServices);
        
        // 4. Display services
        servicesContainer.innerHTML = "";
        
        if (assignedServices.length === 0) {
            console.log("No services to display");
            servicesContainer.innerHTML = `
                <div class="no-services">
                    <i class="fas fa-info-circle"></i>
                    <p>No services assigned to your account yet.</p>
                </div>
            `;
            return;
        }
        
        // 5. Create cards for each service
        console.log("5. Creating service cards");
        let cardCount = 0;
        
        for (const serviceName of assignedServices) {
            try {
                console.log(`Processing service '${serviceName}'`);
                
                // Get service data from availableServices
                const serviceInfo = availableServices[serviceName];
                if (!serviceInfo) {
                    console.warn(`Service '${serviceName}' not found in available services, skipping`);
                    continue;
                }
                
                // Create service data object with all necessary properties
                const serviceData = {
                    name: serviceName,
                    url: serviceInfo.url || '#',
                    image: serviceInfo.image || '',
                    logo: serviceInfo.logo || '',
                    description: serviceInfo.description || '',
                    type: serviceInfo.type || 'regular',
                    email: serviceInfo.email || '',
                    password: serviceInfo.password || '',
                    targetUrl: serviceInfo.targetUrl || ''
                };
                
                // Fix URLs to ensure they have http/https
                if (serviceData.url && !serviceData.url.startsWith('http')) {
                    serviceData.url = 'http://' + serviceData.url;
                }
                
                // Fix target URLs
                if (serviceData.targetUrl && !serviceData.targetUrl.startsWith('http')) {
                    serviceData.targetUrl = 'http://' + serviceData.targetUrl;
                }
                
                // Fix image paths to ensure they use the API base URL if they're relative paths
                if (serviceData.image && !serviceData.image.startsWith('http') && !serviceData.image.startsWith('data:')) {
                    serviceData.image = apiBaseUrl + '/' + serviceData.image.replace(/^\/+/, '');
                    console.log(`Fixed image path: ${serviceData.image}`);
                }
                
                // Add expiration details if available
                if (freshUserData.serviceDetails && freshUserData.serviceDetails[serviceName]) {
                    serviceData.assignedDate = freshUserData.serviceDetails[serviceName].assignedDate;
                    serviceData.expiryDate = freshUserData.serviceDetails[serviceName].expirationDate;
                    console.log(`Added expiration details for ${serviceName}`);
                } else {
                    // Generate default expiration date (30 days from now)
                    const now = new Date();
                    serviceData.assignedDate = now.toISOString();
                    const expiry = new Date(now);
                    expiry.setDate(expiry.getDate() + 30);
                    serviceData.expiryDate = expiry.toISOString();
                    console.log(`Generated default expiration details for ${serviceName}`);
                }
                
                // Create and add service card
                console.log(`Creating card for ${serviceName}`);
                const card = createServiceCard(serviceName, serviceData);
                servicesContainer.appendChild(card);
                cardCount++;
                
            } catch (error) {
                console.error(`Error processing service '${serviceName}':`, error);
            }
        }
        
        // 6. Check if cards were created successfully
        console.log(`6. Created ${cardCount} service cards out of ${assignedServices.length} services`);
        
        if (cardCount === 0) {
            servicesContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Could not display your services. Please contact support.</p>
                </div>
            `;
        }
        
        // Update the timestamp
        updateUserDashboardTimestamp();
        
    } catch (error) {
        console.error("CRITICAL ERROR loading services:", error);
        const servicesContainer = document.getElementById("servicesContainer");
        if (servicesContainer) {
            servicesContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load services: ${error.message}</p>
                    <button onclick="location.reload()">Retry</button>
                </div>
            `;
        }
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

// Function to format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Function to update the download progress UI
function updateDownloadProgress(progressData) {
    console.log('Progress update received:', progressData);
    
    // Create progress container if it doesn't exist yet
    if (!document.getElementById('updateProgressContainer')) {
        console.log('Progress container not found, creating it now');
        createProgressContainer(progressData.version || '');
    }
    
    const progressContainer = document.getElementById('updateProgressContainer');
    if (!progressContainer) {
        console.error('Could not find or create progress container');
        return;
    }
    
    // Ensure progress container is visible
    progressContainer.style.display = 'block';
    progressContainer.style.visibility = 'visible';
    progressContainer.style.opacity = '1';
    
    const progressBar = progressContainer.querySelector('.progress-bar');
    const percentDisplay = progressContainer.querySelector('.update-progress-percent');
    const downloadedSize = progressContainer.querySelector('.downloaded-size');
    const totalSize = progressContainer.querySelector('.total-size');
    const downloadSpeed = progressContainer.querySelector('.download-speed');
    
    // Handle different property names based on format
    let percent = 0;
    let downloaded = 0;
    let total = 100;
    let speed = 0;
    
    // Extract values based on available properties
    if (progressData.percent !== undefined) {
        percent = progressData.percent;
    }
    
    if (progressData.downloadedBytes !== undefined) {
        downloaded = progressData.downloadedBytes;
    } else if (progressData.transferred !== undefined) {
        downloaded = progressData.transferred;
    }
    
    if (progressData.totalBytes !== undefined) {
        total = progressData.totalBytes;
    } else if (progressData.total !== undefined) {
        total = progressData.total;
    }
    
    if (progressData.bytesPerSecond !== undefined) {
        speed = progressData.bytesPerSecond;
    } else if (progressData.speed !== undefined) {
        speed = progressData.speed;
    }
    
    console.log(`Progress: ${percent}%, Downloaded: ${formatBytes(downloaded)} of ${formatBytes(total)}, Speed: ${formatBytes(speed)}/s`);
    
    // Update UI elements
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
        console.log(`Set progress bar width to ${percent}%`);
    } else {
        console.error('Progress bar element not found');
    }
    
    if (percentDisplay) {
        percentDisplay.textContent = `${percent}%`;
    } else {
        console.error('Percent display element not found');
    }
    
    // Format sizes
    if (downloadedSize) {
        downloadedSize.textContent = formatBytes(downloaded);
    } else {
        console.error('Downloaded size element not found');
    }
    
    if (totalSize) {
        totalSize.textContent = formatBytes(total);
    } else {
        console.error('Total size element not found');
    }
    
    // Update speed if available
    if (downloadSpeed && speed > 0) {
        downloadSpeed.textContent = `${formatBytes(speed)}/s`;
    } else if (downloadSpeed) {
        downloadSpeed.textContent = '0 B/s';
    } else {
        console.error('Download speed element not found');
    }
}

// Function to download with progress tracking for web environment
function downloadWithProgress(url, version) {
    console.log(`Starting download with progress tracking for ${url}`);
    
    // Create or update progress container
    const progressContainer = createProgressContainer(version);
    if (!progressContainer) {
        console.error('Failed to create progress container');
        fallbackToBrowserDownload(url, version);
        return;
    }
    
    // Update status text
    const statusText = progressContainer.querySelector('.status-text');
    if (statusText) {
        statusText.textContent = 'Preparing download...';
    }
    
    // Reset any existing install link behavior during download
    const installLink = document.getElementById('installUpdateLink');
    if (installLink) {
        // Remove any existing event listeners by cloning and replacing the element
        const newInstallLink = installLink.cloneNode(true);
        installLink.parentNode.replaceChild(newInstallLink, installLink);
        
        // Set default behavior during download
        newInstallLink.addEventListener('click', (e) => {
            e.preventDefault();
            showNotification('Download in progress. Please wait for it to complete.', 'info');
        });
    }

    // Check if we're in Electron environment
    if (window.ipcRenderer) {
        console.log('Using Electron IPC for download');
        
        try {
            // Setup IPC listeners for progress updates
            window.ipcRenderer.on('download-progress', (event, progressData) => {
                updateDownloadProgress(progressData);
            });
            
            window.ipcRenderer.on('download-error', (event, error) => {
                console.error('Download error via IPC:', error);
                removeProgressContainer();
                showNotification(`Download failed: ${error.message || 'Unknown error'}`, 'error');
                
                // Reset install link on error
                if (installLink) {
                    installLink.textContent = 'Retry Download';
                }
            });
            
            window.ipcRenderer.on('download-complete', (event, data) => {
                showUpdateComplete(version, data.filePath);
            });
            
            // Start download via IPC
            console.log('Sending download-update IPC message with URL:', url);
            window.ipcRenderer.send('download-update', { url, version });
            
        } catch (ipcError) {
            console.error('IPC download error:', ipcError);
            fallbackToBrowserDownload(url, version);
        }
    } else {
        console.log('Electron IPC not available, using browser download');
        fallbackToBrowserDownload(url, version);
    }
}

// Helper function to remove progress container and overlay
function removeProgressContainer() {
    // Remove the progress container if it exists
    const progressContainer = document.getElementById('updateProgressContainer');
    if (progressContainer) {
        console.log('Removing existing progress container');
        progressContainer.remove();
    }
    
    // Remove the overlay if it exists
    const overlay = document.getElementById('updateOverlay');
    if (overlay) {
        console.log('Removing existing overlay');
        overlay.remove();
    }
}

// Helper function to create progress container
function createProgressContainer(version) {
    // Make sure there's no existing container (redundant safety check)
    removeProgressContainer();
    
    console.log('Creating new progress container');
    
    // Create overlay first
    const overlay = document.createElement('div');
    overlay.id = 'updateOverlay';
    overlay.className = 'update-overlay';
    document.body.appendChild(overlay);
    
    // Create progress container
    const progressContainer = document.createElement('div');
    progressContainer.id = 'updateProgressContainer';
    progressContainer.className = 'update-progress-container';
    progressContainer.innerHTML = `
        <div class="update-progress-header">
            <span>Downloading update v${version}...</span>
            <span class="update-progress-percent">0%</span>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: 0%"></div>
        </div>
        <div class="update-progress-details">
            <span class="downloaded-size">0 KB</span> of <span class="total-size">Unknown</span>
            <span class="download-speed">0 KB/s</span>
        </div>
    `;
    
    // Add progress container to the body directly
    document.body.appendChild(progressContainer);
    
    console.log('Progress container and overlay added to DOM');
    
    return progressContainer;
}

// Fallback function to download through browser
function fallbackToBrowserDownload(url, version) {
    console.log('Falling back to browser download for:', url);
    
    // Create or verify progress container exists
    const progressContainer = document.getElementById('progressContainer') || createProgressContainer(version);
    if (!progressContainer) {
        console.error('Failed to create progress container for fallback download');
        window.open(url, '_blank');
        return;
    }
    
    // Update status
    const statusText = progressContainer.querySelector('.status-text');
    if (statusText) {
        statusText.textContent = 'Starting download...';
    }
    
    // Reset any existing install link behavior during download
    const installLink = document.getElementById('installUpdateLink');
    if (installLink) {
        // Remove any existing event listeners by cloning and replacing the element
        const newInstallLink = installLink.cloneNode(true);
        installLink.parentNode.replaceChild(newInstallLink, installLink);
        
        // Set default behavior during download
        newInstallLink.addEventListener('click', (e) => {
            e.preventDefault();
            showNotification('Download in progress. Please wait for it to complete.', 'info');
        });
    }

    // Perform browser-based download with progress tracking
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            
            // Get total size if available
            const totalBytes = response.headers.get('content-length');
            let receivedBytes = 0;
            let totalSize = totalBytes ? parseInt(totalBytes, 10) : 0;
            
            // Create reader from response body stream
            const reader = response.body.getReader();
            const chunks = [];
            
            // Update status
            if (statusText) {
                statusText.textContent = 'Downloading...';
            }
            
            // Process the stream
            function processStream() {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        return chunks;
                    }
                    
                    chunks.push(value);
                    receivedBytes += value.length;
                    
                    // Calculate progress
                    const progress = totalSize ? (receivedBytes / totalSize) * 100 : 0;
                    
                    // Update progress UI
                    updateDownloadProgress({
                        percent: progress,
                        transferred: receivedBytes,
                        total: totalSize,
                        bytesPerSecond: 0
                    });
                    
                    return processStream();
                });
            }
            
            return processStream().then(chunks => {
                // Combine chunks into a single Blob
                const blob = new Blob(chunks);
                
                // Save the file
                const fileName = `venzell-update-${version}.exe`;
                
                // Try to save using the saveAs API if available
                if (window.saveAs) {
                    window.saveAs(blob, fileName);
                    showUpdateComplete(version, null);
                } else {
                    // Otherwise, create a download link
                    saveBlobLocally(blob, fileName);
                    showUpdateComplete(version, null);
                }
            });
        })
        .catch(error => {
            console.error('Fetch download error:', error);
            
            if (statusText) {
                statusText.textContent = 'Download failed';
            }
            
            removeProgressContainer();
            showNotification(`Download failed: ${error.message}`, 'error');
            
            // Reset install link on error
            if (installLink) {
                installLink.textContent = 'Retry Download';
            }
            
            // Offer direct browser download as a last resort
            setTimeout(() => {
                if (confirm('Download failed. Would you like to open the download link in a new tab?')) {
                    window.open(url, '_blank');
                }
            }, 1000);
        });
}

// Helper to save a blob locally
function saveBlobLocally(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    showNotification(`Update downloaded as ${fileName}. Please install manually.`, 'success');
}

// Function to show update complete notification
function showUpdateComplete(version, filePath) {
    console.log(`Download complete for version ${version}, file saved to: ${filePath}`);
    
    // Remove the progress container if it exists
    removeProgressContainer();
    
    // Show completion notification
    showNotification(`Update ${version} downloaded successfully!`, 'success');
    
    // Update UI elements
    const downloadStatus = document.getElementById('downloadStatus');
    if (downloadStatus) {
        downloadStatus.textContent = `Update ${version} downloaded successfully!`;
    }
    
    // Update install link behavior
    const installLink = document.getElementById('installUpdateLink');
    if (installLink) {
        // Remove any existing event listeners by cloning and replacing the element
        const newInstallLink = installLink.cloneNode(true);
        installLink.parentNode.replaceChild(newInstallLink, installLink);
        
        // Add new event listener for installation
        newInstallLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Open the downloaded file
            if (filePath) {
                console.log(`Attempting to open downloaded file at: ${filePath}`);
                window.ipcRenderer.send('open-file', filePath);
                showNotification('Opening installer...', 'info');
            } else {
                showNotification('Installation file path not available', 'error');
            }
        });
        
        // Update link text and style to indicate it's ready for installation
        newInstallLink.textContent = 'Install Update Now';
        newInstallLink.classList.add('ready-to-install');
    }
}