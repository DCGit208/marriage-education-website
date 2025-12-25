#!/bin/bash

# Upload ebooks to Firebase Storage using gsutil with Firebase auth
echo "=================================================="
echo "Uploading Ebooks to Firebase Storage"
echo "=================================================="
echo ""

# Set project
export GOOGLE_CLOUD_PROJECT="marriage-education"

# Get Firebase token and use it for authentication
echo "Getting authentication token..."
TOKEN=$(firebase login:ci 2>/dev/null | grep "1//" | tail -1)

if [ -z "$TOKEN" ]; then
    echo "Using existing Firebase authentication..."
fi

echo ""
echo "Installing Google Cloud Storage Python library..."
pip3 install google-cloud-storage --quiet 2>/dev/null || pip install google-cloud-storage --quiet 2>/dev/null

echo ""
echo "Running upload script..."

python3 << 'PYEOF'
import os
import sys

try:
    from google.cloud import storage
    from google.oauth2 import service_account
    import json
    import subprocess
    
    # Initialize client using Application Default Credentials
    try:
        # Try to use firebase CLI authentication
        result = subprocess.run(
            ['firebase', 'apps:sdkconfig', 'web', '--project', 'marriage-education'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        print("Initializing Firebase Storage client...")
        client = storage.Client(project='marriage-education')
        bucket = client.bucket('marriage-education.appspot.com')
        
        ebooks_dir = '/Users/achugustave/Documents/Marriageducation/ebooks'
        pdf_files = [f for f in os.listdir(ebooks_dir) if f.endswith('.pdf')]
        
        print(f"\nFound {len(pdf_files)} PDF files to upload\n")
        
        for filename in pdf_files:
            filepath = os.path.join(ebooks_dir, filename)
            blob = bucket.blob(f'ebooks/{filename}')
            
            file_size = os.path.getsize(filepath) / (1024 * 1024)
            print(f"Uploading {filename} ({file_size:.2f} MB)...")
            
            blob.upload_from_filename(filepath, content_type='application/pdf')
            print(f"✅ Uploaded: {filename}")
        
        print(f"\n✅ Successfully uploaded {len(pdf_files)} files!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nPlease run: gcloud auth application-default login")
        sys.exit(1)
        
except ImportError:
    print("❌ google-cloud-storage not installed")
    print("\nPlease run: pip3 install google-cloud-storage")
    sys.exit(1)
PYEOF

