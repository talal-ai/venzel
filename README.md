# Venzell Backend

This is the backend server for the Venzell Admin and User Dashboard application.

## Requirements

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/venzell.git
cd venzell
```

2. Install dependencies:
```bash
npm install
```

## Running the Server

### Development Mode

To run the server in development mode with auto-restart on file changes:

```bash
npm run server:dev
```

### Production Mode

To run the server in production mode:

```bash
npm run server
```

## Server Configuration

The server runs on port 8095 by default. You can change this by setting the `PORT` environment variable.

## Directory Structure

- `server.js` - Main server file
- `sessions/data/` - Contains user data, sessions, and service information
- `assets/` - Static assets served by the server

## API Endpoints

The server provides various API endpoints for:

- User authentication
- Session management
- Service management
- Admin dashboard
- Reseller operations

## Deployment

### Using PM2 (Recommended for Production)

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the server with PM2:
```bash
pm2 start server.js --name "venzell-backend"
```

3. To ensure the server starts on system reboot:
```bash
pm2 startup
pm2 save
```

### Using GitHub Actions

This repository is configured to deploy automatically using GitHub Actions. When you push to the main branch, the server will be deployed to your hosting environment.

## License

ISC 