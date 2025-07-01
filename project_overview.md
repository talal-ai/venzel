# Venzell Application - Complete Project Overview

## 📋 Project Summary

**Venzell** is a comprehensive Electron-based desktop application designed for managing group-buy services (like ChatGPT, Envato, Netflix) with a sophisticated multi-role dashboard system. The application supports three distinct user roles: **Users**, **Resellers**, and **Admins**, each with their own specialized interface and functionality.

## 🏗️ Architecture & Technology Stack

### Frontend
- **Electron.js** - Desktop application framework
- **HTML5/CSS3/JavaScript** - Core web technologies
- **Glassmorphism Design** - Modern UI with dark/light theme support
- **Responsive Design** - CSS media queries and flexbox/grid layouts

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web application framework
- **WebSocket** - Real-time communication (port 8097)
- **Session Management** - File-based session storage
- **Multer** - File upload handling

### Data Storage
- **JSON Files** - File-based data persistence
- **Session Files** - User session management
- **File System** - Local and server-based storage

## 🎯 Core Objectives

1. **Multi-Role Dashboard System** - Distinct interfaces for Users, Resellers, and Admins
2. **Service Management** - Group-buy service sales, assignment, and tracking
3. **User Experience** - Professional, secure, and intuitive interface
4. **Scalability** - Support for growing user base and services
5. **Security** - Role-based authentication and authorization

## 👥 User Roles & Functionality

### 👤 User Dashboard
**Purpose**: Allow end users to view and manage their subscribed services

**Key Features**:
- View active services with details (name, price, expiration)
- Service renewal and upgrade options
- Account settings (password change, profile updates)
- Notification area for service updates
- Clean, minimal interface with service cards

**Files**: `user.html`, `user.js`, `user.css`

### 🏪 Reseller Dashboard
**Purpose**: Enable resellers to manage their customers and assign services

**Key Features**:
- **User Management**: Add, edit, delete users (filtered by reseller ID)
- **Service Assignment**: Assign services to their users with confirmation
- **Sales Analytics**: Metrics for users, active services, and revenue
- **Professional Notifications**: Auto-close notifications system
- **Settings Management**: Profile and API key management

**Files**: `reseller.html`, `reseller.js`, `reseller.css`

### 👑 Admin Dashboard
**Purpose**: Full system control and management

**Key Features**:
- **Global User Management**: Manage all users across all resellers
- **Reseller Management**: Monitor, approve, and suspend resellers
- **Service Management**: Add, edit, remove services globally
- **Comprehensive Analytics**: Revenue reports, user growth, service popularity
- **System Settings**: API configuration, database management, security

**Files**: `admin.html`, `admin.js`, `admin.css`

## 🖥️ Application Structure

### Main Application Files
- **`main.js`** (2,030 lines) - Electron main process, window management, session handling
- **`server.js`** (5,545 lines) - Express server, API endpoints, WebSocket handling
- **`preload.js`** (399 lines) - Electron preload script for secure IPC
- **`config.js`** - Application configuration and environment settings

### Key Frontend Components
- **`login-popup.html`** - Authentication interface
- **`services.html`** - Service management interface
- **`test-settings.html`** - Testing and configuration interface

### Data Management
- **`sessions/data/`** - User data, sessions, service information
- **`sessions/logs/`** - Session logs and temporary files
- **`users.json`** - User account information
- **`services.json`** - Available services data
- **`session_history.json`** - Historical session data

## 🌐 API Architecture

### Server Configuration
- **Primary Port**: 8095 (HTTP server)
- **WebSocket Port**: 8097 (Real-time communication)
- **Production URL**: `http://venzell.skplay.net`
- **Session Timeout**: 15 minutes for large operations
- **File Upload Limit**: 1GB for updates, 50MB for regular files

### Key API Endpoints

#### Authentication
- `POST /auth` - User login
- `POST /validate-session` - Session validation
- `POST /logout` - User logout

#### User Management
- `GET /reseller/users` - Get reseller's users (filtered by reseller ID)
- `POST /reseller/add-user-service` - Assign service to user
- `GET /admin/users` - Get all users (admin only)
- `GET /admin/resellers` - Get all resellers (admin only)

#### Services
- `GET /reseller/services` - Get available services for reseller
- `GET /admin/services` - Global service management (admin only)
- `GET /reseller/services-debug` - Debug endpoint for testing

#### Session Management
- `POST /api/sessions/upload` - Upload session data
- `GET /api/sessions/download/:filename` - Download session data

#### Analytics
- `GET /reseller/stats` - Reseller analytics
- `GET /admin/reports` - Admin reports and metrics

## 🔧 Development & Deployment

### Installation
```bash
npm install
```

### Development Mode
```bash
npm run dev          # Electron app development
npm run server:dev   # Server with auto-restart
```

### Production Mode
```bash
npm run start        # Start Electron app
npm run server       # Start production server
npm run build        # Build distributable
```

### Deployment Options
- **PM2** - Process manager for production (`pm2-config.json`)
- **GitHub Actions** - Automated deployment pipeline
- **Electron Builder** - Multi-platform app distribution

## 📁 Key Directory Structure

```
venzell/
├── app/                    # Additional app components
├── assets/                 # Static assets and service logos
│   └── 6 Services logos/   # Service logo images
├── sessions/               # Session and data storage
│   ├── data/              # User and service data
│   └── logs/              # Session logs
├── updates/               # Application update files
├── .github/               # GitHub workflows
├── main.js                # Electron main process
├── server.js              # Express backend server
├── package.json           # Dependencies and scripts
├── config.js              # Application configuration
└── *.html, *.js, *.css   # Frontend components
```

## 🔒 Security Features

### Authentication & Authorization
- **Session-based Authentication** - Secure session management
- **Role-based Access Control** - User, Reseller, Admin permissions
- **Session Validation** - Prevent multiple concurrent logins
- **Secure Cookie Handling** - HTTPOnly, SameSite configuration

### Data Protection
- **Input Validation** - Client and server-side validation
- **File Upload Security** - Size limits and type restrictions
- **Error Handling** - User-friendly error messages with detailed logging
- **Environment Configuration** - Secure environment variable handling

## 🚀 Advanced Features

### Real-time Communication
- **WebSocket Integration** - Live updates and notifications
- **Session Synchronization** - Cross-device session management
- **Update Notifications** - Automatic update detection

### Session Management
- **Cross-platform Sessions** - Save and restore browser sessions
- **Cookie Management** - Domain-specific cookie handling
- **localStorage/sessionStorage** - Client-side data persistence

### Update System
- **Automatic Updates** - Built-in update checking and installation
- **Version Management** - Semantic versioning with update notifications
- **Download Progress** - Real-time update download tracking

## 📊 Analytics & Monitoring

### User Analytics
- **User Growth Tracking** - Registration and activity metrics
- **Service Usage Statistics** - Popular services and usage patterns
- **Revenue Analytics** - Sales tracking and financial reporting

### System Monitoring
- **Session History** - Detailed session logs and history
- **Error Logging** - Comprehensive error tracking and debugging
- **Performance Metrics** - Server response times and resource usage

## 🎨 UI/UX Design Standards

### Visual Design
- **Typography**: Poppins font family
- **Color Scheme**: CSS custom properties for dark/light themes
- **Glassmorphism Effects**: Modern translucent design elements
- **Responsive Layout**: Mobile-first responsive design

### User Experience
- **Hierarchical Navigation**: Clear sidebar navigation with hover effects
- **Interactive Elements**: Smooth transitions and modal dialogs
- **Data Visualization**: Chart.js integration for analytics
- **Professional Notifications**: Consistent notification system

## 🔮 Future Considerations

### Planned Enhancements
- **Multi-language Support** - Internationalization for global users
- **Mobile Application** - Companion mobile app development
- **Payment Integration** - Automated billing and payment processing
- **Advanced Analytics** - Machine learning insights and predictions

### Technical Improvements
- **Database Migration** - Move from JSON files to proper database
- **Microservices Architecture** - Split monolithic server into services
- **Cloud Integration** - Cloudflare R2 storage integration
- **Performance Optimization** - Caching and optimization strategies

## 📄 Configuration Files

### Package.json Highlights
- **Dependencies**: 30+ production dependencies including Electron, Express, React
- **Build Configuration**: Multi-platform builds (Windows, macOS, Linux)
- **Scripts**: Development, production, and build automation

### Key Dependencies
- **Electron 26.3.0** - Desktop app framework
- **Express 4.21.2** - Web server framework
- **React 18.2.0** - UI library components
- **WebSocket 8.18.0** - Real-time communication
- **Sharp 0.33.5** - Image processing
- **Multer 1.4.5** - File upload handling

This application represents a sophisticated, production-ready desktop solution for managing group-buy services with enterprise-level features including role-based access control, real-time communication, automatic updates, and comprehensive analytics.