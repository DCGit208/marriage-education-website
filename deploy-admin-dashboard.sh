#!/bin/bash
# Deploy admin-dashboard.html to iPage (marriageducation.com)

set -euo pipefail

if [[ ! -f ".netrc_ftp" ]]; then
  echo "❌ Missing .netrc_ftp credentials file."
  echo "   Deploy to Firebase instead: firebase deploy --only hosting:marriageducation,hosting:main"
  echo "   Then use: https://marriageducation.web.app/admin-dashboard.html"
  exit 1
fi

FTP_HOST=$(grep "machine" .netrc_ftp | awk '{print $2}')
FTP_USER=$(grep "login" .netrc_ftp | awk '{print $2}')
FTP_PASS=$(grep "password" .netrc_ftp | awk '{print $2}')

echo "🚀 Deploying admin-dashboard.html to iPage ($FTP_HOST)..."

echo "📤 Uploading to /public_html/admin-dashboard.html ..."
curl -T public/admin-dashboard.html "ftp://$FTP_HOST/public_html/admin-dashboard.html" --user "$FTP_USER:$FTP_PASS"

echo "📤 Uploading to /public_html/public/admin-dashboard.html ..."
curl -T public/admin-dashboard.html "ftp://$FTP_HOST/public_html/public/admin-dashboard.html" --user "$FTP_USER:$FTP_PASS"

echo ""
echo "✅ Deployment complete!"
echo "🌐 https://marriageducation.com/admin-dashboard.html"
echo "🌐 https://marriageducation.com/public/admin-dashboard.html"
