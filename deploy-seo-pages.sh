#!/bin/bash

echo "🚀 Deploying new SEO pages to live server..."

# FTP Configuration
FTP_SERVER="ftp.btheducationgroup.com"
FTP_USERNAME="btheducationgrouporg"
FTP_PASSWORD='BTH$$$78@1111!!!%%%FF357q'
FTP_REMOTE_DIR="/marriageducation.com"

# Upload the new SEO pages
lftp -f "
open ftp://$FTP_USERNAME:$FTP_PASSWORD@$FTP_SERVER
lcd /Users/achugustave/Documents/Marriageducation/public
cd $FTP_REMOTE_DIR
put sitemap.xml
put index.html
put resources.html
put what-is-marriage-education.html
put why-marriages-fail.html
put marriage-education-program.html
put how-to-build-a-successful-marriage.html
put how-to-prepare-for-marriage.html
put signs-you-are-not-ready-for-marriage.html
put marriage-education-for-women.html
put marriage-education-for-men.html
put marriage-education-cameroon.html
put marriage-education-africa.html
bye
"

echo "✅ SEO pages deployed successfully!"
echo "🔍 Test: https://www.marriageducation.com/what-is-marriage-education.html"
