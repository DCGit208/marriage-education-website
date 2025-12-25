#!/usr/bin/env python3
"""
Simple script to upload ebooks to Firebase Storage
Run this after: pip3 install google-cloud-storage
"""

import os
import sys

try:
    from google.cloud import storage
    
    print("=" * 60)
    print("Firebase Storage Ebook Upload")
    print("=" * 60)
    print()
    
    # Initialize client
    print("Initializing Firebase Storage client...")
    os.environ['GOOGLE_CLOUD_PROJECT'] = 'marriage-education'
    
    client = storage.Client(project='marriage-education')
    bucket = client.bucket('marriage-education.appspot.com')
    
    # Get ebook files
    ebooks_dir = '/Users/achugustave/Documents/Marriageducation/ebooks'
    pdf_files = sorted([f for f in os.listdir(ebooks_dir) if f.endswith('.pdf')])
    
    print(f"Found {len(pdf_files)} PDF files to upload")
    print()
    
    uploaded = 0
    failed = 0
    
    for filename in pdf_files:
        filepath = os.path.join(ebooks_dir, filename)
        blob = bucket.blob(f'ebooks/{filename}')
        
        file_size = os.path.getsize(filepath) / (1024 * 1024)
        print(f"Uploading {filename} ({file_size:.2f} MB)...", end=' ')
        
        try:
            blob.upload_from_filename(filepath, content_type='application/pdf')
            print("✅")
            uploaded += 1
        except Exception as e:
            print(f"❌ Error: {e}")
            failed += 1
    
    print()
    print("=" * 60)
    print(f"Upload Complete: {uploaded} succeeded, {failed} failed")
    print("=" * 60)
    
    if uploaded > 0:
        print("\n✅ Files are now available in Firebase Storage!")
        print("\nNext step: Test the payment approval in admin panel")
        print("URL: https://marriageducation.com/public/admin-payments.html")
    
except ImportError:
    print("❌ Error: google-cloud-storage library not installed")
    print("\nPlease run:")
    print("  pip3 install google-cloud-storage")
    print("\nOr if that doesn't work:")
    print("  python3 -m pip install google-cloud-storage")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nMake sure you're authenticated with Google Cloud:")
    print("  gcloud auth application-default login")
    print("\nOr use Firebase authentication:")
    print("  firebase login")
    sys.exit(1)
