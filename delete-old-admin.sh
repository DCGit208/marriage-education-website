#!/bin/bash
# Delete old admin-payments.html from live server

echo "🗑️  Deleting old admin-payments.html from live server..."

# Read FTP credentials
FTP_HOST=$(grep "machine" .netrc_ftp | awk '{print $2}')
FTP_USER=$(grep "login" .netrc_ftp | awk '{print $2}')
FTP_PASS=$(grep "password" .netrc_ftp | awk '{print $2}')

# Delete the old file
curl ftp://$FTP_HOST/public_html/public/admin-payments.html \
     --user $FTP_USER:$FTP_PASS \
     --quote "DELE public_html/public/admin-payments.html" \
     2>&1

# Alternative method if above fails
echo ""
echo "📋 Trying alternative deletion method..."
curl ftp://$FTP_HOST/public_html/public/ \
     --user $FTP_USER:$FTP_PASS \
     -Q "-DELE admin-payments.html"

echo ""
echo "✅ Deletion attempted!"
echo ""
echo "🔍 Verify at: https://marriageducation.com/public/admin-payments.html"
echo "   (Should show 404 Not Found)"
