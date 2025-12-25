#!/bin/bash
# Quick FTP deployment for admin-dashboard.html rename

echo "🚀 Deploying admin-dashboard.html to iPage..."

# Read FTP credentials from .netrc_ftp
FTP_HOST=$(grep "machine" .netrc_ftp | awk '{print $2}')
FTP_USER=$(grep "login" .netrc_ftp | awk '{print $2}')
FTP_PASS=$(grep "password" .netrc_ftp | awk '{print $2}')

# Upload using curl
echo "📤 Uploading admin-dashboard.html..."
curl -T public/admin-dashboard.html ftp://$FTP_HOST/public_html/public/ --user $FTP_USER:$FTP_PASS

echo "🗑️  Removing old admin-payments.html..."
curl -Q "DELE public_html/public/admin-payments.html" ftp://$FTP_HOST --user $FTP_USER:$FTP_PASS

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Live URL: https://marriageducation.com/public/admin-dashboard.html"
echo "🔗 Test it now!"
