const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize with functions config (already authenticated)
admin.initializeApp({
  storageBucket: 'marriage-education.appspot.com'
});

const bucket = admin.storage().bucket();
const ebooksDir = path.join(__dirname, '..', 'ebooks');

async function uploadEbooks() {
  try {
    console.log('Starting ebook upload to Firebase Storage...\n');
    console.log(`Reading from: ${ebooksDir}\n`);
    
    const files = fs.readdirSync(ebooksDir).filter(f => f.endsWith('.pdf'));
    
    console.log(`Found ${files.length} PDF files to upload\n`);
    
    for (const file of files) {
      const filePath = path.join(ebooksDir, file);
      const destination = `ebooks/${file}`;
      const fileStats = fs.statSync(filePath);
      const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
      
      console.log(`Uploading: ${file} (${fileSizeMB} MB)...`);
      
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
    
    console.log('\n✅ Upload and verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Upload error:', error);
    process.exit(1);
  }
}

uploadEbooks();
