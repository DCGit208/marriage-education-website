/**
 * Manual Script: Add Ayinwi's RD Data to Firestore
 * 
 * Run this once to migrate RD-AYIN-5087 from JSON to Firestore
 */

// This is a one-time manual operation to be run in Firebase console or via script
// Copy this code and run it in Firebase console Functions or locally with firebase-admin

const rdData = {
  code: 'RD-AYIN-5087',
  name: 'Ayinwi Promise Imbih',
  email: 'ayinwipromise@gmail.com',
  phone: '237677604100',
  city: 'Buea',
  region: 'South West',
  status: 'active',
  tier: 'Bronze RD',
  downline: [],
  downline_count: 0,
  team_books_sold: 0,
  override_commission: 0,
  milestones_reached: [],
  override_history: [],
  created_at: new Date('2025-12-23T00:00:00Z'),
  activated_at: new Date('2025-12-23T02:50:00Z')
};

// To run in Firebase console:
// 1. Go to https://console.firebase.google.com/project/marriage-education/firestore
// 2. Click "Start collection"
// 3. Collection ID: regional_directors
// 4. Document ID: RD-AYIN-5087
// 5. Add fields manually from rdData above
//
// OR run this in Cloud Functions or locally with firebase-admin
