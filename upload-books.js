// Upload all eBooks to Firebase Storage
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase
const serviceAccount = {
  projectId: 'marriage-education',
  // Will use Application Default Credentials
};

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'marriage-education.firebasestorage.app'
});

const bucket = admin.storage().bucket();
const ebooksDir = path.join(__dirname, 'ebooks');

async function uploadBooks() {
  try {
    const files = fs.readdirSync(ebooksDir).filter(f => f.endsWith('.pdf'));
    
    console.log(`📚 Found ${files.length} eBooks to upload...\n`);
    
    for (const file of files) {
      const localPath = path.join(ebooksDir, file);
      const remotePath = `ebooks/${file}`;
      
      console.log(`⬆️  Uploading: ${file}...`);
      
      await bucket.upload(localPath, {
        destination: remotePath,
        metadata: {
          contentType: 'application/pdf',
          cacheControl: 'public, max-age=31536000'
        }
      });
      
      console.log(`✅ Uploaded: ${file}`);
    }
    
    console.log(`\n🎉 All ${files.length} eBooks uploaded successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    process.exit(1);
  }
}

uploadBooks();
