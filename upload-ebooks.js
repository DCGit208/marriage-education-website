const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin with Application Default Credentials
admin.initializeApp({
  storageBucket: 'marriage-education.appspot.com'
});

const bucket = admin.storage().bucket();
const ebooksDir = './ebooks';

async function uploadEbooks() {
  try {
    console.log('Starting ebook upload to Firebase Storage...\n');
    
    const files = fs.readdirSync(ebooksDir).filter(f => f.endsWith('.pdf'));
    
    console.log(`Found ${files.length} PDF files to upload\n`);
    
    for (const file of files) {
      const filePath = path.join(ebooksDir, file);
      const destination = `ebooks/${file}`;
      
      console.log(`Uploading: ${file}...`);
      
      await bucket.upload(filePath, {
        destination: destination,
        metadata: {
          contentType: 'application/pdf',
          cacheControl: 'public, max-age=31536000',
        }
      });
      
      console.log(`✅ Uploaded: ${file}`);
    }
    
    console.log(`\n✅ All ${files.length} ebooks uploaded successfully!`);
    
    // Verify uploads
    console.log('\n📋 Verifying uploads...');
    const [uploadedFiles] = await bucket.getFiles({ prefix: 'ebooks/' });
    console.log(`\nFiles in Firebase Storage (ebooks/):`);
    uploadedFiles.forEach(file => {
      console.log(`  - ${file.name}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Upload error:', error);
    process.exit(1);
  }
}

uploadEbooks();
