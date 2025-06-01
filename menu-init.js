// menu-init.js - Initialize menu based on user role
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're in an Electron environment
    if (window.electron) {
        initializeMenu();
        
        // Also handle navigation/URL changes that might happen without a page reload
        observeUrlChanges();
    } else {
        console.warn('Not running in Electron environment');
    }
});

// Initialize the menu based on user role
function initializeMenu() {
    // Get the user role from localStorage
    const userRole = localStorage.getItem('user_role');
    
    if (userRole) {
        console.log(`Initializing menu for role: ${userRole}`);
        // Send the role to the main process to set the appropriate menu
        window.electron.setMenuByRole(userRole);
        
        // Also update any UI elements that should reflect the role
        updateUIBasedOnRole(userRole);
    } else {
        console.warn('No user role found in localStorage');
        
        // Check if we're on the login page - if not, redirect to login
        if (!window.location.href.includes('login-popup.html')) {
            console.log('No user role found and not on login page. Redirecting to login.');
            window.location.href = 'login-popup.html';
        }
    }
}

// Update UI elements based on user role
function updateUIBasedOnRole(role) {
    // Example: Show/hide admin dashboard button for users with admin role
    const adminDashboardBtn = document.getElementById('adminDashboardBtn');
    if (adminDashboardBtn) {
        if (role === 'admin') {
            adminDashboardBtn.style.display = 'block';
            
            // Add click handler if it's not the admin page already
            if (!window.location.href.includes('admin.html')) {
                adminDashboardBtn.onclick = () => {
                    window.location.href = 'admin.html';
                };
            }
        } else {
            adminDashboardBtn.style.display = 'none';
        }
    }
}

// Observe URL changes to update the menu accordingly
function observeUrlChanges() {
    // Create a new observer instance
    const observer = new MutationObserver((mutations) => {
        // If we detect a URL change, reinitialize the menu
        if (window.location.href !== lastUrl) {
            console.log(`URL changed to: ${window.location.href}`);
            lastUrl = window.location.href;
            initializeMenu();
        }
    });
    
    // Remember the last URL to detect changes
    let lastUrl = window.location.href;
    
    // Start observing the document with the configured parameters
    observer.observe(document, { subtree: true, childList: true });
    
    // Also reinitialize menu when hash changes (SPA navigation)
    window.addEventListener('hashchange', () => {
        console.log(`Hash changed: ${window.location.hash}`);
        initializeMenu();
    });
} 