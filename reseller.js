// Utility function to get API base URL
async function getApiBaseUrl() {
    try {
        const response = await fetch('config.json');
        const config = await response.json();
        // Ensure the URL has the correct protocol and no trailing slash
        const baseUrl = config.apiBaseUrl.replace(/\/$/, '');
        return baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    } catch (error) {
        console.error('Error loading API configuration:', error);
        // Fallback to default URL if config fails to load
        return 'https://venzell.skplay.net';
    }
}

// Mobile menu functionality
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    
    if (mobileMenuToggle && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-visible');
            
            // Change icon based on sidebar visibility
            const icon = mobileMenuToggle.querySelector('i');
            if (sidebar.classList.contains('mobile-visible')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
        
        // Close sidebar when clicking on a nav item (mobile only)
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 576) {
                    sidebar.classList.remove('mobile-visible');
                    const icon = mobileMenuToggle.querySelector('i');
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }
}

// Initialize mobile menu on page load
document.addEventListener('DOMContentLoaded', () => {
    setupMobileMenu();
});

// Utility function to make API requests
async function makeRequest(endpoint, options = {}) {
    console.log(`Making request to: ${endpoint}`);
    try {
        const apiUrl = await getApiBaseUrl();
        console.log(`API base URL: ${apiUrl}`);
        
        // Ensure endpoint starts with a forward slash
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const fullUrl = `${apiUrl}${normalizedEndpoint}`;
        console.log(`Full request URL: ${fullUrl}`);
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('session_id')}`,
            ...options.headers
        };
        console.log('Request headers:', headers);
        
        const response = await fetch(fullUrl, {
            ...options,
            headers
        });
        
        console.log(`Response status for ${endpoint}: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Data received from ${endpoint}:`, data);
        return data;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Update dashboard timestamp
function updateDashboardTimestamp() {
    const timestamp = document.getElementById('dashboardTimestamp');
    const currentDate = document.getElementById('currentDate');
    
    if (timestamp && currentDate) {
        const now = new Date();
        
        // Format the date: Saturday, May 24, 2025
        const dateOptions = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        currentDate.textContent = now.toLocaleDateString('en-US', dateOptions);
        
        // Format the time: 2:54:16 AM
        const timeOptions = {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        timestamp.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
}

// Update current date
function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const now = new Date();
        dateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Update dashboard statistics
async function updateDashboardStats() {
    try {
        const stats = await makeRequest('/reseller/dashboard-stats');
        
        // Update Users Stats
        updateCardStats('totalUsersCount', stats.users.total, stats.users.previousTotal);
        updateCardStats('activeUsersCount', stats.users.active, stats.users.previousActive);
        updateCardStats('newUsersCount', stats.users.new, stats.users.previousNew);

        // Update Services Stats
        updateCardStats('totalServicesCount', stats.services.total, stats.services.previousTotal);

        // Update Revenue Stats
        updateCardStats('totalRevenue', stats.revenue.total, stats.revenue.previousTotal, true);
        updateCardStats('monthlyRevenue', stats.revenue.monthly, stats.revenue.previousMonthly, true);
        updateCardStats('topSellingTools', stats.revenue.topSelling, stats.revenue.previousTopSelling);
        updateCardStats('toolsRevenue', stats.revenue.tools, stats.revenue.previousTools, true);
    } catch (error) {
        console.error('Error updating dashboard stats:', error);
        showNotification('Failed to update dashboard statistics', 'error');
    }
}

// Update card statistics with animation
function updateCardStats(elementId, currentValue, previousValue, isCurrency = false) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const trendElement = document.getElementById(`${elementId}Trend`);
    if (trendElement) {
        const trend = calculateTrend(currentValue, previousValue);
        updateTrendIndicator(trendElement, trend);
    }

    // Format value based on type
    const formattedValue = isCurrency ? 
        `$${currentValue.toLocaleString()}` : 
        currentValue.toLocaleString();

    // Animate counter
    animateCounter(element, formattedValue);
}

// Calculate trend percentage
function calculateTrend(current, previous) {
    if (previous === 0) return 100;
    return ((current - previous) / previous) * 100;
}

// Update trend indicator
function updateTrendIndicator(element, trend) {
    const trendValue = Math.abs(trend).toFixed(1);
    const direction = trend >= 0 ? 'up' : 'down';
    
    element.className = `trend-indicator ${direction}`;
    element.innerHTML = `
        <i class="fas fa-arrow-${direction}"></i>
        <span>${trendValue}%</span>
    `;
}

// Animate counter
function animateCounter(element, targetValue) {
    const currentValue = parseFloat(element.textContent.replace(/[^0-9.-]+/g, ''));
    const target = parseFloat(targetValue.replace(/[^0-9.-]+/g, ''));
    const duration = 1000; // 1 second
    const steps = 60;
    const stepValue = (target - currentValue) / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
        currentStep++;
        const newValue = currentValue + (stepValue * currentStep);
        
        if (currentStep === steps || newValue === target) {
            element.textContent = targetValue;
            clearInterval(interval);
        } else {
            element.textContent = targetValue.includes('$') ? 
                `$${Math.round(newValue).toLocaleString()}` : 
                Math.round(newValue).toLocaleString();
        }
    }, duration / steps);
}

// Load users table
async function loadUsersTable() {
    try {
        const users = await makeRequest('/reseller/users');
        const tableBody = document.getElementById('usersTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = users.map(user => `
            <tr>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>
                    <span class="status-badge ${user.status.toLowerCase()}">
                        ${user.status}
                    </span>
                </td>
                <td>${new Date(user.lastActive).toLocaleString()}</td>
                <td>
                    <button class="table-action-btn" onclick="viewUserDetails('${user.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading users table:', error);
        showNotification('Failed to load users table', 'error');
    }
}

// Load sessions table with history
async function loadSessionsTable(options = {}) {
    try {
        console.log(`Loading sessions table with options:`, options);
        
        // Store scroll position for silent refreshes
        const activeTableContainer = document.querySelector('#activeSessionsTable')?.parentElement;
        const recentTableContainer = document.querySelector('#recentSessionsTable')?.parentElement;
        const activeScrollTop = activeTableContainer ? activeTableContainer.scrollTop : 0;
        const recentScrollTop = recentTableContainer ? recentTableContainer.scrollTop : 0;
        
        // Show loading state if not silent refresh
        const activeTableBody = document.getElementById('activeSessionsTableBody');
        const recentTableBody = document.getElementById('recentSessionsTableBody');
        
        if (!activeTableBody || !recentTableBody) {
            console.error('Could not find table bodies for sessions');
            return;
        }
        
        if (!options.silent) {
            activeTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i> Loading active sessions...
                    </td>
                </tr>
            `;
        
            recentTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i> Loading session history...
                    </td>
                </tr>
            `;
        }

        // Add cache-busting parameter to ensure fresh data
        const cacheBuster = options.cacheBust ? `?_=${Date.now()}` : '';

        // First load active sessions
        console.log(`Fetching active sessions from /reseller/sessions${cacheBuster}`);
        let activeSessions = [];
        try {
            activeSessions = await makeRequest(`/reseller/sessions${cacheBuster}`);
            console.log(`Received ${activeSessions.length} active sessions`);
        } catch (activeError) {
            console.error('Error loading active sessions:', activeError);
            if (!options.silent) {
                showNotification('Failed to load active sessions. Please try again.', 'error');
            }
            // Continue with empty active sessions array
        }
        
        // Then load session history
        let sessionHistory = [];
        try {
            // Try the primary endpoint first
            console.log(`Fetching session history from /reseller/session-history${cacheBuster}`);
            sessionHistory = await makeRequest(`/reseller/session-history${cacheBuster}`);
            console.log(`Received ${sessionHistory.length} session history records`);
        } catch (historyError) {
            console.log('Primary history endpoint failed, trying alternative...', historyError);
            try {
                // Try alternative endpoint
                console.log(`Trying alternative endpoint /reseller/recent-sessions${cacheBuster}`);
                const recentSessions = await makeRequest(`/reseller/recent-sessions${cacheBuster}`);
                sessionHistory = recentSessions.filter(session => 
                    session.logoutTime || 
                    new Date(session.loginTime) < new Date(Date.now() - 24 * 60 * 60 * 1000)
                );
                console.log(`Received ${sessionHistory.length} session history records from alternative endpoint`);
            } catch (altError) {
                console.log('Alternative endpoint failed, using active sessions for history...', altError);
                // Use active sessions as fallback
                sessionHistory = [...activeSessions];
                console.log(`Using ${sessionHistory.length} active sessions as history fallback`);
            }
        }

        // Process active sessions
            activeTableBody.innerHTML = '';
            
            // Filter and sort active sessions
            const currentActiveSessions = activeSessions
            .filter(session => {
                // Consider a session active if it has no logoutTime or its status is 'Active'
                return (!session.logoutTime || session.status === 'Active');
            })
                .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

        console.log(`Found ${currentActiveSessions.length} current active sessions`);

            if (currentActiveSessions.length === 0) {
                activeTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-table-message">
                            <div class="empty-state">
                                <i class="fas fa-users-slash"></i>
                                <p>No active sessions at this time</p>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                currentActiveSessions.forEach(session => {
                try {
            const loginTime = session.loginTime ? new Date(session.loginTime).toLocaleString() : 'N/A';
                    const duration = formatDuration(new Date() - new Date(session.loginTime));
                    const activeRow = createActiveSessionRow(session, loginTime, duration);
                    activeTableBody.appendChild(activeRow);
                } catch (rowError) {
                    console.error('Error creating active session row:', rowError, session);
                }
                });
        }

        // Process session history
            recentTableBody.innerHTML = '';
            
            // Get last 24 hours timestamp
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Filter and sort recent sessions
            const recentSessions = sessionHistory
                .filter(session => new Date(session.loginTime) > twentyFourHoursAgo)
                .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

        console.log(`Found ${recentSessions.length} recent sessions in the last 24 hours`);

            if (recentSessions.length === 0) {
                recentTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-table-message">
                            <div class="empty-state">
                                <i class="fas fa-history"></i>
                                <p>No session history available for the last 24 hours</p>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                // Use Set to track processed sessions and avoid duplicates
                const processedSessions = new Set();
                
                recentSessions.forEach(session => {
                try {
                    const sessionId = session.id || session.sessionId || `${session.userName || session.username}-${session.loginTime}`;
                    
                    // Skip if already processed
                    if (processedSessions.has(sessionId)) return;
                    processedSessions.add(sessionId);

                    const loginTime = new Date(session.loginTime).toLocaleString();
            const logoutTime = session.logoutTime ? new Date(session.logoutTime).toLocaleString() : 'Active';
                    const isActive = !session.logoutTime || session.status === 'Active';
                    const duration = formatDuration(
                        session.logoutTime ? 
                            new Date(session.logoutTime) - new Date(session.loginTime) :
                            new Date() - new Date(session.loginTime)
                    );

                    const recentRow = createRecentSessionRow(session, loginTime, logoutTime, isActive, duration);
                    recentTableBody.appendChild(recentRow);
                } catch (rowError) {
                    console.error('Error creating recent session row:', rowError, session);
                }
                });
        }

        // Update session stats if needed
        try {
            updateSessionStats([...activeSessions, ...sessionHistory]);
        } catch (statsError) {
            console.error('Error updating session stats:', statsError);
        }
        
        // Restore scroll position for silent refreshes
        if (options.silent) {
            if (activeTableContainer) activeTableContainer.scrollTop = activeScrollTop;
            if (recentTableContainer) recentTableContainer.scrollTop = recentScrollTop;
        }
        
        // Update timestamp
        const timestamp = document.getElementById('sessionsTimestamp');
        if (timestamp) {
            timestamp.textContent = new Date().toLocaleTimeString();
        }

        console.log('Sessions table loaded successfully');
        return true;

    } catch (error) {
        console.error('Error in loadSessionsTable:', error);
        
        // Only show error state if not silent refresh
        if (!options.silent) {
        // Show error state in tables
        if (activeTableBody) {
            activeTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="error-message">
                        <div class="error-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Failed to load active sessions. Please try refreshing.</p>
                        </div>
                    </td>
                </tr>
            `;
        }
        
        if (recentTableBody) {
            recentTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="error-message">
                        <div class="error-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Failed to load session history. Please try refreshing.</p>
                        </div>
                    </td>
                </tr>
            `;
        }
        
        showNotification('Error loading sessions data. Please try again.', 'error');
        }
        
        return false;
    }
}

// Add some additional styles for empty and error states
const additionalStyles = `
    .empty-state, .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        color: #a0a0a0;
    }

    .empty-state i, .error-state i {
        font-size: 24px;
        margin-bottom: 10px;
    }

    .error-state i {
        color: #ff4444;
    }

    .empty-state p, .error-state p {
        margin: 0;
        font-size: 14px;
    }
`;

// Add the styles when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    const styleElement = document.createElement('style');
    styleElement.textContent = additionalStyles + `
        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 50%;
            z-index: 10;
        }
        
        .loading-overlay img {
            width: 32px;
            height: 32px;
        }
        
        .profile-picture-container {
            position: relative;
        }
        
        .profile-picture.loading {
            opacity: 0.5;
        }
    `;
    document.head.appendChild(styleElement);
});

// Helper function to create active session row
function createActiveSessionRow(session, loginTime, duration) {
    try {
    const tr = document.createElement('tr');
        const username = session.userName || session.username || 'Unknown';
        const role = session.userRole || session.role || 'User';
        const status = session.status || 'Active';
        const statusClass = status.toLowerCase() === 'active' ? 'active' : 
                           status.toLowerCase() === 'terminated' ? 'terminated' : 'inactive';
        const statusIcon = status.toLowerCase() === 'active' ? 'circle' : 'times-circle';
        
    tr.innerHTML = `
            <td>${username}</td>
            <td>${role}</td>
        <td class="time-cell">${loginTime}</td>
        <td class="duration-cell">${duration}</td>
        <td>
                <span class="status-badge ${statusClass}">
                    <i class="fas fa-${statusIcon}"></i>
                    ${status}
            </span>
        </td>
        <td>
            <div class="session-actions">
                    <button class="session-action-btn" onclick="viewSessionDetails('${session.id || session.sessionId || ''}')">
                    <i class="fas fa-eye"></i>
                </button>
                    <button class="session-action-btn terminate" onclick="terminateSession('${username}', '${session.id || session.sessionId || ''}')" title="Terminate Session">
                    <i class="fas fa-power-off"></i>
                </button>
            </div>
        </td>
    `;
    return tr;
    } catch (error) {
        console.error('Error in createActiveSessionRow:', error, session);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="6" class="error-message">
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error displaying session data</p>
            </div>
        </td>
    `;
    return tr;
    }
}

// Helper function to create recent session row
function createRecentSessionRow(session, loginTime, logoutTime, isActive, duration) {
    try {
    const tr = document.createElement('tr');
        const username = session.userName || session.username || 'Unknown';
        const role = session.userRole || session.role || 'User';
        
        // Use the session status if available, otherwise determine based on isActive
        const status = session.status || (isActive ? 'Active' : 'Ended');
        
        // Determine the status class (active, inactive, terminated)
        const statusClass = status.toLowerCase() === 'active' ? 'active' : 
                           status.toLowerCase() === 'terminated' ? 'terminated' : 'inactive';
        
        // Determine the icon based on status
        const statusIcon = status.toLowerCase() === 'active' ? 'circle' : 'times-circle';
        
    tr.innerHTML = `
            <td>${username}</td>
            <td>${role}</td>
                    <td class="time-cell">${loginTime}</td>
                    <td class="time-cell">${logoutTime}</td>
        <td class="duration-cell">${duration}</td>
                    <td>
                <span class="status-badge ${statusClass}">
                    <i class="fas fa-${statusIcon}"></i>
                    ${status}
                        </span>
                    </td>
                    <td>
                        <div class="session-actions">
                    <button class="session-action-btn" onclick="viewSessionDetails('${session.id || session.sessionId || ''}')">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${isActive ? `
                        <button class="session-action-btn terminate" onclick="terminateSession('${username}', '${session.id || session.sessionId || ''}')" title="Terminate Session">
                                    <i class="fas fa-power-off"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
    `;
    return tr;
    } catch (error) {
        console.error('Error in createRecentSessionRow:', error, session);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="7" class="error-message">
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error displaying session data</p>
                        </div>
                    </td>
    `;
    return tr;
    }
}

// Format duration in milliseconds to readable string
function formatDuration(ms) {
    if (!ms || isNaN(ms)) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Show notification
function showNotification(message, type = 'info', onClick = null) {
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

// Function to validate session and check reseller role
function validateResellerSession() {
    const sessionId = localStorage.getItem('session_id');

    if (!sessionId) {
        window.location.href = 'login-popup.html'; // Redirect if no session
        return;
    }

    makeRequest('/validate-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
    })
    .then(data => {
        if (data.status !== 'success' || data.role !== 'reseller') {
            // Redirect non-resellers to their appropriate dashboard
            if (data.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'home.html';
            }
        } else {
            // Update the welcome message with real username
            const resellerNameElement = document.getElementById('resellerName');
            if (resellerNameElement) {
                resellerNameElement.textContent = data.user;
            }
        }
    })
    .catch(() => {
        window.location.href = 'login-popup.html'; // Redirect on error
    });
}

// Set up navigation
function setupNavigation() {
    console.log('Setting up navigation...');
    
    // Hide all content pages initially
    const contentPages = document.querySelectorAll('.content-page');
    contentPages.forEach(page => {
        page.style.display = 'none';
    });
    
    // Show dashboard by default
    const dashboardPage = document.getElementById('dashboardPage');
    if (dashboardPage) {
        dashboardPage.style.display = 'block';
        // Initialize dashboard stats
        updateDashboardStats();
    }
    
    // Add click event handlers to navigation items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        // Ensure each nav item has an ID for direct access
        const pageName = item.getAttribute('data-page');
        if (pageName && !item.id) {
            item.id = `${pageName}Nav`;
            console.log(`Added ID ${pageName}Nav to navigation item`);
        }
        
        item.addEventListener('click', function() {
            // Remove active class from all navigation items
            navItems.forEach(navItem => {
                navItem.classList.remove('active');
            });
            
            // Add active class to clicked navigation item
            this.classList.add('active');
            
            // Get the page to display
            const pageToShow = this.getAttribute('data-page');
            console.log(`Navigation: Switching to ${pageToShow} page`);
            
            // Hide all content pages
            contentPages.forEach(page => {
                page.style.display = 'none';
            });
            
            // Show the selected content page
            const selectedPage = document.getElementById(`${pageToShow}Page`);
            if (selectedPage) {
                selectedPage.style.display = 'block';
                
                // Initialize specific page content
                if (pageToShow === 'dashboard') {
                    updateDashboardTimestamp();
                    updateCurrentDate();
                    updateDashboardStats();
                } else if (pageToShow === 'users') {
                    console.log('Initializing users page...');
                    initializeUserManagementPage();
                } else if (pageToShow === 'sessions') {
                    console.log('Initializing sessions page...');
                    initializeSessionsPage();
                } else if (pageToShow === 'services') {
                    console.log('Initializing services page...');
                    initializeServicesPage();
                } else if (pageToShow === 'settings') {
                    console.log('Initializing settings page...');
                    initializeSettingsPage();
                }
                
                // Update URL hash without triggering hashchange event
                const newUrl = `${window.location.pathname}#${pageToShow}`;
                history.replaceState(null, '', newUrl);
            } else {
                console.error(`Page element #${pageToShow}Page not found`);
            }
        });
    });
}

// Function to load all users managed by this reseller
function loadAllUsers() {
    makeRequest('/reseller/users')
        .then(users => {
            const tableBody = document.getElementById('userList');
            if (!tableBody) return;
            
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
                    <td>${formatDate(user.joinDate)}</td>
                    <td>${formatLastActive(user)}</td>
                    <td>
                        <span class="user-status ${user.isActive ? 'status-active' : 'status-inactive'}">
                            ${user.isActive ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>${user.services?.join(', ') || 'No services'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="table-action-btn" onclick="viewUserDetails('${username}')">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="table-action-btn delete" onclick="deleteUser('${username}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            // Initialize refresh button functionality
            const refreshButton = document.getElementById('refreshAllUsersTable');
            if (refreshButton) {
                refreshButton.addEventListener('click', () => {
                    refreshButton.classList.add('rotating');
                    loadAllUsers().then(() => {
                        setTimeout(() => refreshButton.classList.remove('rotating'), 1000);
                    });
                });
            }
        })
        .catch(err => {
            console.error('Error loading users:', err);
            showNotification('Failed to load users', 'error');
        });
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
}

// Format last active time for display
function formatLastActive(user) {
    if (!user.lastActiveTime) return 'Never';
    return new Date(user.lastActiveTime).toLocaleString();
}

// Function to add a new user
async function addUser() {
    try {
        console.log('Adding new user...');
        const newUsername = document.getElementById('newUsername').value.trim();
    const newPassword = document.getElementById('newPassword').value;
        const fullName = document.getElementById('fullName').value.trim();
    const sessionId = localStorage.getItem('session_id');

    if (!newUsername || !newPassword || !fullName) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

        // Show loading state
        const addButton = document.querySelector('#addUserForm .save-btn');
        if (addButton) {
            addButton.disabled = true;
            addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    }

        const response = await makeRequest('/reseller/add-user', {
        method: 'POST',
        body: JSON.stringify({
            sessionId,
            newUsername,
            newPassword,
                newRole: 'user', // Resellers can only add regular users
            fullName
        })
        });

        if (response.status === 'success') {
            // Show success popup
            const popup = document.getElementById('addUserConfirmPopup');
            popup.style.display = 'flex';

            // Handle OK button click
            document.getElementById('confirmAddUserOk').onclick = () => {
                popup.style.display = 'none';
            document.getElementById('addUserForm').reset();
            loadAllUsers(); // Refresh user list
            
            // Switch to all users tab
            const allUsersTab = document.querySelector('[data-tab="allusers"]');
            if (allUsersTab) {
                allUsersTab.click();
            }
            };

            // Handle close button click
            popup.querySelector('.close-popup').onclick = () => {
                popup.style.display = 'none';
            };

            // Close on click outside
            popup.onclick = (event) => {
                if (event.target === popup) {
                    popup.style.display = 'none';
                }
            };
        } else {
            showNotification(response.message || 'Failed to add user', 'error');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        showNotification('Failed to add user: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        // Reset button state
        const addButton = document.querySelector('#addUserForm .save-btn');
        if (addButton) {
            addButton.disabled = false;
            addButton.innerHTML = '<i class="fas fa-user-plus"></i> Add User';
        }
    }
}

// Function to delete a user (for resellers)
function deleteUser(username) {
    if (confirm(`Are you sure you want to delete user: ${username}? This action cannot be undone.`)) {
        const sessionId = localStorage.getItem('session_id');

        // Check if user is trying to delete themselves
        makeRequest('/validate-session', {
            method: 'POST',
            body: JSON.stringify({ sessionId })
        })
        .then(data => {
            if (data.user === username) {
                showNotification("You cannot delete your own account while logged in!", "error");
                return;
            }

            // Proceed with deletion
            return makeRequest('/reseller/delete-user', {
                method: 'POST',
                body: JSON.stringify({ sessionId, usernameToDelete: username })
            });
        })
        .then(data => {
            if (data && data.status === 'success') {
                showNotification("User deleted successfully!", "success");
                loadAllUsers(); // Refresh the list
            } else if (data) {
                showNotification(data.message || "Failed to delete user", "error");
            }
        })
        .catch(err => {
            console.error('Error deleting user:', err);
            showNotification('Error deleting user. Please try again.', "error");
        });
    }
}

// Function to view user details with services
async function viewUserDetails(username) {
    try {
        const userData = await makeRequest(`/reseller/user/${username}`);
        const apiBaseUrl = await getApiBaseUrl();
        const popup = document.getElementById('userServicesPopup');
        
        if (!popup) {
            console.error('User services popup element not found');
            return;
        }

        popup.innerHTML = `
            <div class="popup-content">
                <div class="popup-header">
                    <h3>User Services Details</h3>
                    <button class="close-popup"><i class="fas fa-times"></i></button>
                </div>
                <div class="popup-body">
                    <div class="user-header">
                        <div class="user-title">
                            <span class="user-number">${username}</span>
                            <span class="role-badge">${userData.role || 'user'}</span>
                        </div>
                    </div>
                    <div class="services-list"></div>
                </div>
            </div>
        `;

        const servicesList = popup.querySelector('.services-list');
        
        // Store intervals for cleanup
        const intervals = [];

        if (!userData.services || userData.services.length === 0) {
            servicesList.innerHTML = `
                <div class="no-services">
                    <i class="fas fa-info-circle"></i>
                    <p>No services assigned to this user</p>
                </div>
            `;
        } else {
            // Get all services details first
            const allServices = await makeRequest('/reseller/services');
            
            userData.services.forEach(serviceName => {
                const serviceDetails = userData.serviceDetails[serviceName] || {};
                const serviceInfo = allServices[serviceName] || {};
                const now = new Date();
                const assignedDate = serviceDetails.assignedDate ? new Date(serviceDetails.assignedDate) : null;
                let expirationDate = null;
                
                // Calculate expiration date (30 days from assigned date)
                if (assignedDate) {
                    expirationDate = new Date(assignedDate);
                    expirationDate.setDate(expirationDate.getDate() + 30);
                }
                
                let timeLeft = 0;
                let timeLeftDisplay = '(Expired)';
                let isExpired = true;
                
                if (expirationDate && expirationDate > now) {
                    timeLeft = expirationDate - now;
                    timeLeftDisplay = formatTimeRemaining(timeLeft);
                    isExpired = false;
                }

                // Check if service has an image
                const hasImage = serviceInfo.image && serviceInfo.image.trim() !== '';
                const imageUrl = hasImage ? `${apiBaseUrl}/${serviceInfo.image}` : '';

                const serviceItem = document.createElement('div');
                serviceItem.className = 'service-item';
                serviceItem.innerHTML = `
                    <div class="service-info">
                        <div class="service-icon">
                            ${hasImage ? 
                                `<img src="${imageUrl}" alt="${serviceName}" onerror="this.onerror=null; this.src='assets/default-service.png'; this.classList.add('fallback-icon');">` : 
                                `<i class="fas fa-${serviceInfo.icon || 'cog'}"></i>`
                            }
                        </div>
                        <div class="service-details">
                            <h3>${serviceName}</h3>
                            <div class="service-dates">
                                <div class="assigned-date">
                                    Assigned: ${assignedDate ? formatDate(assignedDate) : 'N/A'}
                                </div>
                                <div class="expiration-date ${!isExpired && timeLeft < (24 * 60 * 60 * 1000) ? 'expiring-soon' : ''}">
                                    Expires: ${expirationDate ? formatDate(expirationDate) : 'N/A'}
                                    <span class="time-remaining">${timeLeftDisplay}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="service-actions">
                        <button class="remove-service" onclick="removeServiceFromUser('${username}', '${serviceName}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                servicesList.appendChild(serviceItem);

                // Update time remaining every minute if service is not expired
                if (!isExpired) {
                    const timeRemainingSpan = serviceItem.querySelector('.time-remaining');
                    const expirationDiv = serviceItem.querySelector('.expiration-date');
                    
                    const updateInterval = setInterval(() => {
                        const currentTime = new Date();
                        const remainingTime = expirationDate - currentTime;
                        
                        if (remainingTime <= 0) {
                            clearInterval(updateInterval);
                            timeRemainingSpan.textContent = '(Expired)';
                            expirationDiv.classList.remove('expiring-soon');
                        } else {
                            timeRemainingSpan.textContent = formatTimeRemaining(remainingTime);
                            if (remainingTime < (24 * 60 * 60 * 1000)) {
                                expirationDiv.classList.add('expiring-soon');
                            }
                        }
                    }, 60000); // Update every minute
                    
                    intervals.push(updateInterval);
                }
            });
        }
            
        // Show popup
        popup.style.display = 'flex';
            
        // Handle close button
        const closeBtn = popup.querySelector('.close-popup');
        if (closeBtn) {
            closeBtn.onclick = () => {
                intervals.forEach(interval => clearInterval(interval));
                popup.style.display = 'none';
            };
        }
        
        // Close on outside click
        popup.onclick = (event) => {
            if (event.target === popup) {
                intervals.forEach(interval => clearInterval(interval));
                popup.style.display = 'none';
            }
        };

        // Clean up intervals when popup is hidden
        popup.addEventListener('hidden', () => {
            intervals.forEach(interval => clearInterval(interval));
        }, { once: true });
    } catch (err) {
        console.error('Error fetching user details:', err);
        showNotification('Failed to load user details', 'error');
    }
}

// Helper function to format time remaining
function formatTimeRemaining(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
        return `(${days}d ${hours}h remaining)`;
    } else if (hours > 0) {
        return `(${hours}h remaining)`;
    } else {
        return '(Expiring soon)';
    }
}

// Function to clear form inputs
function clearForm() {
    document.getElementById('addUserForm').reset();
}

// Function to load services available to the reseller
async function loadServices() {
    console.log('Loading services...');
    try {
        const services = await makeRequest('/reseller/services');
        console.log('Services loaded successfully:', services);
        
        // Get API base URL for images
        const apiBaseUrl = await getApiBaseUrl();
        
        // Check if services is empty or undefined
        if (!services || Object.keys(services).length === 0) {
            console.warn('No services returned from API');
            showNotification('No services available', 'info');
        }
        
        // Populate the services table
        const tableBody = document.getElementById('servicesList');
        if (tableBody) {
            tableBody.innerHTML = '';

            if (!services || Object.keys(services).length === 0) {
                // No services found
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `
                    <td colspan="6" class="empty-table-message">
                        <i class="fas fa-info-circle"></i> No services available
                    </td>
                `;
                tableBody.appendChild(emptyRow);
            } else {
                // Display services in the table
            Object.entries(services).forEach(([serviceName, service]) => {
                const tr = document.createElement('tr');
                    const isActive = service.isActive || service.status === 'active';
                    const hasImage = service.image && service.image.trim() !== '';
                    const imageUrl = hasImage ? `${apiBaseUrl}/${service.image}` : '';
                
                tr.innerHTML = `
                        <td>
                            <div class="service-table-info">
                                ${hasImage ? 
                                    `<div class="service-table-image">
                                        <img src="${imageUrl}" alt="${serviceName}" onerror="this.onerror=null; this.src='assets/default-service.png'; this.classList.add('fallback-icon');">
                                    </div>` : 
                                    `<div class="service-table-icon">
                                        <i class="fas fa-${service.icon || 'cog'}"></i>
                                    </div>`
                                }
                                <span>${serviceName}</span>
                            </div>
                        </td>
                    <td>${service.description || 'No description'}</td>
                    <td>$${service.price || '0'}</td>
                    <td>${service.activeUsers || '0'}</td>
                    <td>
                            <span class="status-badge ${isActive ? 'active' : 'inactive'}">
                                ${isActive ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="table-action-btn" onclick="viewServiceDetails('${serviceName}')">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
            }
        } else {
            console.warn('Services table element not found');
        }

            // Initialize refresh button functionality
            const refreshButton = document.getElementById('refreshServicesTable');
            if (refreshButton) {
            refreshButton.onclick = () => {
                    refreshButton.classList.add('rotating');
                    loadServices().then(() => {
                        setTimeout(() => refreshButton.classList.remove('rotating'), 1000);
                    });
            };
        }
        
        // Update services stats
        updateServicesStats(services);
        
        return services;
    } catch (err) {
            console.error('Error loading services:', err);
        
        // Show a more detailed error message
        const errorMsg = err.message || 'Unknown error';
        showNotification(`Failed to load services: ${errorMsg}`, 'error');
        
        // Clear loading indicators
        const servicesGrid = document.getElementById('servicesGrid');
        if (servicesGrid) {
            servicesGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load services. Please try refreshing.</p>
                </div>
            `;
        }
        
        throw err;
    }
}

// Function to load user services for management
function loadUserServices() {
    Promise.all([
        makeRequest('/reseller/users'),
        makeRequest('/reseller/services')
    ])
        .then(([users, services]) => {
            const tableBody = document.getElementById('userServicesList');
            if (!tableBody) return;
            
            tableBody.innerHTML = '';

            Object.entries(users).forEach(([username, user]) => {
                if (user.role !== 'admin' && user.role !== 'reseller') {  // Only show regular users
                    const tr = document.createElement('tr');
                    const userServices = user.services || [];
                    const servicesCount = userServices.length;
                    
                    // Create dropdown for available services
                    const serviceOptions = Object.keys(services)
                        .filter(service => !userServices.includes(service))
                        .map(service => `<option value="${service}">${service}</option>`)
                        .join('');
                    
                    tr.innerHTML = `
                        <td>${username}</td>
                        <td>${user.role || 'user'}</td>
                        <td>
                            <button class="table-action-btn view-services" onclick="viewUserDetails('${username}')">
                                <i class="fas fa-eye"></i> View Services
                            </button>
                        </td>
                        <td>
                            <div class="service-assign-wrapper">
                            <select class="service-dropdown" id="service-${username}">
                                    <option value="">Add service...</option>
                                ${serviceOptions}
                            </select>
                            <button class="add-service-btn" onclick="addServiceToUser('${username}')">
                                <i class="fas fa-plus"></i>
                            </button>
                            </div>
                        </td>
                        <td>
                            <span class="services-count">
                                ${servicesCount} service${servicesCount !== 1 ? 's' : ''} assigned
                            </span>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                }
            });

            // Initialize refresh button functionality
            const refreshButton = document.getElementById('refreshUserServicesTable');
            if (refreshButton) {
                refreshButton.addEventListener('click', () => {
                    refreshButton.classList.add('rotating');
                    loadUserServices().then(() => {
                        setTimeout(() => refreshButton.classList.remove('rotating'), 1000);
                    });
                });
            }
        })
        .catch(err => {
            console.error('Error loading user services:', err);
            showNotification('Failed to load user services', 'error');
        });
}

// Function to add a service to a user
async function addServiceToUser(username) {
    const serviceDropdown = document.getElementById(`service-${username}`);
    const serviceName = serviceDropdown.value;
    
    if (!serviceName) {
        showNotification('Please select a service to add', 'error');
        return;
    }
    
    try {
        // Show confirmation popup
        const popup = document.getElementById('serviceAssignPopup');
        const confirmBtn = document.getElementById('confirmAssign');
        const popupBody = popup.querySelector('.popup-body');
        
        // Clear any existing content from previous assignments
        popupBody.innerHTML = `
            <div class="confirmation-message">
                Do you want to assign <span class="service-name">${serviceName}</span> to <span class="username">${username}</span>?
            </div>
        `;
        
        popup.querySelector('.service-name').textContent = serviceName;
        popup.querySelector('.username').textContent = username;
        popup.style.display = 'flex';
        
        // Handle confirm button click
        confirmBtn.onclick = async () => {
            try {
                // Disable button and show loading state
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                
                const response = await makeRequest('/reseller/add-user-service', {
        method: 'POST',
        body: JSON.stringify({
            username,
            serviceName,
            sessionId: localStorage.getItem('session_id')
        })
                });
                
                if (response.status === 'success') {
                    // Close confirmation popup
                    popup.style.display = 'none';
                    
                    // Show success popup
                    const successPopup = document.getElementById('successPopup');
                    if (!successPopup) {
                        // Create success popup if it doesn't exist
                        const newSuccessPopup = document.createElement('div');
                        newSuccessPopup.id = 'successPopup';
                        newSuccessPopup.className = 'popup-overlay';
                        newSuccessPopup.innerHTML = `
                            <div class="popup-content">
                                <div class="popup-header">
                                    <h3>Success</h3>
                                    <button class="close-popup"><i class="fas fa-times"></i></button>
                                </div>
                                <div class="popup-body">
                                    <div class="confirmation-message">
                                        <i class="fas fa-check-circle" style="color: #4caf50; font-size: 48px; margin-bottom: 20px;"></i>
                                        <p>Service <strong>${serviceName}</strong> has been successfully assigned to <strong>${username}</strong></p>
                                    </div>
                                </div>
                                <div class="popup-actions">
                                    <button class="btn btn-primary" onclick="document.getElementById('successPopup').style.display='none'">OK</button>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(newSuccessPopup);
            } else {
                        // Update existing success popup content
                        successPopup.querySelector('.confirmation-message').innerHTML = `
                            <i class="fas fa-check-circle" style="color: #4caf50; font-size: 48px; margin-bottom: 20px;"></i>
                            <p>Service <strong>${serviceName}</strong> has been successfully assigned to <strong>${username}</strong></p>
                        `;
                    }
                    
                    // Show the success popup
                    const currentSuccessPopup = document.getElementById('successPopup');
                    currentSuccessPopup.style.display = 'flex';
                    
                    // Add click handlers for closing
                    const closeButtons = currentSuccessPopup.querySelectorAll('.close-popup, .btn-primary');
                    closeButtons.forEach(button => {
                        button.onclick = () => {
                            currentSuccessPopup.style.display = 'none';
                        };
                    });
                    
                    // Close on outside click
                    currentSuccessPopup.onclick = (event) => {
                        if (event.target === currentSuccessPopup) {
                            currentSuccessPopup.style.display = 'none';
                        }
                    };
                    
                    // Refresh the services list and user details
                    await Promise.all([
                        loadUserServices(),
                        viewUserDetails(username)
                    ]);
                    
                    // Reset the dropdown
                    serviceDropdown.value = '';
                } else {
                    throw new Error(response.message || 'Failed to add service');
                }
            } catch (error) {
                console.error('Error adding service:', error);
                popup.style.display = 'none';
                showNotification(error.message || 'Failed to add service', 'error');
            } finally {
                // Reset button state
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = 'Confirm';
            }
        };
        
        // Handle cancel button click
        document.getElementById('cancelAssign').onclick = () => {
            popup.style.display = 'none';
        };
        
        // Handle close button click
        popup.querySelector('.close-popup').onclick = () => {
            popup.style.display = 'none';
        };
        
        // Close on outside click
        popup.onclick = (event) => {
            if (event.target === popup) {
                popup.style.display = 'none';
            }
        };
    } catch (err) {
        console.error('Error in service assignment:', err);
        showNotification('Failed to assign service', 'error');
    }
}

// Function to view user services
function viewUserServices(username) {
    makeRequest(`/reseller/user-services/${username}`)
        .then(services => {
            // Implement popup or modal to display user services
            alert(`Services for ${username}:\n${services.join(', ') || 'No services'}`);
        })
        .catch(err => {
            console.error('Error fetching user services:', err);
            showNotification('Failed to load user services', 'error');
        });
}

// Initialize user management page
function initializeUserManagementPage() {
    console.log('Initializing user management page...');
    
    // Update timestamp and date
    const timestamp = document.getElementById('usersTimestamp');
    const dateElement = document.getElementById('usersCurrentDate');
    
    if (timestamp && dateElement) {
        const now = new Date();
        timestamp.textContent = now.toLocaleTimeString();
        dateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    // Update user stats
    updateUserStats();

    // Load initial user data
    loadAllUsers();

    // Set up tabs within the users page
    const tabButtons = document.querySelectorAll('#usersPage .tab-button');
    const tabContents = document.querySelectorAll('#usersPage .tab-content');
    
    console.log('Found tab buttons:', tabButtons.length);
    console.log('Found tab contents:', tabContents.length);
    
    // First hide all tab contents except the first one
    tabContents.forEach((content, index) => {
        if (index === 0) {
            content.style.display = 'block';
            content.classList.add('active');
        } else {
            content.style.display = 'none';
            content.classList.remove('active');
        }
    });

    // Add click event listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            console.log('Tab button clicked:', button.getAttribute('data-tab'));
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => {
                content.style.display = 'none';
                content.classList.remove('active');
            });
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const activeContent = document.getElementById(`${tabId}-tab`);
            
            if (activeContent) {
                console.log('Activating tab content:', tabId);
                activeContent.style.display = 'block';
                activeContent.classList.add('active');
                
                // Initialize specific tab content if needed
                switch(tabId) {
                    case 'allusers':
                    loadAllUsers();
                        break;
                    case 'adduser':
                        // Make sure the form is reset
                        clearForm();
                        // Set up toggle password visibility if needed
                        setupPasswordToggle();
                        break;
                    case 'services':
                    loadServices();
                        break;
                    case 'manageservices':
                    loadUserServices();
                        break;
                }
            } else {
                console.error(`Tab content #${tabId}-tab not found`);
            }
        });
    });
    
    // Set up refresh buttons
    setupRefreshButtons();
    
    // Set up password toggle for the add user form
    setupPasswordToggle();
}

// Function to toggle password visibility
function setupPasswordToggle() {
    const toggleButtons = document.querySelectorAll('.toggle-password');
    toggleButtons.forEach(button => {
        button.removeEventListener('click', togglePasswordVisibility);
        button.addEventListener('click', togglePasswordVisibility);
    });
}

function togglePasswordVisibility(event) {
    const passwordInput = event.target.previousElementSibling;
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        event.target.classList.remove('fa-eye');
        event.target.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        event.target.classList.remove('fa-eye-slash');
        event.target.classList.add('fa-eye');
    }
}

// Function to update user stats
async function updateUserStats() {
    try {
        const response = await makeRequest('/reseller/user-stats');
        const stats = response.data;

        // Update total users
        document.getElementById('usersTotalCount').textContent = stats.totalUsers;
        document.getElementById('usersTotalTrend').textContent = `${stats.totalUsersTrend}%`;
        updateTrendIndicator('usersTotalTrend', stats.totalUsersTrend);

        // Update active users
        document.getElementById('usersActiveCount').textContent = stats.activeUsers;
        document.getElementById('usersActiveTrend').textContent = `${stats.activeUsersTrend}%`;
        updateTrendIndicator('usersActiveTrend', stats.activeUsersTrend);

        // Update inactive users
        document.getElementById('usersInactiveCount').textContent = stats.inactiveUsers;
        document.getElementById('usersInactiveTrend').textContent = `${stats.inactiveUsersTrend}%`;
        updateTrendIndicator('usersInactiveTrend', stats.inactiveUsersTrend);

        // Update new users
        document.getElementById('usersNewCount').textContent = stats.newUsers;
        document.getElementById('usersNewTrend').textContent = `${stats.newUsersTrend}%`;
        updateTrendIndicator('usersNewTrend', stats.newUsersTrend);

    } catch (error) {
        console.error('Error updating user stats:', error);
        showNotification('Failed to update user statistics', 'error');
    }
}

// Helper function to update trend indicator classes
function updateTrendIndicator(elementId, trend) {
    const element = document.getElementById(elementId).parentElement;
    element.classList.remove('up', 'down');
    element.classList.add(trend >= 0 ? 'up' : 'down');
    element.querySelector('i').className = trend >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
}

// Function to set up refresh buttons
function setupRefreshButtons() {
    const refreshButtons = {
        'refreshAllUsersTable': loadAllUsers,
        'refreshServicesTable': loadServices,
        'refreshUserServicesTable': loadUserServices
    };

    Object.entries(refreshButtons).forEach(([buttonId, refreshFunction]) => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', () => {
                button.classList.add('rotating');
                refreshFunction();
                setTimeout(() => button.classList.remove('rotating'), 1000);
            });
        }
    });
}

// Function to initialize sessions page
function initializeSessionsPage() {
    console.log('Initializing sessions page...');
    
    // Ensure the session tables exist
    ensureSessionTablesExist();
    
    // Update timestamp and date
    updateSessionTimestamp();
    
    // Load sessions data with cache busting to ensure fresh data
    loadSessionsTable({ cacheBust: true })
        .then(success => {
            if (!success) {
                console.error('Failed to load initial sessions data');
                showNotification('Failed to load sessions. Please refresh the page.', 'error');
            }
        })
        .catch(error => {
            console.error('Error during initial sessions load:', error);
        });
    
    // Set up refresh buttons
    setupSessionsRefreshButtons();
    
    // Set up automatic refresh every 10 seconds
    const refreshInterval = 10000; // 10 seconds
    
    // Store interval ID in a data attribute on the sessions page
    const sessionsPage = document.getElementById('sessionsPage');
    if (sessionsPage) {
        // Clear any existing interval
        if (sessionsPage.dataset.refreshIntervalId) {
            clearInterval(parseInt(sessionsPage.dataset.refreshIntervalId));
        }
        
        // Set up new interval with silent refresh
        const intervalId = setInterval(() => {
            console.log('Auto-refreshing sessions data silently...');
            loadSessionsTable({ silent: true, cacheBust: true }).catch(error => {
                console.error('Error during auto-refresh:', error);
            });
            
            // Still update timestamp to show last refresh time
            updateSessionTimestamp();
        }, refreshInterval);
        
        // Store interval ID
        sessionsPage.dataset.refreshIntervalId = intervalId;
        
        // Clear interval when navigating away from page
        const navItems = document.querySelectorAll('.nav-item:not([data-page="sessions"])');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                if (sessionsPage.dataset.refreshIntervalId) {
                    clearInterval(parseInt(sessionsPage.dataset.refreshIntervalId));
                    console.log('Cleared sessions auto-refresh interval');
                }
            });
        });
    }
}

// Function to update session timestamp and date
function updateSessionTimestamp() {
    const timestamp = document.getElementById('sessionsTimestamp');
    const dateElement = document.getElementById('sessionsCurrentDate');
    
    if (timestamp && dateElement) {
        const now = new Date();
        timestamp.textContent = now.toLocaleTimeString();
        dateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Function to ensure session tables exist
function ensureSessionTablesExist() {
    console.log('Ensuring session tables exist...');
    
    const sessionsPage = document.getElementById('sessionsPage');
    if (!sessionsPage) {
        console.error('Sessions page not found');
        return;
    }
    
    // Check if the tables already exist
    const activeTable = document.getElementById('activeSessionsTable');
    const recentTable = document.getElementById('recentSessionsTable');
    
    if (activeTable && recentTable) {
        console.log('Session tables already exist');
        return;
    }
    
    // Create stats cards first
    const statsContainer = document.createElement('div');
    statsContainer.className = 'user-stats-container';
    
    // Active Sessions Card
    const activeSessionsCard = document.createElement('div');
    activeSessionsCard.className = 'dashboard-card';
    activeSessionsCard.innerHTML = `
        <div class="card-icon">
            <i class="fas fa-users"></i>
        </div>
        <div class="card-content">
            <h3>Active Sessions</h3>
            <p class="card-value" id="activeSessionsCount">0</p>
            <span class="card-description">Current active users</span>
        </div>
        <div class="trend-indicator up">
            <i class="fas fa-arrow-up"></i>
            <span id="activeSessionsTrend">0%</span>
        </div>
    `;
    
    // Total Sessions Card
    const totalSessionsCard = document.createElement('div');
    totalSessionsCard.className = 'dashboard-card';
    totalSessionsCard.innerHTML = `
        <div class="card-icon">
            <i class="fas fa-chart-line"></i>
        </div>
        <div class="card-content">
            <h3>Total Sessions (24h)</h3>
            <p class="card-value" id="totalSessionsCount">0</p>
            <span class="card-description">Sessions in last 24 hours</span>
        </div>
        <div class="trend-indicator up">
            <i class="fas fa-arrow-up"></i>
            <span id="totalSessionsTrend">0%</span>
        </div>
    `;
    
    // Average Duration Card
    const avgDurationCard = document.createElement('div');
    avgDurationCard.className = 'dashboard-card';
    avgDurationCard.innerHTML = `
        <div class="card-icon">
            <i class="fas fa-clock"></i>
        </div>
        <div class="card-content">
            <h3>Average Duration</h3>
            <p class="card-value" id="avgSessionDuration">0m</p>
            <span class="card-description">Average session length</span>
        </div>
        <div class="trend-indicator up">
            <i class="fas fa-arrow-up"></i>
            <span id="avgDurationTrend">0%</span>
        </div>
    `;
    
    // Peak Hour Card
    const peakHourCard = document.createElement('div');
    peakHourCard.className = 'dashboard-card';
    peakHourCard.innerHTML = `
        <div class="card-icon">
            <i class="fas fa-fire"></i>
        </div>
        <div class="card-content">
            <h3>Peak Hour</h3>
            <p class="card-value">
                <span id="peakSessionsCount">0</span>
                <span style="font-size: 0.7em; opacity: 0.7;"> @ </span>
                <span id="peakSessionTime">00:00</span>
            </p>
            <span class="card-description">Most active hour</span>
        </div>
        <div class="trend-indicator up">
            <i class="fas fa-arrow-up"></i>
            <span id="peakSessionsTrend">0%</span>
        </div>
    `;
    
    // Add all cards to the stats container
    statsContainer.appendChild(activeSessionsCard);
    statsContainer.appendChild(totalSessionsCard);
    statsContainer.appendChild(avgDurationCard);
    statsContainer.appendChild(peakHourCard);
    
    // Create the session tables structure if not exists
    const tablesContainer = document.createElement('div');
    tablesContainer.className = 'sessions-tables-container';
    
    // Create active sessions table
    const activeTableContainer = document.createElement('div');
    activeTableContainer.className = 'table-container';
    activeTableContainer.innerHTML = `
        <div class="table-header">
            <h2>Active Sessions</h2>
            <button id="refreshActiveSessions" class="refresh-btn">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                            </div>
        <table id="activeSessionsTable" class="sessions-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>Login Time</th>
                                        <th>Duration</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
            <tbody id="activeSessionsTableBody">
                <tr>
                    <td colspan="6" class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i> Loading active sessions...
                    </td>
                </tr>
            </tbody>
                            </table>
    `;
    
    // Create recent sessions table
    const recentTableContainer = document.createElement('div');
    recentTableContainer.className = 'table-container';
    recentTableContainer.innerHTML = `
        <div class="table-header">
            <h2>Recent Sessions (Last 24 Hours)</h2>
            <button id="refreshRecentSessions" class="refresh-btn">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                            </div>
        <table id="recentSessionsTable" class="sessions-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>Login Time</th>
                                        <th>Logout Time</th>
                                        <th>Duration</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
            <tbody id="recentSessionsTableBody">
                <tr>
                    <td colspan="7" class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i> Loading session history...
                    </td>
                </tr>
            </tbody>
                            </table>
    `;
    
    // Add tables to container
    tablesContainer.appendChild(activeTableContainer);
    tablesContainer.appendChild(recentTableContainer);
    
    // Create a wrapper for all session content
    const sessionContentWrapper = document.createElement('div');
    sessionContentWrapper.className = 'sessions-content-wrapper';
    
    // Add header with timestamp
    const headerSection = document.createElement('div');
    headerSection.className = 'sessions-header-section';
    headerSection.innerHTML = `
        <div class="sessions-header">
            <h1>Session Management</h1>
            <div class="date-time">
                <div id="sessionsCurrentDate"></div>
                <div class="dashboard-timestamp">
                    Last updated: <span id="sessionsTimestamp"></span>
                    </div>
                </div>
            </div>
        `;

    // Add all elements to the wrapper in order
    sessionContentWrapper.appendChild(headerSection);
    sessionContentWrapper.appendChild(statsContainer);
    sessionContentWrapper.appendChild(tablesContainer);
    
    // Add container to page - clear existing content first
    const contentArea = sessionsPage.querySelector('.content-area') || sessionsPage;
    contentArea.innerHTML = ''; // Clear existing content
    contentArea.appendChild(sessionContentWrapper);
    
    console.log('Session tables and stats created successfully');
}

// Function to set up sessions refresh buttons
function setupSessionsRefreshButtons() {
    console.log('Setting up sessions refresh buttons...');
    
    const refreshButtons = {
        'refreshActiveSessions': () => loadSessionsTable({ cacheBust: true }),
        'refreshRecentSessions': () => loadSessionsTable({ cacheBust: true })
    };

    Object.entries(refreshButtons).forEach(([buttonId, refreshFunction]) => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Remove any existing event listeners to prevent duplicates
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async () => {
                // Add visual feedback
                newButton.classList.add('rotating');
                newButton.disabled = true;
                
                try {
                    // Update timestamp before refresh
                    const timestamp = document.getElementById('sessionsTimestamp');
                    if (timestamp) {
                        timestamp.textContent = 'Refreshing...';
                    }
                    
                    // Add cache-busting parameter to ensure fresh data
                    await refreshFunction();
                    
                    // Update timestamp after refresh
                    if (timestamp) {
                        timestamp.textContent = new Date().toLocaleTimeString();
                    }
                    
                    // Show success indicator briefly
                    newButton.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        newButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
                        newButton.classList.remove('rotating');
                        newButton.disabled = false;
                    }, 1000);
                } catch (error) {
                    console.error('Error refreshing sessions:', error);
                    
                    // Update timestamp after refresh attempt
                    const timestamp = document.getElementById('sessionsTimestamp');
                    if (timestamp) {
                        timestamp.textContent = new Date().toLocaleTimeString();
                    }
                    
                    // Show error indicator briefly
                    newButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                    setTimeout(() => {
                        newButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
                        newButton.classList.remove('rotating');
                        newButton.disabled = false;
                    }, 1000);
                }
            });
            
            console.log(`Refresh button ${buttonId} set up successfully`);
        } else {
            console.warn(`Refresh button ${buttonId} not found`);
        }
    });
}

// Update session statistics
function updateSessionStats(sessions) {
    try {
        // Instead of calculating from all sessions, get the count directly from the active sessions table
        const activeTableBody = document.getElementById('activeSessionsTableBody');
        let activeCount = 0;
        
        if (activeTableBody) {
            // Count actual rows in the table (excluding any with empty-state class)
            const activeRows = activeTableBody.querySelectorAll('tr:not(.empty-table-message)');
            activeCount = activeRows.length;
        }
        
        // Update active sessions count directly from table
        document.getElementById('activeSessionsCount').textContent = activeCount;
        
        // Use a Set to track unique session IDs for other stats
        const processedSessions = new Set();
        
        // Total sessions in last 24 hours - count unique sessions
        const now = new Date();
        const yesterday = new Date(now - 24 * 60 * 60 * 1000);
        const recentSessions = sessions.filter(session => {
            // Get a unique identifier for the session
            const sessionId = session.id || session.sessionId || `${session.userName || session.username}-${session.loginTime}`;
            
            // Check if session is recent
            const isRecent = new Date(session.loginTime) > yesterday;
            
            // If recent and not processed yet, mark as processed and include
            if (isRecent && !processedSessions.has(sessionId)) {
                processedSessions.add(sessionId);
                return true;
            }
            
            return false;
        });
        
        document.getElementById('totalSessionsCount').textContent = recentSessions.length;
        
        // Calculate average duration - only use completed sessions
        const completedSessions = sessions.filter(session => session.logoutTime);
        if (completedSessions.length > 0) {
            const totalDuration = completedSessions.reduce((sum, session) => {
                const duration = new Date(session.logoutTime) - new Date(session.loginTime);
                return sum + duration;
            }, 0);
            const avgDuration = totalDuration / completedSessions.length;
            document.getElementById('avgSessionDuration').textContent = formatDuration(avgDuration);
        }
        
        // Calculate peak hour using unique sessions
        processedSessions.clear();
        const hourCounts = new Array(24).fill(0);
        
        sessions.forEach(session => {
            // Get a unique identifier for the session
            const sessionId = session.id || session.sessionId || `${session.userName || session.username}-${session.loginTime}`;
            
            // Only count each session once
            if (!processedSessions.has(sessionId)) {
                processedSessions.add(sessionId);
                const hour = new Date(session.loginTime).getHours();
                hourCounts[hour]++;
            }
        });
        
        const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
        const peakCount = hourCounts[peakHour];
        document.getElementById('peakSessionsCount').textContent = peakCount;
        document.getElementById('peakSessionTime').textContent = 
            `${peakHour.toString().padStart(2, '0')}:00`;
            
        // Update trend indicators with some sample trends
        // In a real application, these would be calculated from historical data
        updateStatTrend('activeSessionsTrend', 12);
        updateStatTrend('totalSessionsTrend', 8);
        updateStatTrend('avgDurationTrend', 5);
        updateStatTrend('peakSessionsTrend', 15);
        
    } catch (error) {
        console.error('Error updating session stats:', error);
    }
}

// Function to view session details
async function viewSessionDetails(sessionId) {
    try {
        const sessionData = await makeRequest(`/reseller/session/${sessionId}`);
            const popup = document.getElementById('sessionDetailsPopup');
            const content = document.getElementById('sessionDetailsContent');
            
            // Format session data for display
            content.innerHTML = `
                <p><strong>Session ID:</strong> ${sessionId}</p>
            <p><strong>User:</strong> ${sessionData.userName || sessionData.username}</p>
            <p><strong>Role:</strong> ${sessionData.userRole || sessionData.role || 'User'}</p>
                <p><strong>Login Time:</strong> ${new Date(sessionData.loginTime).toLocaleString()}</p>
                <p><strong>Logout Time:</strong> ${sessionData.logoutTime ? new Date(sessionData.logoutTime).toLocaleString() : 'Active'}</p>
            <p><strong>Duration:</strong> ${formatDuration(
                sessionData.logoutTime ? 
                    new Date(sessionData.logoutTime) - new Date(sessionData.loginTime) :
                    new Date() - new Date(sessionData.loginTime)
            )}</p>
                <p><strong>IP Address:</strong> ${sessionData.ipAddress || 'Unknown'}</p>
                <p><strong>Device:</strong> ${sessionData.device || 'Unknown'}</p>
                <p><strong>Browser:</strong> ${sessionData.browser || 'Unknown'}</p>
                <p><strong>Status:</strong> 
                <span class="status-badge ${sessionData.logoutTime ? 'inactive' : 'active'}">
                    ${sessionData.logoutTime ? (sessionData.status || 'Ended') : 'Active'}
                    </span>
                </p>
            `;
            
            // Show popup
            popup.style.display = 'block';
            
            // Add close functionality
            const closeBtn = popup.querySelector('.close-popup');
            closeBtn.onclick = () => {
                popup.style.display = 'none';
            };
        
        // Close on outside click
        popup.onclick = (event) => {
            if (event.target === popup) {
                popup.style.display = 'none';
            }
        };
    } catch (err) {
            console.error('Error fetching session details:', err);
            showNotification('Failed to load session details', 'error');
    }
}

// Initialize services page
function initializeServicesPage() {
    console.log('Initializing services page...');
    
    // Update timestamp and current date
    updateDashboardTimestamp();
    updateCurrentDate();
    
    // Load services for table and user services management
    console.log('About to load services...');
    loadServices()
        .then(services => {
            console.log('Services loaded successfully in initializeServicesPage:', services);
        })
        .catch(error => {
            console.error('Failed to load services in initializeServicesPage:', error);
            showNotification('Failed to load services. Please try again.', 'error');
        });
    
    // Load services grid
    loadServicesGrid()
        .then(() => {
            console.log('Services grid loaded successfully');
        })
        .catch(error => {
            console.error('Failed to load services grid:', error);
        });
    
    // Set up refresh button
    const refreshServicesGridBtn = document.getElementById('refreshServicesGrid');
    if (refreshServicesGridBtn) {
        refreshServicesGridBtn.addEventListener('click', function() {
            this.classList.add('rotating');
            loadServicesGrid().then(() => {
                setTimeout(() => this.classList.remove('rotating'), 1000);
            });
        });
    }
}

// Function to load services in a grid layout
async function loadServicesGrid() {
    console.log('Loading services grid...');
    try {
        console.log('Making API request to /reseller/services for grid view');
        const services = await makeRequest('/reseller/services');
        console.log('Services received for grid:', services);
        
        const servicesGrid = document.getElementById('servicesGrid');
        if (!servicesGrid) {
            console.error('Services grid element not found in DOM');
            return;
        }
        
        console.log('Clearing services grid');
        servicesGrid.innerHTML = '';
        
        if (!services || Object.keys(services).length === 0) {
            console.warn('No services data available for grid');
            servicesGrid.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-info-circle"></i>
                    <p>No services available.</p>
                </div>
            `;
            return;
        }

        // Get API base URL once for all services
        const apiBaseUrl = await getApiBaseUrl();
        
        console.log(`Creating ${Object.keys(services).length} service cards`);
        Object.entries(services).forEach(([serviceName, service]) => {
            console.log(`Creating card for service: ${serviceName}`, service);
            const serviceCard = document.createElement('div');
            serviceCard.className = 'service-card';
            
            // Get image URL or use a default icon
            const hasImage = service.image && service.image.trim() !== '';
            const imageUrl = hasImage ? `${apiBaseUrl}/${service.image}` : '';
            console.log(`Service ${serviceName} image URL: ${imageUrl}`);
            
            // Generate random users count and uptime for demo purposes
            const activeUsers = service.activeUsers || Math.floor(Math.random() * 100);
            const uptime = (95 + Math.floor(Math.random() * 5)) + '%';
            
            serviceCard.innerHTML = `
                <div class="service-card-header">
                    ${hasImage ? 
                        `<div class="service-image">
                            <img src="${imageUrl}" alt="${serviceName}" onerror="this.onerror=null; this.src='assets/default-service.png'; this.classList.add('fallback-icon');">
                        </div>` : 
                        `<div class="service-icon">
                            <i class="fas fa-${service.icon || 'cog'}"></i>
                        </div>`
                    }
                    <div class="service-name">
                        <h3>${serviceName}</h3>
                        <span class="service-status ${service.isActive ? 'status-active' : 'status-inactive'}">
                            <i class="fas fa-${service.isActive ? 'check-circle' : 'times-circle'}"></i>
                            ${service.isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                </div>
                <div class="service-card-body">
                    <div class="service-description">
                        ${service.description || 'No description available for this service.'}
                    </div>
                    <div class="service-meta">
                        <div class="meta-item">
                            <h4>Active Users</h4>
                            <p>${activeUsers}</p>
                        </div>
                        <div class="meta-item">
                            <h4>Uptime</h4>
                            <p>${uptime}</p>
                        </div>
                    </div>
                </div>
                <div class="service-card-footer">
                    <div class="service-price">$${service.price || '0'}</div>
                    <div class="service-actions">
                        <button class="service-btn" onclick="viewServiceDetails('${serviceName}')">
                            <i class="fas fa-eye"></i>
                            Details
                        </button>
                    </div>
                </div>
            `;
            
            servicesGrid.appendChild(serviceCard);
        });
        
        console.log('Updating service stats');
        updateServicesStats(services);
        console.log('Services grid loaded successfully');
        
    } catch (error) {
        console.error('Error loading services grid:', error);
        showNotification('Failed to load services grid', 'error');
        
        // Display error in grid
        const servicesGrid = document.getElementById('servicesGrid');
        if (servicesGrid) {
            servicesGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load services. Please try refreshing.</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }
}

// Function to update services statistics
function updateServicesStats(services) {
    try {
        if (!services || Object.keys(services).length === 0) {
            // Set all stat counters to 0 if no services
            document.getElementById('servicesTotalCount').textContent = '0';
            document.getElementById('servicesActiveCount').textContent = '0';
            document.getElementById('servicesUsersCount').textContent = '0';
            document.getElementById('servicesRevenueCount').textContent = '$0.00';
            return;
        }

        // Calculate totals
        const totalServices = Object.keys(services).length;
        const activeServices = Object.values(services).filter(service => 
            service.isActive || service.status === 'active'
        ).length;
        
        // Count total unique users with services and calculate revenue
        let uniqueUsers = new Set();
        let totalRevenue = 0;
        
        Object.values(services).forEach(service => {
            // Calculate active users (may already be provided by the API)
            const activeUsers = service.activeUsers || 0;
            
            // Add users to the unique users count
            if (service.users && Array.isArray(service.users)) {
                service.users.forEach(user => uniqueUsers.add(user));
            }
            
            // Calculate revenue (price * active users)
            const price = parseFloat(service.price) || 0;
            totalRevenue += price * activeUsers;
        });
        
        // If we don't have any users in the service.users arrays, use the sum of activeUsers
        const totalUniqueUsers = uniqueUsers.size > 0 
            ? uniqueUsers.size 
            : Object.values(services).reduce((sum, service) => sum + (service.activeUsers || 0), 0);
        
        // Update UI
        document.getElementById('servicesTotalCount').textContent = totalServices;
        document.getElementById('servicesActiveCount').textContent = activeServices;
        document.getElementById('servicesUsersCount').textContent = totalUniqueUsers;
        document.getElementById('servicesRevenueCount').textContent = '$' + totalRevenue.toFixed(2);
        
        // Set trend indicators (these could be actual calculations in a real app)
        updateStatTrend('servicesTotalTrend', 5);
        updateStatTrend('servicesActiveTrend', 8);
        updateStatTrend('servicesUsersTrend', 12);
        updateStatTrend('servicesRevenueTrend', 15);

    } catch (error) {
        console.error('Error updating services stats:', error);
    }
}

// Helper function to update trend indicators
function updateStatTrend(elementId, trendValue) {
    const trendElement = document.getElementById(elementId);
    if (!trendElement) return;
    
    trendElement.textContent = Math.abs(trendValue) + '%';
    
    // Get the parent element that contains the icon
    const trendContainer = trendElement.closest('.trend-indicator');
    if (!trendContainer) return;
    
    // Update the trend direction
    if (trendValue > 0) {
        trendContainer.className = 'trend-indicator up';
        trendContainer.querySelector('i').className = 'fas fa-arrow-up';
    } else if (trendValue < 0) {
        trendContainer.className = 'trend-indicator down';
        trendContainer.querySelector('i').className = 'fas fa-arrow-down';
    } else {
        trendContainer.className = 'trend-indicator stable';
        trendContainer.querySelector('i').className = 'fas fa-minus';
    }
}

// Function to view service details
async function viewServiceDetails(serviceName) {
    try {
        const serviceData = await makeRequest(`/reseller/service/${serviceName}`);
        const apiBaseUrl = await getApiBaseUrl();
        
        const popup = document.getElementById('serviceDetailsPopup');
        if (!popup) {
            // Create popup if it doesn't exist
            createServiceDetailsPopup();
        }
        
        const content = document.getElementById('serviceDetailsContent');
        if (!content) {
            console.error('Service details content element not found');
            return;
        }

        // Format service data for display
        const isActive = serviceData.isActive || serviceData.status === 'active';
        const hasImage = serviceData.image && serviceData.image.trim() !== '';
        const imageUrl = hasImage ? `${apiBaseUrl}/${serviceData.image}` : '';
        
        content.innerHTML = `
            <div class="service-detail-header">
                ${hasImage ? 
                    `<div class="service-detail-image">
                        <img src="${imageUrl}" alt="${serviceName}" onerror="this.onerror=null; this.src='assets/default-service.png'; this.classList.add('fallback-icon');">
                    </div>` : 
                    `<div class="service-detail-icon">
                        <i class="fas fa-${serviceData.icon || 'cog'}"></i>
                    </div>`
                }
                <div class="service-detail-title">
                    <h2>${serviceName}</h2>
                    <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>
            <div class="service-detail-info">
                <div class="detail-row">
                    <div class="detail-label">Description:</div>
                    <div class="detail-value">${serviceData.description || 'No description available'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Price:</div>
                    <div class="detail-value price">$${serviceData.price || '0'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Active Users:</div>
                    <div class="detail-value">${serviceData.activeUsers || '0'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Added Date:</div>
                    <div class="detail-value">${formatDate(serviceData.addedDate) || 'Unknown'}</div>
                </div>
            </div>
        `;
        
        // Show popup
        popup.style.display = 'block';
        
        // Add close functionality
        const closeBtn = popup.querySelector('.close-popup');
        if (closeBtn) {
            closeBtn.onclick = () => {
                popup.style.display = 'none';
            };
        }
        
        // Close on outside click
        popup.onclick = (event) => {
            if (event.target === popup) {
                popup.style.display = 'none';
            }
        };
    } catch (err) {
        console.error('Error fetching service details:', err);
        showNotification('Failed to load service details', 'error');
    }
}

// Helper function to create the service details popup if it doesn't exist
function createServiceDetailsPopup() {
    // Check if popup already exists
    if (document.getElementById('serviceDetailsPopup')) return;
    
    const popup = document.createElement('div');
    popup.id = 'serviceDetailsPopup';
    popup.className = 'popup-overlay';
    
    popup.innerHTML = `
        <div class="popup-content service-details-popup">
            <div class="popup-header">
                <h3>Service Details</h3>
                <button class="close-popup"><i class="fas fa-times"></i></button>
            </div>
            <div class="popup-body">
                <div id="serviceDetailsContent" class="service-details-content"></div>
            </div>
            <div class="popup-footer">
                <button class="popup-btn close-btn">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Set up close buttons
    const closeButtons = popup.querySelectorAll('.close-popup, .close-btn');
    closeButtons.forEach(btn => {
        btn.onclick = () => {
            popup.style.display = 'none';
        };
    });
}

// Function to remove a service from a user
async function removeServiceFromUser(username, serviceName) {
    try {
        // Show confirmation dialog
        if (!confirm(`Are you sure you want to remove ${serviceName} from ${username}?`)) {
            return;
        }

        const response = await makeRequest('/reseller/remove-user-service', {
            method: 'POST',
            body: JSON.stringify({
                username,
                serviceName,
                sessionId: localStorage.getItem('session_id')
            })
        });

        if (response.status === 'success') {
            showNotification(`Successfully removed ${serviceName} from ${username}`, 'success');
            
            // Refresh the services list
            await viewUserDetails(username);
            await loadUserServices();
        } else {
            throw new Error(response.message || 'Failed to remove service');
        }
    } catch (error) {
        console.error('Error removing service:', error);
        showNotification(`Failed to remove service: ${error.message}`, 'error');
    }
}

// Function to terminate a user's session
async function terminateSession(username, sessionId) {
    try {
        // Handle both direct username/sessionId calls and event-based calls
        if (!username && !sessionId) {
            console.error("Invalid parameters for terminateSession");
            showNotification("Error: Could not terminate session due to invalid parameters", "error");
            return;
        }
        
        // Show confirmation dialog with the username
        const confirmMessage = `Are you sure you want to terminate the session for ${username}?`;
        
        if (!confirm(confirmMessage)) {
            console.log('Session termination cancelled by reseller');
            return;
        }

        // Show loading state
        showNotification('Terminating session...', 'info');

        // Get the API base URL
        const apiBaseUrl = await getApiBaseUrl();
        
        // Prepare the payload
        const payload = {
            username: username,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            action: 'force_logout'
        };
        
        console.log(`Terminating session with payload:`, payload);

        // Call the force-logout endpoint
        const response = await fetch(`${apiBaseUrl}/admin/force-logout`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('session_id')}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Session termination failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.message || 'Failed to terminate session');
        }

        // Show success message
        showNotification(`Successfully terminated ${username}'s session`, 'success');
        
        // Refresh the sessions table
        setTimeout(() => loadSessionsTable({ cacheBust: true }), 1000);

    } catch (error) {
        console.error('Session termination error:', error);
        showNotification(`Failed to terminate session: ${error.message}`, 'error');
    }
}

// Add WebSocket setup function for reseller panel
function setupWebSocket(sessionId) {
    if (!sessionId) {
        console.error("Cannot setup WebSocket: No session ID provided");
        return null;
    }
    
    try {
        // Get the WebSocket server URL from the current URL
        const currentUrl = new URL(window.location.href);
        const host = currentUrl.host;
        const protocol = currentUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // Use the current host for WebSocket connection - simplest and most reliable
        const wsUrl = `${protocol}//${host}?sessionId=${sessionId}`;
        console.log(`Setting up WebSocket connection to: ${wsUrl}`);
        
        try {
            const socket = new WebSocket(wsUrl);
            
            socket.onopen = function() {
                console.log('WebSocket connection established');
                // Send an identification message
                socket.send(JSON.stringify({
                    action: 'identify',
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                }));
            };

            socket.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    console.log('WebSocket message received:', data);

                    // Handle force logout events
                    if (data.action === 'force_logout') {
                        // Show notification to user
                        showNotification(data.message || 'Your session has been terminated by an administrator', 'error');
                        
                        // Clear local session data and redirect to login page
                        setTimeout(() => {
                            performLocalCleanup();
                        }, 1500);
                    }
                    
                    // Handle session refresh events
                    if (data.action === 'refresh_sessions') {
                        console.log('Received session refresh request');
                        // Check if we're on the sessions page
                        const sessionsPage = document.getElementById('sessionsPage');
                        if (sessionsPage && sessionsPage.style.display !== 'none') {
                            // Refresh the sessions table silently
                            loadSessionsTable({ silent: true, cacheBust: true });
                        }
                    }
                    
                    // Handle service update events
                    if (data.action === 'service_updated') {
                        const message = data.message || `Service ${data.service} has been ${data.operation}.`;
                        showNotification(message, 'info');
                        
                        // Refresh services if we're on the services page
                        const servicesPage = document.getElementById('servicesPage');
                        if (servicesPage && servicesPage.style.display !== 'none') {
                            loadServicesGrid();
                        }
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            };

            socket.onclose = function(event) {
                console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
            };

            socket.onerror = function(error) {
                console.error('WebSocket error:', error);
            };

            // Store the socket in a global variable for access from other functions
            window.resellerWebSocket = socket;
            return socket;
        } catch (connectionError) {
            console.error('Error creating WebSocket connection:', connectionError);
            return null;
        }
    } catch (error) {
        console.error("Error setting up WebSocket:", error);
        return null;
    }
}

// Initialize the application when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Document loaded. Starting initialization...');
    
    // Set up navigation
    setupNavigation();
    
    // Set up WebSocket connection
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
        setupWebSocket(sessionId);
    }
    
    // Set up logout button functionality
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function() {
            // Custom logout implementation for reseller
            handleResellerLogout();
        });
    }
    
    // Test API connectivity without navigating
    console.log('Testing services API...');
    makeRequest('/reseller/services')
        .then(data => {
            console.log('Services API test successful:', data);
            // No automatic navigation to services page
        })
        .catch(err => {
            console.error('Services API test failed:', err);
        });
    
    // Check if there's a hash in the URL to determine which page to show
    const hash = window.location.hash;
    console.log(`URL hash: ${hash}`);
    
    // Default to dashboard if no hash
    if (!hash) {
        document.getElementById('dashboardNav').click();
    } else {
        // Extract page name from hash
        const pageName = hash.substring(1); // Remove the # character
        console.log(`Navigating to page: ${pageName}`);
        
        // Find the navigation element for the page
        const navElement = document.getElementById(`${pageName}Nav`);
        if (navElement) {
            console.log(`Clicking on navigation element for ${pageName}`);
            navElement.click();
        } else {
            console.warn(`Navigation element for ${pageName} not found, defaulting to dashboard`);
            document.getElementById('dashboardNav').click();
        }
    }
    
    // Add event listener for hash changes
    window.addEventListener('hashchange', () => {
        const newHash = window.location.hash;
        const pageName = newHash.substring(1);
        console.log(`Hash changed to ${newHash}, navigating to ${pageName}`);
        
        const navElement = document.getElementById(`${pageName}Nav`);
        if (navElement) {
            navElement.click();
        }
    });
});

// Custom logout handler for reseller that ensures proper session termination
async function handleResellerLogout() {
    try {
        // Show loading state on logout button
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
            logoutBtn.disabled = true;
        }
        
        // Get session data
        const sessionId = localStorage.getItem('session_id');
        const username = localStorage.getItem('username');
        
        if (!sessionId) {
            console.warn('No session ID found, proceeding with local cleanup only');
            performLocalCleanup();
            return;
        }
        
        console.log('Logging out with session ID:', sessionId);
        
        // First, try to call the server logout endpoint
        const apiBaseUrl = await getApiBaseUrl();
        
        // Prepare the request body with both sessionId and username
        const requestBody = JSON.stringify({
            sessionId: sessionId,
            username: username,
            timestamp: new Date().toISOString()
        });
        
        // Make the request to server logout endpoint
        const response = await fetch(`${apiBaseUrl}/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: requestBody
        });
        
        console.log('Logout response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Server logout successful:', data);
        } else {
            console.warn(`Server logout failed with status: ${response.status}`);
            
            // Try alternative endpoint as fallback
            try {
                const fallbackResponse = await fetch(`${apiBaseUrl}/auth/signout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionId}`
                    },
                    body: requestBody
                });
                
                console.log('Fallback logout response:', fallbackResponse.status);
            } catch (fallbackError) {
                console.error('Fallback logout error:', fallbackError);
            }
        }
    } catch (error) {
        console.error('Error during logout:', error);
    } finally {
        // Always perform local cleanup regardless of server response
        performLocalCleanup();
    }
}

// Helper function to clean up local storage and redirect
function performLocalCleanup() {
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
}

// Initialize settings page
function initializeSettingsPage() {
    console.log('Initializing settings page...');
    
    // Update timestamp and date
    const timestamp = document.getElementById('settingsTimestamp');
    const dateElement = document.getElementById('settingsCurrentDate');
    
    if (timestamp && dateElement) {
        const now = new Date();
        timestamp.textContent = now.toLocaleTimeString();
        dateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Load reseller profile
    loadResellerProfile();

    // Set up security form
    setupSecurityForm();

    // Set up profile picture functionality
    setupProfilePicture();

    // Set up theme toggle
    setupThemeToggle();

    // Set up notification preferences
    setupNotificationPreferences();
    
    // Set up update checker
    setupUpdateChecker();
}

// Function to check for updates
function checkForUpdates() {
    if (window.electronAPI && window.electronAPI.checkForUpdates) {
        // Show checking status
        const updateMessage = document.getElementById('currentAppVersion');
        const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
        
        if (checkUpdatesBtn) {
            checkUpdatesBtn.disabled = true;
            checkUpdatesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        }
        
        // Call the electron API to check for updates
        window.electronAPI.checkForUpdates();
        
        // Reset button after 3 seconds
        setTimeout(() => {
            if (checkUpdatesBtn) {
                checkUpdatesBtn.disabled = false;
                checkUpdatesBtn.innerHTML = '<i class="fas fa-sync"></i> Check for Updates';
            }
        }, 3000);
        
        // Show notification
        showNotification('Checking for updates...', 'info');
    } else {
        console.error('Update checking not available');
        showNotification('Update checking not available in this environment', 'error');
    }
}

// Setup update checker in settings page
function setupUpdateChecker() {
    const versionElement = document.getElementById('currentAppVersion');
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
    
    if (versionElement && window.electronAPI) {
        // Get current app version
        window.electronAPI.getAppVersion().then(version => {
            versionElement.textContent = `v${version}`;
        }).catch(error => {
            console.error('Error getting app version:', error);
            versionElement.textContent = 'Unknown version';
        });
    }
    
    if (checkUpdatesBtn) {
        checkUpdatesBtn.addEventListener('click', checkForUpdates);
    }
}

// Set up profile picture functionality
function setupProfilePicture() {
    const profilePicture = document.getElementById('profilePicture');
    const profilePictureInput = document.getElementById('profilePictureInput');
    const changeProfilePictureBtn = document.getElementById('changeProfilePicture');
    const removeProfilePictureBtn = document.getElementById('removeProfilePicture');
    const profilePictureContainer = document.querySelector('.profile-picture-container');
    
    // Check if elements exist
    if (!profilePicture || !profilePictureInput || !changeProfilePictureBtn || !removeProfilePictureBtn) {
        console.error('Profile picture elements not found');
        return;
    }
    
    // Load current profile picture
    loadProfilePicture();
    
    // Handle click on profile picture container
    if (profilePictureContainer) {
        profilePictureContainer.addEventListener('click', () => {
            profilePictureInput.click();
        });
    }
    
    // Handle click on change button
    changeProfilePictureBtn.addEventListener('click', () => {
        profilePictureInput.click();
    });
    
    // Handle file selection
    profilePictureInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            
            // Validate file type
            if (!file.type.match('image.*')) {
                showNotification('Please select an image file', 'error');
                return;
            }
            
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showNotification('Image size should be less than 5MB', 'error');
                return;
            }
            
            // Create a local preview before uploading
            const reader = new FileReader();
            reader.onload = function(e) {
                profilePicture.src = e.target.result; // Show preview immediately
            };
            reader.readAsDataURL(file);
            
            // Show loading state
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = '<img src="assets/loading-spinner.gif" alt="Loading..." onerror="this.src=\'data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMLCwkJCQgAAAGJiYoKCgpKSkiH+GkNyZWF0ZWQgd2l0aCBhamF4bG9hZC5pbmZvACH5BAAKAAAAIf8LTkVUU0NBUEUyLjADAQAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZnAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQACgABACwAAAAAEAAQAAADNAi63P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkEAAoAAgAsAAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKpZBqfvwQAIfkEAAoAAwAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8DYlJd8z0fMDgsGo/IpHI5TAAAIfkEAAoABAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJUlIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQACgAFACwAAAAAEAAQAAADMwi6IMKQORfjdOe82p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQACgAGACwAAAAAEAAQAAADMgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAAKAAcALAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsRkAAAOwAAAAAAAAAAAA==\">';
            
            if (profilePictureContainer) {
                profilePictureContainer.appendChild(loadingOverlay);
            }
            
            // Upload the file
            uploadProfilePicture(file)
                .then(response => {
                    if (response && response.status === 'success' && response.profilePicture) {
                        // Update the profile picture with the URL from the server
                        profilePicture.src = response.profilePicture;
                        showNotification('Profile picture updated successfully', 'success');
                    } else {
                        throw new Error(response && response.message ? response.message : 'Failed to upload profile picture');
                    }
                })
                .catch(error => {
                    console.error('Error uploading profile picture:', error);
                    // Reset to default avatar on error
                    profilePicture.src = 'assets/default-avatar.png';
                    showNotification('Failed to upload profile picture: ' + (error.message || 'Unknown error'), 'error');
                })
                .finally(() => {
                    // Remove loading overlay
                    if (loadingOverlay && loadingOverlay.parentNode) {
                        loadingOverlay.parentNode.removeChild(loadingOverlay);
                    }
                });
        }
    });
    
    // Handle remove button click
    removeProfilePictureBtn.addEventListener('click', () => {
        // Show loading state
        profilePicture.classList.add('loading');
        
        removeProfilePicture()
            .then(response => {
                if (response && response.status === 'success') {
                    profilePicture.src = 'assets/default-avatar.png';
                    showNotification('Profile picture removed', 'success');
                } else {
                    throw new Error(response && response.message ? response.message : 'Failed to remove profile picture');
                }
            })
            .catch(error => {
                console.error('Error removing profile picture:', error);
                showNotification('Failed to remove profile picture: ' + (error.message || 'Unknown error'), 'error');
            })
            .finally(() => {
                // Remove loading class
                profilePicture.classList.remove('loading');
            });
    });
}

// Load profile picture
async function loadProfilePicture() {
    try {
        const response = await makeRequest('/reseller/profile');
        const profilePicture = document.getElementById('profilePicture');
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        
        if (response && response.profilePicture) {
            // Use the full URL from the API response
            const imageUrl = response.profilePicture;
            profilePicture.src = imageUrl;
            
            // Update sidebar avatar if it exists
            if (sidebarAvatar) {
                sidebarAvatar.src = imageUrl;
            }
        } else {
            // Use relative path for default avatar
            profilePicture.src = 'assets/default-avatar.png';
            
            // Update sidebar avatar if it exists
            if (sidebarAvatar) {
                sidebarAvatar.src = 'assets/default-avatar.png';
            }
        }
    } catch (error) {
        console.error('Error loading profile picture:', error);
        const profilePicture = document.getElementById('profilePicture');
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        
        // Set default image on error
        if (profilePicture) {
            profilePicture.src = 'assets/default-avatar.png';
        }
        
        // Update sidebar avatar if it exists
        if (sidebarAvatar) {
            sidebarAvatar.src = 'assets/default-avatar.png';
        }
    }
}

// Upload profile picture
async function uploadProfilePicture(file) {
    try {
        const formData = new FormData();
        formData.append('profilePicture', file);
        
        const apiBaseUrl = await getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/reseller/upload-profile-picture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('session_id')}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Update sidebar avatar if it exists
        if (result.status === 'success' && result.profilePicture) {
            const sidebarAvatar = document.getElementById('sidebarAvatar');
            if (sidebarAvatar) {
                sidebarAvatar.src = result.profilePicture;
            }
        }
        
        return result;
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        throw error;
    }
}

// Remove profile picture
async function removeProfilePicture() {
    try {
        const result = await makeRequest('/reseller/remove-profile-picture', {
            method: 'POST'
        });
        
        // Update sidebar avatar if it exists and operation was successful
        if (result.status === 'success') {
            const sidebarAvatar = document.getElementById('sidebarAvatar');
            if (sidebarAvatar) {
                sidebarAvatar.src = 'assets/default-avatar.png';
            }
        }
        
        return result;
    } catch (error) {
        console.error('Error removing profile picture:', error);
        throw error;
    }
}

// Load reseller profile data
async function loadResellerProfile() {
    try {
        const response = await makeRequest('/reseller/profile');
        
        // Populate profile form with read-only data
        document.getElementById('displayName').value = response.displayName || '';
        document.getElementById('email').value = response.email || '';
        document.getElementById('phone').value = response.phone || '';

        // Set notification preferences
        document.getElementById('emailNotifications').checked = response.preferences?.emailNotifications ?? true;
        document.getElementById('serviceUpdates').checked = response.preferences?.serviceUpdates ?? true;
        document.getElementById('userActivity').checked = response.preferences?.userActivity ?? true;

        // Set theme preference
        document.getElementById('darkMode').checked = response.preferences?.darkMode ?? true;
    } catch (error) {
        console.error('Error loading reseller profile:', error);
        showNotification('Failed to load profile settings', 'error');
    }
}

// Set up security form
function setupSecurityForm() {
    // Security form submission
    document.getElementById('securitySettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                showNotification('Please fill in all password fields', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showNotification('New passwords do not match', 'error');
                return;
            }

            await makeRequest('/reseller/change-password', {
                method: 'POST',
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            showNotification('Password changed successfully', 'success');
            document.getElementById('securitySettingsForm').reset();
        } catch (error) {
            console.error('Error changing password:', error);
            showNotification('Failed to change password', 'error');
        }
    });
}

// Set up theme toggle
function setupThemeToggle() {
    const darkModeToggle = document.getElementById('darkMode');
    
    darkModeToggle.addEventListener('change', () => {
        document.body.classList.toggle('light-mode', !darkModeToggle.checked);
        
        // Save preference
        makeRequest('/reseller/update-preferences', {
            method: 'POST',
            body: JSON.stringify({
                darkMode: darkModeToggle.checked
            })
        }).catch(error => {
            console.error('Error saving theme preference:', error);
        });
    });
}

// Set up notification preferences
function setupNotificationPreferences() {
    const notificationToggles = [
        'emailNotifications',
        'serviceUpdates',
        'userActivity'
    ];

    notificationToggles.forEach(id => {
        const toggle = document.getElementById(id);
        toggle.addEventListener('change', () => {
            makeRequest('/reseller/update-preferences', {
                method: 'POST',
                body: JSON.stringify({
                    [id]: toggle.checked
                })
            }).catch(error => {
                console.error(`Error saving ${id} preference:`, error);
                // Revert toggle if save failed
                toggle.checked = !toggle.checked;
                showNotification('Failed to save notification preference', 'error');
            });
        });
    });
}

// Update reseller information
async function updateResellerInfo() {
    try {
        const response = await makeRequest('reseller/profile');
        const resellerData = await response.json();
        
        // Update reseller name in welcome message
        const resellerNameElement = document.getElementById('resellerName');
        if (resellerNameElement) {
            resellerNameElement.textContent = resellerData.name || 'Reseller';
        }
        
        // Update sidebar reseller info
        const sidebarNameElement = document.getElementById('reseller-name');
        const sidebarRoleElement = document.getElementById('reseller-role');
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        
        if (sidebarNameElement) {
            sidebarNameElement.textContent = resellerData.name || 'Reseller User';
        }
        if (sidebarRoleElement) {
            sidebarRoleElement.textContent = resellerData.role || 'Reseller';
        }
        if (sidebarAvatar && resellerData.avatar) {
            sidebarAvatar.src = resellerData.avatar;
        }
    } catch (error) {
        console.error('Error updating reseller info:', error);
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Initial updates
    updateDashboardTimestamp();
    validateResellerSession();
    
    // Update timestamp every second
    setInterval(updateDashboardTimestamp, 1000);
});