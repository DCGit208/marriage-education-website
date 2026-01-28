// Quick test script - Run this in browser console on Firebase Console

// Step 1: Create a test senior ambassador
// Go to: https://console.firebase.google.com/project/marriage-education/firestore/data/ambassadors

// Find an existing ambassador (e.g., AMB-ACHU-5393) and update:
{
  ambassador_type: "senior"
}

// Step 2: Generate recruitment link
// https://marriageducation.com/ambassador-register.html?senior=AMB-ACHU-5393

// Step 3: Open that link and register a test ambassador

// Step 4: After payment approval, check Firestore for new ambassador:
// Should have: senior_code: "AMB-ACHU-5393"

// Step 5: Login as AMB-ACHU-5393 and check senior dashboard
// Should see: New team member in list

// Step 6: Test automatic promotion
// In Firestore, update a regular ambassador:
{
  units_deployed: 500
}
// Wait 10 seconds, check if ambassador_type changes to "senior"

console.log("✅ Test steps ready!");
console.log("Start at: https://console.firebase.google.com/project/marriage-education/firestore");
