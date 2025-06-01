// Add a function to get the API base URL
function getApiBaseUrl() {
    // Try to get from window.electron if available (for Electron app)
    if (window.electron && window.electron.apiBaseUrl) {
        return window.electron.apiBaseUrl;
    }
    
    // Try to get from window.config if available (for web app)
    if (window.config && window.config.API_BASE_URL) {
        return window.config.API_BASE_URL;
    }
    
    // For local development using file:// protocol, return the production URL
    if (window.location.protocol === 'file:') {
        return 'http://venzell.skplay.net';
    }
    
    // Try to build URL from current host for web app
    if (window.location.protocol.includes('http')) {
        const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
        const port = window.location.port;
        return port ? `${baseUrl}:${port}` : baseUrl;
    }
    
    // Fallback to the production URL without port
    return 'http://venzell.skplay.net';
}

// Function to create service card
function createServiceCard(serviceName, service) {
    const div = document.createElement('div');
    div.className = 'service-card';
    
    // Improved image path handling with better fallbacks
    let logoPath = '';
    
    // Check if service.image exists and is a non-empty string
    if (service.image && typeof service.image === 'string' && service.image.trim() !== '') {
        // If it's a full URL, use it directly
        if (service.image.startsWith('http')) {
            logoPath = service.image;
        } 
        // If it starts with /assets, treat as server path
        else if (service.image.startsWith('/assets') || service.image.startsWith('assets')) {
            // Fix path by ensuring it starts with the API base URL if not http
            if (!service.image.startsWith('http')) {
                // Remove leading slash if present for consistency
                const cleanPath = service.image.startsWith('/') ? 
                    service.image.substring(1) : service.image;
                    
                // Get base API URL and add the path
                logoPath = getApiBaseUrl() + '/' + cleanPath;
            } else {
                logoPath = service.image;
            }
        }
        // For filenames with timestamp format (like in the uploaded images)
        else if (/^\d+-\d+\.(png|jpg|jpeg|gif)$/i.test(service.image)) {
            // This is likely an uploaded image, construct the full path
            logoPath = getApiBaseUrl() + '/assets/6 Services logos/' + service.image;
        }
        // Otherwise use as is, but add API base URL for relative paths
        else {
            logoPath = !/^(https?:\/\/|data:)/.test(service.image) ? 
                getApiBaseUrl() + '/assets/6 Services logos/' + service.image : 
                service.image;
        }
    } 
    // Check for legacy logo property
    else if (service.logo && typeof service.logo === 'string' && service.logo.trim() !== '') {
        // Apply the same logic for logos
        if (service.logo.startsWith('http')) {
            logoPath = service.logo;
        } else {
            logoPath = getApiBaseUrl() + '/assets/6 Services logos/' + 
                (service.logo.startsWith('/') ? service.logo.substring(1) : service.logo);
        }
    }
    // Default fallback based on service name
    else {
        logoPath = getApiBaseUrl() + '/assets/6 Services logos/' + serviceName.toLowerCase() + '.png';
        console.log(`No image provided for ${serviceName}, using default path: ${logoPath}`);
    }
    
    console.log(`Service card for ${serviceName} using image path: ${logoPath}`);
    
    // Format price with PKR currency
    const priceDisplay = service.price ? `PKR ${parseFloat(service.price).toFixed(2)}` : 'Free';
    
    div.innerHTML = `
        <div class="service-content">
            <img src="${logoPath}" 
                 alt="${serviceName}"
                 class="service-logo"
                 onerror="this.onerror=null; this.src='${getApiBaseUrl()}/assets/6 Services logos/default.png'; console.log('Fallback to default image for ${serviceName}');">
            <h3>${serviceName}</h3>
            <div class="service-stats">
                <span class="price-tag">${priceDisplay}</span>
                <span class="active-users">Active Users: <strong>${service.activeUsers || 0}</strong></span>
                <span class="status ${service.status || 'active'}">${service.status || 'active'}</span>
            </div>
            <div class="service-actions">
                <button class="access-btn" title="Access Service"><i class="fas fa-external-link-alt"></i></button>
                <button class="settings-btn" title="Settings"><i class="fas fa-cog"></i></button>
                <button class="delete-btn">Delete</button>
            </div>
        </div>
    `;
    
    // Add click handler for delete button
    const deleteBtn = div.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete ${serviceName}?`)) {
            deleteService(serviceName);
        }
    });
    
    // Add click handler for settings button
    const settingsBtn = div.querySelector('.settings-btn');
    settingsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showManageServiceModal(serviceName, service);
    });
    
    // Add click handler for access button
    const accessBtn = div.querySelector('.access-btn');
    accessBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // Open service URL in new tab using electron API
        if (service.url) {
            // Determine current role - default to 'user' if not found
            const currentRole = localStorage.getItem('user_role') || 'user';
            window.electron.openInApp(service.url, currentRole);
        } else {
            alert('Service URL is not available');
        }
    });
    
    return div;
}

// Function to refresh services list with active user counts
function refreshServicesList() {
    const apiBaseUrl = getApiBaseUrl();
    console.log("Refreshing services list using API URL:", apiBaseUrl);
    
    // First get the users to calculate active users for each service
    fetch(`${apiBaseUrl}/admin/users`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch users data: ' + response.statusText);
            }
            return response.json();
        })
        .then(users => {
            console.log(`Found ${Object.keys(users).length} users`);
            
            // Calculate active users for each service
            const serviceUsage = {};
            
            // Count users for each service
            Object.values(users).forEach(user => {
                if (user.services && Array.isArray(user.services)) {
                    user.services.forEach(service => {
                        serviceUsage[service] = (serviceUsage[service] || 0) + 1;
                    });
                }
            });

            console.log("Service usage data:", serviceUsage);

            // Now get and update services with the usage counts
            return fetch(`${apiBaseUrl}/api/services`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch services data: ' + response.statusText);
                    }
                    return response.json();
                })
                .then(services => {
                    console.log(`Found ${Object.keys(services).length} services`);
                    
                    // Process and normalize each service object
                    Object.keys(services).forEach(serviceName => {
                        // Update active users count
                        services[serviceName].activeUsers = serviceUsage[serviceName] || 0;
                        
                        // Ensure service has name property
                        services[serviceName].name = serviceName;
                        
                        // Make sure image property exists and is properly formatted
                        if (!services[serviceName].image && services[serviceName].logo) {
                            services[serviceName].image = services[serviceName].logo;
                        } else if (!services[serviceName].image) {
                            // Set default path
                            services[serviceName].image = `${serviceName.toLowerCase()}.png`;
                        }
                        
                        // Process image paths for timestamp-based filenames
                        if (services[serviceName].image && 
                            /^\d+-\d+\.(png|jpg|jpeg|gif)$/i.test(services[serviceName].image)) {
                            // Log that we're dealing with an uploaded image
                            console.log(`Service ${serviceName} has timestamp-based image: ${services[serviceName].image}`);
                        }
                        
                        console.log(`Processed service: ${serviceName}, image: ${services[serviceName].image}`);
                    });
                    
                    return services;
                });
        })
        .then(services => {
            const servicesGrid = document.querySelector('.services-grid');
            if (!servicesGrid) {
                console.error("Services grid not found in the DOM");
                return;
            }
            
            servicesGrid.innerHTML = ''; // Clear existing services
            
            if (Object.keys(services).length === 0) {
                console.log("No services found");
                servicesGrid.innerHTML = '<div class="no-services-message">No services available</div>';
                return;
            }

            console.log("Creating service cards...");
            for (const serviceName in services) {
                try {
                    // Prepare the service object with all necessary properties
                    const processedService = {
                        ...services[serviceName],
                        name: serviceName,
                        // Keep image path as-is to let createServiceCard handle it correctly
                        image: services[serviceName].image || '',
                        logo: services[serviceName].logo || '',
                        url: services[serviceName].url || '',
                        status: services[serviceName].status || 'active',
                        activeUsers: services[serviceName].activeUsers || 0
                    };
                    
                    const serviceCard = createServiceCard(serviceName, processedService);
                    servicesGrid.appendChild(serviceCard);
                } catch (error) {
                    console.error(`Error creating card for service ${serviceName}:`, error);
                }
            }

            // Update services stats in the header section
            updateServicesHeaderStats(services);
            console.log("Services list refreshed successfully");
        })
        .catch(err => {
            console.error('Error refreshing services:', err);
            const servicesGrid = document.querySelector('.services-grid');
            if (servicesGrid) {
                servicesGrid.innerHTML = `<div class="error-message">Error loading services: ${err.message}</div>`;
            }
        });
}

// New function to update services header statistics
function updateServicesHeaderStats(services) {
    const totalServices = Object.keys(services).length;
    const totalActiveUsers = Object.values(services).reduce((sum, service) => 
        sum + (service.activeUsers || 0), 0);

    // Update the services page stats
    const totalServicesElement = document.getElementById('totalServices');
    const serviceUsersElement = document.getElementById('serviceUsers');
    
    if (totalServicesElement) {
        totalServicesElement.textContent = totalServices;
    }
    if (serviceUsersElement) {
        serviceUsersElement.textContent = totalActiveUsers;
    }
    
    // Also update revenue if the element exists
    const revenueElement = document.getElementById('servicesRevenue');
    if (revenueElement) {
        const totalRevenue = Object.values(services).reduce((sum, service) => {
            return sum + ((service.price || 0) * (service.activeUsers || 0));
        }, 0);
        revenueElement.textContent = `PKR ${totalRevenue.toFixed(2)}`;
    }
}

// Function to update dashboard service statistics (separate from services page)
function updateDashboardServiceStats() {
    fetch(`${getApiBaseUrl()}/admin/service-stats`)
        .then(response => response.json())
        .then(data => {
            // Update dashboard cards if they exist
            const dashboardTotalServices = document.getElementById('totalServicesCount');
            if (dashboardTotalServices) {
                dashboardTotalServices.textContent = data.totalServices;
            }

            const dashboardActiveUsers = document.getElementById('activeUsersCount');
            if (dashboardActiveUsers) {
                dashboardActiveUsers.textContent = data.totalActiveUsers;
            }
        })
        .catch(err => console.error('Error loading dashboard service stats:', err));
}

// Function to delete service
function deleteService(serviceName) {
    fetch(`${getApiBaseUrl()}/admin/delete-service`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ serviceName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('Service deleted successfully!');
            refreshServicesList();
        } else {
            alert(data.message || 'Failed to delete service');
        }
    })
    .catch(err => {
        console.error('Error deleting service:', err);
        alert('Error deleting service. Please try again.');
    });
}

// Function to show manage service modal
function showManageServiceModal(serviceName, service) {
    const modal = document.getElementById('manageServiceModal');
    const form = document.getElementById('manageServiceForm');
    
    // Populate form fields
    document.getElementById('manageName').value = serviceName;
    document.getElementById('manageUrl').value = service.url || '';
    document.getElementById('manageDescription').value = service.description || '';
    document.getElementById('managePrice').value = service.price || 0;
    document.getElementById('manageStatus').value = service.status || 'active';
    
    // Handle image display with proper fallbacks
    const currentLogoElement = document.getElementById('currentLogo');
    if (currentLogoElement) {
        // Use the same image path logic as in createServiceCard
        let logoPath = '';
        
        if (service.image && typeof service.image === 'string' && service.image.trim() !== '') {
            // If it's a full URL, use it directly
            if (service.image.startsWith('http')) {
                logoPath = service.image;
            } 
            // If it starts with /assets, treat as server path
            else if (service.image.startsWith('/assets') || service.image.startsWith('assets')) {
                // Fix path by ensuring it starts with the API base URL if not http
                const cleanPath = service.image.startsWith('/') ? 
                    service.image.substring(1) : service.image;
                logoPath = getApiBaseUrl() + '/' + cleanPath;
            } 
            // For filenames with timestamp format (like in the uploaded images)
            else if (/^\d+-\d+\.(png|jpg|jpeg|gif)$/i.test(service.image)) {
                // This is likely an uploaded image, construct the full path
                logoPath = getApiBaseUrl() + '/assets/6 Services logos/' + service.image;
            } 
            // Otherwise use as is, but add API base URL
            else {
                logoPath = !/^(https?:\/\/|data:)/.test(service.image) ? 
                    getApiBaseUrl() + '/assets/6 Services logos/' + service.image : 
                    service.image;
            }
        } else if (service.logo && typeof service.logo === 'string' && service.logo.trim() !== '') {
            // Apply the same logic for logos
            if (service.logo.startsWith('http')) {
                logoPath = service.logo;
            } else {
                logoPath = getApiBaseUrl() + '/assets/6 Services logos/' + 
                    (service.logo.startsWith('/') ? service.logo.substring(1) : service.logo);
            }
        } else {
            logoPath = getApiBaseUrl() + '/assets/6 Services logos/' + serviceName.toLowerCase() + '.png';
        }
        
        currentLogoElement.src = logoPath;
        currentLogoElement.onerror = function() {
            this.onerror = null;
            this.src = getApiBaseUrl() + '/assets/6 Services logos/default.png';
            console.log(`Fallback to default image for ${serviceName} in modal`);
        };
    }
    
    // Reset the image preview
    const imagePreviewElement = document.getElementById('manageImagePreview');
    if (imagePreviewElement) {
        imagePreviewElement.innerHTML = '';
    }
    
    // Show modal
    modal.style.display = 'block';
    
    // Handle close button
    document.querySelector('.close-manage-modal').onclick = function() {
        modal.style.display = 'none';
    };
    
    // Handle click outside
    window.onclick = function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    // Handle logo preview
    document.getElementById('manageServiceLogo').onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('manageImagePreview').innerHTML = `
                    <img src="${e.target.result}" alt="Preview" style="max-width: 64px; border-radius: 8px;">
                `;
            };
            reader.readAsDataURL(file);
        }
    };
    
    // Handle form submission
    form.onsubmit = async function(e) {
        e.preventDefault();
        
        // Get submit button and show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        try {
            // Get all form values
            const formData = new FormData();
            const newName = document.getElementById('manageName').value.trim();
            const url = document.getElementById('manageUrl').value.trim();
            const description = document.getElementById('manageDescription').value.trim();
            const price = document.getElementById('managePrice').value;
            const status = document.getElementById('manageStatus').value;
            const logoFile = document.getElementById('manageServiceLogo').files[0];
            
            // Validate required fields
            if (!newName || !url) {
                throw new Error('Name and URL are required');
            }
            
            // Append all form data
            formData.append('name', newName);
            formData.append('url', url);
            formData.append('description', description);
            formData.append('price', price);
            formData.append('status', status);
            
            // Add image if selected
            if (logoFile) {
                formData.append('image', logoFile);
            }
            
            // Log what we're sending
            console.log(`Updating service ${serviceName} with new name: ${newName}`);
            if (logoFile) {
                console.log(`Updating image with: ${logoFile.name}`);
            }
            
            // Send update request
            const response = await fetch(`${getApiBaseUrl()}/api/services/${serviceName}`, {
                method: 'PUT',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update service');
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Close modal and reset form
                modal.style.display = 'none';
                form.reset();
                document.getElementById('manageImagePreview').innerHTML = '';
                
                // Refresh services list
                await refreshServicesList();
                
                // Show success message
                alert('Service updated successfully!');
            } else {
                throw new Error(data.error || 'Failed to update service');
            }
        } catch (error) {
            console.error('Error:', error);
            alert(error.message);
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = originalBtnText;
        }
    };
}

// Initialize services page
document.addEventListener('DOMContentLoaded', function() {
    const servicesPage = document.getElementById('services-page');
    if (servicesPage) {
        refreshServicesList();
        // Update services list every 30 seconds
        setInterval(refreshServicesList, 30000);
    }
});

// Initialize dashboard stats
document.addEventListener('DOMContentLoaded', function() {
    const dashboardPage = document.getElementById('dashboard-page');
    if (dashboardPage) {
        updateDashboardServiceStats();
        // Update dashboard stats every 30 seconds
        setInterval(updateDashboardServiceStats, 30000);
    }
});

function makeRequest(url, options = {}) {
    const sessionId = localStorage.getItem('session_id');
    
    // Ensure URL is properly formatted
    if (!url.startsWith('http')) {
        url = getApiBaseUrl() + (url.startsWith('/') ? url : '/' + url);
    }

    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    // Add Authorization header only if sessionId exists
    if (sessionId) {
        defaultOptions.headers['Authorization'] = `Bearer ${sessionId}`;
    }

    // Merge options properly
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };

    // Log request for debugging
    console.debug('Request:', {
        url,
        method: mergedOptions.method || 'GET',
        headers: mergedOptions.headers
    });

    return fetch(url, mergedOptions)
        .then(async response => {
            const contentType = response.headers.get('content-type');
            
            if (!response.ok) {
                // Try to get error details from response
                let errorDetails = '';
                try {
                    if (contentType && contentType.includes('application/json')) {
                        const errorJson = await response.json();
                        errorDetails = JSON.stringify(errorJson);
                    } else {
                        errorDetails = await response.text();
                    }
                } catch (e) {
                    errorDetails = response.statusText;
                }
                
                throw new Error(`Request failed (${response.status}): ${errorDetails}`);
            }

            // Handle empty responses
            if (response.status === 204) {
                return null;
            }

            // Parse response based on content type
            if (contentType && contentType.includes('application/json')) {
                return response.json();
            }
            
            return response.text();
        })
        .catch(error => {
            console.error('Request failed:', error);
            throw error;
        });
}