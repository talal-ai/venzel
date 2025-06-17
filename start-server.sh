#!/bin/bash

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Check if the app is already running
if pm2 list | grep -q "venzell-backend"; then
    echo "Restarting venzell-backend..."
    pm2 restart venzell-backend
else
    echo "Starting venzell-backend..."
    pm2 start pm2-config.json
fi

# Save PM2 process list
pm2 save

# Display status
pm2 status 