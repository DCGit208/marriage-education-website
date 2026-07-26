#!/usr/bin/env python3
"""Extract Sex by Design for Dummies PDF → Library book JSON pack.

Produces literary markdown chapters for /book.html (not LMS courseware).
"""
import fitz
import re
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # Marriageducation/
if not (ROOT / 'ebooks' / 'sbd-for-dummies.pdf').exists():
    ROOT = Path(__file__).resolve().parents[1].parent
PDF = ROOT / 'ebooks' / 'sbd-for-dummies.pdf'
OUT = ROOT / 'sbd-network' / 'public' / 'data' / 'books' / 'sbd-dummies.json'


def title_case_heading(s: str) -> str:
    s = re.sub(r'\s+', ' ', s).strip()
    if not s:
        return s
    small = {'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'vs', 'vs.', 'by'}

    def case_chunk(chunk: str, force_first_cap: bool = True) -> str:
        parts = []
        for i, w in enumerate(chunk.split(' ')):
            m = re.match(r"^([A-Za-z0-9'’\-]+)(.*)$", w)
            if not m:
                parts.append(w)
                continue
            word, punct = m.group(1), m.group(2)
            low = word.lower()
            if i > 0 and low in small and '-' not in word:
                parts.append(low + punct)
                continue
            cased = '-'.join(
                (p[:1].upper() + p[1:].lower()) if p else p
                for p in word.split('-')
            )
            parts.append(cased + punct)
        return ' '.join(parts)

    # Preserve quoted phrases with natural casing inside quotes
    pieces = []
    last = 0
    for m in re.finditer(r'[“"]([^”"]+)[”"]', s):
        pieces.append(case_chunk(s[last:m.start()]))
        pieces.append('“' + case_chunk(m.group(1)) + '”')
        last = m.end()
    pieces.append(case_chunk(s[last:]))
    out = ''.join(pieces)
    out = re.sub(r'\bSbd\b', 'SBD', out)
    out = re.sub(r'\bUdhr\b', 'UDHR', out)
    out = re.sub(r'\bKjv\b', 'KJV', out)
    out = re.sub(r'\bA3\b', 'A3', out, flags=re.I)
    return out


def strip_chapter_banner(raw: str) -> str:
    """Drop multi-line CHAPTER/APPENDIX title banners; keep section starts."""
    lines = raw.splitlines()
    out = []
    skipping = True
    for line in lines:
        s = line.strip()
        if skipping:
            if not s:
                continue
            if re.match(r'(?i)^(chapter|appendix)\b', s):
                continue
            # Title wrap from previous banner line (ALL CAPS, no section number)
            if (
                s.isupper()
                and len(s) < 100
                and not re.match(r'^\d+\.\d+', s)
                and not s.startswith('•')
                and s not in {'DEDICATION', 'PREFACE'}
            ):
                continue
            skipping = False
        out.append(line)
    return '\n'.join(out)


def is_running_noise(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    u = s.upper()
    if u in {'SEX BY DESIGN FOR DUMMIES', 'SEX BY DESIGN', 'SBD NETWORK'}:
        return True
    if re.fullmatch(r'\d{1,3}', s):
        return True
    if re.match(r'(?i)^table of contents\b', s):
        return True
    if re.match(r'(?i)^chapter\s+\d+\s*[—\-–]', s) and 'Flourishing' in s:
        # TOC-only lines can leak if TOC page partially included
        return False
    return False


def is_toc_page(lines) -> bool:
    if not lines:
        return False
    head = ' '.join(lines[:3]).upper()
    return 'TABLE OF CONTENTS' in head


def format_legal_page(raw: str, title: str) -> str:
    """Format copyright page into readable paragraphs/sections."""
    text = raw.replace('\u00a0', ' ')
    text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out = []
    buf = []
    force_break_prefixes = (
        'For permissions',
        'ISBN:',
        'Print Edition:',
        'eBook Edition',
        'EPUB Edition',
        'Cover Design:',
        'Typesetting:',
        'Edition:',
        'Scripture quotations',
    )

    def flush():
        nonlocal buf
        if buf:
            out.append(' '.join(buf))
            buf = []

    for ln in lines:
        u = ln.upper()
        if u.startswith('DIGITAL PIRACY WARNING'):
            flush()
            out.append('## Digital Piracy Warning')
            continue
        if any(ln.startswith(p) for p in force_break_prefixes):
            flush()
            out.append(ln)
            continue
        if ln in ('info@marriageducation.com', 'www.marriageducation.com'):
            flush()
            out.append(ln)
            continue
        buf.append(ln)
        if ln.endswith(('.', '!', '?', 'only.', 'domain.')):
            flush()
    flush()
    md = '\n\n'.join(out).strip()
    return f"# {title}\n\n{md}".strip()


def is_legal_page(lines) -> bool:
    if not lines:
        return False
    head = ' '.join(lines[:8])
    return (
        ('© 2025' in head or '(c) 2025' in head.lower())
        and ('All rights reserved' in head or 'all rights reserved' in head.lower())
    )


def main():
    doc = fitz.open(PDF)

    def page_text(i):
        return doc.load_page(i).get_text('text') or ''

    def page_lines(i):
        return [ln.strip() for ln in page_text(i).splitlines() if ln.strip()]

    skip_pages = set()
    starts = []

    for i in range(doc.page_count):
        lines = page_lines(i)
        if not lines:
            continue
        if is_toc_page(lines):
            skip_pages.add(i)
            continue
        if i < 6 and is_legal_page(lines):
            starts.append({'page': i, 'num': -1, 'title': 'Copyright & Licensing'})
            continue
        if i < 5 and lines[0].upper() == 'SEX BY DESIGN FOR DUMMIES' and any(
            'DEDICATION' in L.upper() for L in lines[:5]
        ):
            starts.append({'page': i, 'num': 0, 'title': 'Dedication & Preface'})
            continue
        m = None
        for cand in [lines[0], lines[0] + ' ' + (lines[1] if len(lines) > 1 else '')]:
            m = re.match(r'^(CHAPTER|Chapter)\s+(\d+)\b(.*)$', cand.strip())
            if m:
                break
        if not m:
            continue
        rest = (m.group(3) or '').strip()
        if rest.startswith(')') or 'appears in' in rest.lower():
            continue
        starts.append({
            'page': i,
            'num': int(m.group(2)),
            'title': re.sub(r'\s+', ' ', m.group(0)).strip(),
        })

    for i in range(doc.page_count):
        if i in skip_pages:
            continue
        lines = page_lines(i)
        if not lines:
            continue
        blob = ' '.join(lines[:2])
        if re.match(r'(?i)^APPENDIX A\b', blob):
            starts.append({
                'page': i,
                'num': 100,
                'title': 'Appendix A — Reading Map to Personal Development',
            })
        if re.match(r'(?i)^APPENDIX B\b', blob):
            starts.append({
                'page': i,
                'num': 101,
                'title': 'Appendix B — SBD Lexical Auxiliary',
            })

    by = {}
    for s in starts:
        if s['num'] not in by or s['page'] < by[s['num']]['page']:
            by[s['num']] = s
    starts = sorted(by.values(), key=lambda s: s['page'])

    toc_titles = {}
    for i in sorted(skip_pages) or range(min(6, doc.page_count)):
        t = page_text(i)
        for m in re.finditer(r'Chapter\s+(\d+)\s*[—\-–]\s*([^\n]+)', t):
            toc_titles[int(m.group(1))] = (
                f"Chapter {m.group(1)} — {m.group(2).strip()}"
            )
        for m in re.finditer(r'Appendix\s+([AB])\s*[:—\-–]\s*([^\n]+)', t, re.I):
            letter = m.group(1).upper()
            num = 100 if letter == 'A' else 101
            label = 'Appendix A — Reading Map to Personal Development' if letter == 'A' \
                else 'Appendix B — SBD Lexical Auxiliary'
            # Prefer fixed literary titles; TOC may truncate
            toc_titles[num] = label

    def clean_text(t: str) -> str:
        t = t.replace('\u00a0', ' ')
        t = re.sub(r'(\w)-\n(\w)', r'\1\2', t)
        t = re.sub(r'[ \t]+\n', '\n', t)
        return t.strip()

    def line_to_md_unit(s: str):
        """Return markdown unit(s) for a single stripped line, or None to skip."""
        if is_running_noise(s):
            return None
        u = s.upper()

        # Already shown as chapter chrome — never promote to body headings
        if re.match(r'(?i)^(chapter|appendix)\b', s):
            return None

        # Front-matter labels
        if u in {'DEDICATION', 'PREFACE'}:
            return [f'## {s.title()}']
        if re.match(r'(?i)^digital piracy warning\b', s):
            return ['## Digital Piracy Warning']

        # Numbered sections: 1.1 TITLE / 4.0 Why anatomy...
        m = re.match(r'^(\d+\.\d+(?:\.\d+)?)\s*[—\-–:]?\s*(.+)$', s)
        if m and len(m.group(2)) < 120:
            title = m.group(2).strip()
            if title.isupper() or sum(1 for c in title if c.isupper()) > len(title) * 0.55:
                title = title_case_heading(title)
            return [f'## {m.group(1)} {title}']

        # Letter sections: D. THE DUTY OF PROTECTION
        m = re.match(r'^([A-Z])\.\s+(.+)$', s)
        if m and len(m.group(2)) < 100 and (
            m.group(2).isupper() or m.group(2)[:1].isupper()
        ):
            return [f'### {m.group(1)}. {title_case_heading(m.group(2))}']

        # Standalone ALL-CAPS headings (short) — not body shoutouts
        if (
            len(s) < 80
            and len(s) > 3
            and s.isupper()
            and not s.startswith('•')
            and not s.startswith('—')
            and ' ' in s  # single tokens rarely true headings
            and not re.match(r'^[PCpc]\d?[:.]', s)
        ):
            return [f'## {title_case_heading(s)}']

        if s.startswith('•'):
            return ['- ' + s.lstrip('•').strip()]

        if s.startswith('—'):
            return [f'> *{s}*']

        return [s]

    def to_markdown(raw: str, chapter_title: str, strip_banner: bool = True) -> str:
        raw = clean_text(raw)
        if strip_banner:
            raw = strip_chapter_banner(raw)
        units = []
        for line in raw.splitlines():
            s = line.strip()
            if not s:
                units.append('')
                continue
            converted = line_to_md_unit(s)
            if converted is None:
                continue
            units.extend(converted)

        paras, buf = [], []

        def flush():
            nonlocal buf
            if buf:
                paras.append(' '.join(buf))
                buf = []

        for unit in units:
            s = unit.strip() if unit else ''
            if not s:
                flush()
                continue
            if s.startswith('## ') or s.startswith('### ') or s.startswith('- ') or s.startswith('>'):
                flush()
                paras.append(s)
                continue
            if re.match(r'(?i)^table of contents\b', s):
                flush()
                continue
            if re.match(r'(?i)^chapter\s+\d+\s*[—\-–].*chapter\s+\d+', s):
                continue
            buf.append(s)
        flush()

        md = re.sub(r'\n{3,}', '\n\n', '\n\n'.join(paras)).strip()
        return f"# {chapter_title}\n\n{md}".strip()

    def slice_raw(start_p: int, end_p: int) -> str:
        chunks = []
        for p in range(start_p, end_p):
            if p in skip_pages:
                continue
            chunks.append(page_text(p))
        return '\n'.join(chunks)

    chapters = []
    for idx, s in enumerate(starts):
        start_p = s['page']
        end_p = starts[idx + 1]['page'] if idx + 1 < len(starts) else doc.page_count
        raw = slice_raw(start_p, end_p)
        title = toc_titles.get(s['num']) or re.sub(r'\s+', ' ', s['title']).replace(
            'CHAPTER', 'Chapter'
        )
        if s['num'] == -1:
            title = 'Copyright & Licensing'
        if s['num'] == 0:
            title = 'Dedication & Preface'
        if s['num'] == 11:
            title = 'Chapter 11 — Practice From Perfection: Living Out Conjugal Fidelity'
        if s['num'] == 4:
            title = (
                'Chapter 4 — The Sexual One and Only: '
                'The Anatomy (Epicure Originativeness)'
            )
        if s['num'] == -1:
            md = format_legal_page(raw, title)
        else:
            md = to_markdown(raw, title, strip_banner=(s['num'] > 0))
        chapters.append({
            'id': f"ch-{s['num'] + 1:02d}",
            'title': title,
            'order': idx + 1,
            'content': md,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pack = {
        'id': 'sbd-dummies',
        'title': 'Sex by Design for Dummies',
        'subtitle': 'The Complete Marriage Handbook',
        'description': (
            'Full book for Library reading. '
            'Courseware in Learn is separate.'
        ),
        'coverImage': '/assets/book-covers/sbd-dummies.png',
        'pdfProductId': 'sbd-dummies',
        'pdfFilename': 'sbd-for-dummies.pdf',
        'author': 'Dr. Coach Achu Gustave',
        'source': 'ebooks/sbd-for-dummies.pdf',
        'chapterCount': len(chapters),
        'chapters': chapters,
    }
    OUT.write_text(json.dumps(pack, ensure_ascii=False), encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(chapters)} chapters)')
    print('Skipped TOC pages:', sorted(skip_pages))
    for c in chapters:
        print(f"  {c['order']:2d}. {c['title'][:72]} ({len(c['content'])} chars)")


if __name__ == '__main__':
    main()
