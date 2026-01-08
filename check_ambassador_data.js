const admin = require('firebase-admin');
const serviceAccount = require('./functions/service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAmbassadors() {
  console.log('Scanning all ambassadors for data integrity...\n');
  
  const snapshot = await db.collection('ambassadors').get();
  
  let missingEmail = [];
  let missingPhone = [];
  let missingRdCode = [];
  let statusIssues = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    
    if (!data.email) missingEmail.push(id);
    if (!data.phone) missingPhone.push(id);
    if (!data.rdCode) missingRdCode.push(id);
    if (data.status !== 'approved' && data.status !== 'active') {
      statusIssues.push({ id, status: data.status });
    }
  });
  
  console.log(`Total ambassadors: ${snapshot.size}`);
  console.log(`\nMissing email: ${missingEmail.length}`);
  if (missingEmail.length > 0) console.log(missingEmail.join(', '));
  
  console.log(`\nMissing phone: ${missingPhone.length}`);
  if (missingPhone.length > 0) console.log(missingPhone.join(', '));
  
  console.log(`\nMissing rdCode: ${missingRdCode.length}`);
  if (missingRdCode.length > 0) console.log(missingRdCode.join(', '));
  
  console.log(`\nStatus issues: ${statusIssues.length}`);
  if (statusIssues.length > 0) {
    statusIssues.forEach(item => console.log(`${item.id}: ${item.status}`));
  }
  
  process.exit(0);
}

checkAmbassadors().catch(console.error);
