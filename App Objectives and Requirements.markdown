# App Objectives and Requirements

## Project Overview
This Electron JS application provides a dashboard system for managing group-buy services (e.g., ChatGPT, Envato, Netflix) with distinct roles: users, resellers, and admins. The app aims to offer a professional, secure, and efficient platform for service sales, user management, and analytics, tailored to each role’s needs.

## Objectives
- **User Experience**: Deliver an intuitive, responsive, and visually appealing interface with glassmorphism styling and dark/light themes.
- **Role-Based Access**: Ensure users, resellers, and admins have access only to their respective functionalities and data.
- **Service Management**: Enable seamless buying, assigning, and tracking of group-buy services.
- **Scalability**: Support growth in users, resellers, and services with robust backend and frontend performance.
- **Security**: Implement authentication and authorization to protect user and service data.

## General Requirements
- **Technology Stack**: Electron JS for the desktop app, HTML5/CSS3/JavaScript for the frontend, Node.js for the backend (`server.js`), and a database (e.g., MongoDB or SQLite) for data persistence.
- **Responsive Design**: Ensure compatibility across various screen sizes using CSS media queries and flexbox/grid layouts.
- **Real-Time Updates**: Provide live data refresh for dashboards (e.g., user stats, service assignments) where applicable.
- **Error Handling**: Display user-friendly notifications (`showNotification`) and log errors for debugging.
- **Performance**: Optimize API calls (`makeRequest`) and DOM updates for smooth operation.

## Role-Specific Requirements

### User Dashboard
- **Objective**: Allow users to view and manage their subscribed services.
- **Features**:
  - Display a list of active services with details (name, price, expiration).
  - Option to renew or upgrade services.
  - Account settings (e.g., password change, profile update).
  - Notification area for service updates or renewals.
- **UI/UX**: Clean layout with service cards, centered notifications, and minimal navigation.
- **Backend**: `/user/services` endpoint to fetch and update user-specific service data.

### Reseller Dashboard
- **Objective**: Enable resellers to manage users they’ve added and assign services, with a focus on their own sales and performance.
- **Features**:
  - **User Management**: View, add, edit, and delete only users added by the reseller (filtered by `resellerId`).
  - **Service Assignment**: Assign services to own users with a confirmation popup, updating the “Current Services” section.
  - **Sales Analytics**: Display metrics like total users, active services, and revenue (e.g., via `/reseller/stats` endpoint).
  - **Notifications**: Single, professional notification system (e.g., auto-close after 5 seconds or on “OK” click).
  - **Settings**: Manage reseller profile and API keys (if applicable).
- **UI/UX**: Sidebar navigation (Dashboard, User Management, Services, Settings), glassmorphism cards for services/users, and responsive tables.
- **Backend**: 
  - `/reseller/users` GET route filtered by `resellerId`.
  - `/reseller/add-user-service` POST route with `resellerId` validation.
  - Error handling with 403 for unauthorized actions.

### Admin Dashboard
- **Objective**: Provide full control over all users, resellers, and services for system-wide management.
- **Features**:
  - **User Management**: View, add, edit, and delete all users across resellers.
  - **Reseller Management**: Monitor and manage all resellers (e.g., approve, suspend).
  - **Service Management**: Add, edit, and remove services globally, set pricing, and track usage.
  - **Analytics**: Comprehensive reports (e.g., total revenue, user growth, service popularity) with charts.
  - **System Settings**: Configure API endpoints, database backups, and security settings.
- **UI/UX**: Multi-tab interface (Users, Resellers, Services, Analytics, Settings), detailed tables, and interactive charts.
- **Backend**: 
  - `/admin/users` and `/admin/resellers` GET routes for all data.
  - `/admin/services` for global service management.
  - Role-based authentication to distinguish admin from reseller access.

## Professional Design and Workflow Standards
- **Visual Design**: Use consistent typography (Poppins), color schemes (`--dark-*`, `--light-*`), and glassmorphism effects from `reseller.css`.
- **Navigation**: Hierarchical sidebar with clear labels and hover effects.
- **Data Visualization**: Incorporate charts (e.g., via Chart.js) for analytics in admin and reseller dashboards.
- **Interactivity**: Smooth transitions, modals for actions (e.g., service assignment), and real-time updates where feasible.
- **Security**: Token-based authentication, HTTPS in production, and input validation on both client and server.

## Implementation Notes
- **Current State**: The reseller dashboard (`reseller.js`) supports user/service management and notifications, but needs reseller-specific filtering and professional notification handling.
- **Enhancements**: Add analytics endpoints (`/reseller/stats`, `/admin/reports`) and chart integration in `reseller.html`/`admin.html`.
- **Testing**: Simulate multiple resellers and users, verify role-based access, and test API responses with tools like Postman.

## Future Considerations
- **Multi-Language Support**: Add localization for global resellers.
- **Mobile App**: Explore Electron’s mobile compatibility or a separate mobile version.
- **Payment Integration**: Integrate a payment gateway for service renewals.