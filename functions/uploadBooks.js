const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// This function will upload books from the ebooks directory to Firebase Storage
exports.uploadBooksToStorage = functions.https.onRequest(async (req, res) => {
  try {
    const bucket = admin.storage().bucket();
    const ebooksDir = path.join(__dirname, '..', 'ebooks');
    
    // Check if we can access the directory
    if (!fs.existsSync(ebooksDir)) {
      return res.status(400).json({ 
        error: 'Ebooks directory not found',
        path: ebooksDir 
      });
    }
    
    const files = fs.readdirSync(ebooksDir).filter(f => f.endsWith('.pdf'));
    const results = [];
    
    console.log(`Found ${files.length} PDF files to upload`);
    
    for (const filename of files) {
      const filePath = path.join(ebooksDir, filename);
      const fileSize = fs.statSync(filePath).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      
      console.log(`Uploading ${filename} (${fileSizeMB} MB)...`);
      
      try {
        await bucket.upload(filePath, {
          destination: `ebooks/${filename}`,
          metadata: {
            contentType: 'application/pdf',
            cacheControl: 'public, max-age=31536000',
          }
        });
        
        results.push({ 
          filename, 
          status: 'success',
          size: fileSizeMB + ' MB'
        });
        
        console.log(`✅ Uploaded: ${filename}`);
      } catch (uploadError) {
        results.push({ 
          filename, 
          status: 'error', 
          error: uploadError.message 
        });
        console.error(`❌ Failed: ${filename}`, uploadError);
      }
    }
    
    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    
    res.json({
      message: `Upload complete: ${succeeded} succeeded, ${failed} failed`,
      total: files.length,
      succeeded,
      failed,
      results
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});
