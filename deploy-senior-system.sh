#!/bin/bash

# Senior Ambassador System - Deployment Script
# Run this to deploy all components

echo "🚀 SENIOR AMBASSADOR SYSTEM DEPLOYMENT"
echo "======================================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Deploy Firebase Functions
echo -e "${BLUE}Step 1: Deploying Cloud Functions...${NC}"
echo "Functions to deploy:"
echo "  - checkAmbassadorPromotion (callable)"
echo "  - onAmbassadorUpdate (Firestore trigger)"
echo "  - onNewAmbassadorCreated (Firestore trigger)"
echo ""

read -p "Deploy Firebase Functions now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Deploying functions..."
    firebase deploy --only functions:checkAmbassadorPromotion,functions:onAmbassadorUpdate,functions:onNewAmbassadorCreated
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Cloud Functions deployed successfully!${NC}"
    else
        echo -e "${RED}❌ Function deployment failed. Check errors above.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Skipping function deployment${NC}"
fi

echo ""

# Step 2: List modified files
echo -e "${BLUE}Step 2: Files to upload to iPage${NC}"
echo "=================================="
echo ""
echo "Modified files:"
echo "  1. ambassador-register.html (hierarchy capture)"
echo "  2. ambassador/senior-dashboard.html (team management UI)"
echo "  3. index.html (navigation links added)"
echo ""
echo "New files:"
echo "  4. functions/promotion-engine.js (promotion logic)"
echo "  5. SENIOR_AMBASSADOR_SYSTEM_COMPLETE.md (documentation)"
echo ""

# Step 3: Test Checklist
echo -e "${BLUE}Step 3: Post-Deployment Testing${NC}"
echo "================================"
echo ""
echo "After uploading files to iPage, test:"
echo ""
echo "✅ Recruitment Flow:"
echo "   1. Create test senior in Firestore (ambassador_type: 'senior')"
echo "   2. Generate link: ?senior=AMB-XXX-001"
echo "   3. Register new ambassador"
echo "   4. Verify senior_code in Firestore"
echo ""
echo "✅ Commission Flow:"
echo "   1. Team member makes sale"
echo "   2. Check 10% to ambassador"
echo "   3. Check 5% to senior (override)"
echo "   4. Verify in senior dashboard"
echo ""
echo "✅ Promotion:"
echo "   1. Update ambassador to 500 units OR 10 recruits"
echo "   2. Check ambassador_type changes to 'senior'"
echo "   3. Verify Telegram notification sent"
echo "   4. Check notifications collection"
echo ""

# Step 4: Firebase Console Links
echo -e "${BLUE}Step 4: Useful Links${NC}"
echo "==================="
echo ""
echo "Firebase Console: https://console.firebase.google.com/project/marriage-education"
echo "Firestore Database: https://console.firebase.google.com/project/marriage-education/firestore"
echo "Functions Logs: https://console.firebase.google.com/project/marriage-education/functions"
echo "iPage cPanel: https://www.ipage.com/controlpanel"
echo ""

# Step 5: Quick Commands
echo -e "${BLUE}Step 5: Quick Commands${NC}"
echo "======================"
echo ""
echo "Check function logs:"
echo "  firebase functions:log --only checkAmbassadorPromotion"
echo ""
echo "Test promotion manually:"
echo "  firebase functions:shell"
echo "  > checkAmbassadorPromotion({ambassador_code: 'AMB-TEST-001'})"
echo ""
echo "Deploy all functions:"
echo "  firebase deploy --only functions"
echo ""

# Summary
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT GUIDE COMPLETE${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Upload modified HTML files to iPage"
echo "2. Run end-to-end tests"
echo "3. Monitor Firebase Functions logs"
echo "4. Announce to ambassadors when verified"
echo ""
echo "Documentation: SENIOR_AMBASSADOR_SYSTEM_COMPLETE.md"
echo ""
