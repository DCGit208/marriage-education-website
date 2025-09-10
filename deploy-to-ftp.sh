#!/bin/bash

# Auto-deploy script
# This script runs after every git push and uploads files to FTP

echo "🚀 Starting auto-deployment to FTP..."

# FTP Configuration (UPDATE THESE WITH YOUR DETAILS)
FTP_SERVER="your-ftp-server.com"
FTP_USERNAME="your-ftp-username"
FTP_PASSWORD="your-ftp-password"
FTP_REMOTE_DIR="/public_html/"

# Use lftp for secure FTP upload
lftp -f "
open ftp://$FTP_USERNAME:$FTP_PASSWORD@$FTP_SERVER
lcd /Users/achugustave/Documents/Marriageducation
cd $FTP_REMOTE_DIR
mirror --reverse --delete --verbose --exclude-glob .git/ --exclude-glob .DS_Store --exclude-glob *.md --exclude-glob *test*.html
bye
"

echo "✅ Deployment completed!"
