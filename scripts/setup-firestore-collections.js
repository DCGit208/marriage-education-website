#!/usr/bin/env node

/**
 * Setup Script: Create New Firestore Collections
 * 
 * This script adds 3 new collections to your EXISTING Firebase project:
 * - regional_directors
 * - pending_payments  
 * - referral_codes
 * 
 * Your existing collections (courses, enrollments, ambassadors, etc.) 
 * are completely untouched.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'marriage-education'
});

const db = admin.firestore();

console.log('\n🚀 Setting up new Firestore collections...\n');

async function setupCollections() {
  try {
    // 1. Create regional_directors collection with Ayinwi's data
    console.log('📁 Creating regional_directors collection...');
    
    const regionalDirectorsPath = path.join(__dirname, '../regional_directors.json');
    const rdData = JSON.parse(fs.readFileSync(regionalDirectorsPath, 'utf8'));
    
    for (const [code, director] of Object.entries(rdData.directors)) {
      await db.collection('regional_directors').doc(code).set({
        code: director.code,
        name: director.name,
        email: director.email,
        phone: director.phone,
        city: director.city || '',
        region: director.region || '',
        status: director.status || 'active',
        tier: director.tier || 'Bronze RD',
        downline: director.downline || [],
        downline_count: director.downline_count || 0,
        team_books_sold: director.team_books_sold || 0,
        override_commission: director.override_commission || 0,
        milestones_reached: director.milestones_reached || [],
        override_history: director.override_history || [],
        created_at: admin.firestore.Timestamp.fromDate(new Date()),
        activated_at: director.activation_date ? 
          admin.firestore.Timestamp.fromDate(new Date(director.activation_date)) : 
          admin.firestore.Timestamp.fromDate(new Date())
      });
      console.log(`   ✅ Migrated: ${director.name} (${code})`);
    }
    
    // 2. Create pending_payments collection (empty, will be populated by submissions)
    console.log('\n📁 Creating pending_payments collection...');
    await db.collection('pending_payments').doc('_placeholder').set({
      _note: 'This is a placeholder document. Real payments will be added by the system.',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('   ✅ Collection created (empty, ready for payments)');
    
    // 3. Create referral_codes collection (empty, will be populated by user registrations)
    console.log('\n📁 Creating referral_codes collection...');
    await db.collection('referral_codes').doc('_placeholder').set({
      _note: 'This is a placeholder document. Real referral codes will be added when users register.',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('   ✅ Collection created (empty, ready for referrals)');
    
    console.log('\n🎉 SUCCESS! New collections created.\n');
    console.log('📊 Summary:');
    console.log('   ✅ regional_directors: ' + Object.keys(rdData.directors).length + ' RD(s) imported');
    console.log('   ✅ pending_payments: Ready for submissions');
    console.log('   ✅ referral_codes: Ready for registrations\n');
    console.log('⚠️  Your existing collections (courses, enrollments, ambassadors, etc.) are untouched.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error setting up collections:', error);
    process.exit(1);
  }
}

setupCollections();
