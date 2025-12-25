const functions = require('firebase-functions');
const admin = require('firebase-admin');

// List all storage buckets and files
exports.listStorageInfo = functions.https.onRequest(async (req, res) => {
  try {
    const storage = admin.storage();
    
    // Get the default bucket
    const defaultBucket = storage.bucket();
    console.log('Default bucket:', defaultBucket.name);
    
    // Try to list files in the ebooks folder
    const [files] = await defaultBucket.getFiles({ prefix: 'ebooks/' });
    
    const fileList = files.map(file => ({
      name: file.name,
      bucket: file.bucket.name,
      size: file.metadata.size
    }));
    
    res.json({
      defaultBucket: defaultBucket.name,
      filesCount: files.length,
      files: fileList
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});
