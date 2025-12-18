#!/usr/bin/env python3
"""
Extract content from SBD for Dummies PDF and map to course modules
"""

import PyPDF2
import json
import re

def extract_pdf_text(pdf_path):
    """Extract all text from PDF"""
    print(f"📖 Opening PDF: {pdf_path}")
    
    with open(pdf_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        total_pages = len(pdf_reader.pages)
        print(f"📄 Total pages: {total_pages}")
        
        full_text = ""
        for i, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            full_text += f"\n\n--- PAGE {i+1} ---\n\n{text}"
            
            # Show progress every 10 pages
            if (i + 1) % 10 == 0:
                print(f"   Extracted {i+1}/{total_pages} pages...")
        
        print(f"✅ Extracted {len(full_text)} characters from {total_pages} pages")
        return full_text

def identify_sections(text):
    """Identify major sections and chapters in the PDF"""
    # Common patterns for chapter/section headings
    patterns = [
        r'(?m)^CHAPTER\s+\d+[:\s]+(.+)$',
        r'(?m)^Chapter\s+\d+[:\s]+(.+)$',
        r'(?m)^PART\s+[IVX]+[:\s]+(.+)$',
        r'(?m)^Part\s+[IVX]+[:\s]+(.+)$',
        r'(?m)^[A-Z][A-Z\s]{10,}$',  # ALL CAPS headings
    ]
    
    sections = []
    for pattern in patterns:
        matches = re.finditer(pattern, text)
        for match in matches:
            sections.append({
                'title': match.group(0).strip(),
                'position': match.start()
            })
    
    # Sort by position
    sections.sort(key=lambda x: x['position'])
    
    return sections

def extract_section_content(text, start_pos, end_pos):
    """Extract content between two positions"""
    return text[start_pos:end_pos].strip()

def main():
    pdf_path = 'ebooks/sbd-for-dummies.pdf'
    output_file = 'pdf-extracted-content.txt'
    sections_file = 'pdf-sections.json'
    
    # Extract full text
    full_text = extract_pdf_text(pdf_path)
    
    # Save full text
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(full_text)
    print(f"💾 Saved full text to: {output_file}")
    
    # Identify sections
    sections = identify_sections(full_text)
    
    if sections:
        print(f"\n📚 Found {len(sections)} potential sections:")
        for i, section in enumerate(sections[:20]):  # Show first 20
            print(f"   {i+1}. {section['title']}")
        
        # Save sections
        with open(sections_file, 'w', encoding='utf-8') as f:
            json.dump(sections, f, indent=2)
        print(f"💾 Saved sections to: {sections_file}")
    else:
        print("⚠️  No clear section structure found - will analyze content manually")
    
    # Show first 2000 characters as preview
    print("\n" + "="*80)
    print("📖 CONTENT PREVIEW (first 2000 chars):")
    print("="*80)
    print(full_text[:2000])
    print("\n" + "="*80)
    
    print("\n✅ Extraction complete!")
    print(f"   Total content: {len(full_text):,} characters")
    print(f"   Output file: {output_file}")
    if sections:
        print(f"   Sections file: {sections_file}")

if __name__ == '__main__':
    main()
