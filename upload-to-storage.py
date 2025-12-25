#!/usr/bin/env python3
"""
Upload ebooks to Firebase Storage using REST API
"""

import os
import json
import subprocess
import glob

def get_access_token():
    """Get Firebase access token"""
    result = subprocess.run(
        ['firebase', 'login:ci'],
        capture_output=True,
        text=True
    )
    # Token is already retrieved, use gcloud instead
    result = subprocess.run(
        ['gcloud', 'auth', 'application-default', 'print-access-token'],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        return result.stdout.strip()
    
    print("Error getting access token. Please run: gcloud auth application-default login")
    return None

def upload_file_to_storage(bucket_name, source_file, destination_blob):
    """Upload a file to Firebase Storage using curl"""
    token = get_access_token()
    if not token:
        print(f"Skipping {source_file} - no access token")
        return False
    
    file_size = os.path.getsize(source_file)
    file_size_mb = file_size / (1024 * 1024)
    
    print(f"Uploading {os.path.basename(source_file)} ({file_size_mb:.2f} MB)...")
    
    url = f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o?name={destination_blob}"
    
    result = subprocess.run([
        'curl', '-X', 'POST',
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/pdf',
        '--data-binary', f'@{source_file}',
        url
    ], capture_output=True, text=True)
    
    if result.returncode == 0 and 'name' in result.stdout:
        print(f"✅ Uploaded: {os.path.basename(source_file)}")
        return True
    else:
        print(f"❌ Failed: {os.path.basename(source_file)}")
        print(f"Error: {result.stderr if result.stderr else result.stdout}")
        return False

def main():
    bucket_name = "marriage-education.appspot.com"
    ebooks_dir = "/Users/achugustave/Documents/Marriageducation/ebooks"
    
    print("=" * 60)
    print("Firebase Storage Ebook Upload")
    print("=" * 60)
    print(f"\nBucket: {bucket_name}")
    print(f"Source: {ebooks_dir}\n")
    
    # Get all PDF files
    pdf_files = glob.glob(os.path.join(ebooks_dir, "*.pdf"))
    print(f"Found {len(pdf_files)} PDF files\n")
    
    uploaded = 0
    failed = 0
    
    for pdf_file in pdf_files:
        filename = os.path.basename(pdf_file)
        destination = f"ebooks/{filename}"
        
        if upload_file_to_storage(bucket_name, pdf_file, destination):
            uploaded += 1
        else:
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"Upload Complete: {uploaded} succeeded, {failed} failed")
    print("=" * 60)

if __name__ == "__main__":
    main()
