#!/usr/bin/env python3
"""
parse-telegram.py
Reads all messages*.html from the Telegram HTML export and produces
seed-data.json grouped by board (Telegram forum topic).

Usage:
    python3 scripts/parse-telegram.py

Output:
    scripts/seed-data.json
"""

import os, re, json
from html.parser import HTMLParser

# ---------------------------------------------------------------
# PATHS
# ---------------------------------------------------------------
TELEGRAM_DIR = "/Users/achugustave/Documents/BTH 2018/2024 SBD BookS/Book Project/Telegram/DataExport_2026-03-13/chats/chat_01"
PHOTOS_DIR   = os.path.join(TELEGRAM_DIR, "photos")
VIDEOS_DIR   = os.path.join(TELEGRAM_DIR, "video_files")
OUT_JSON     = os.path.join(os.path.dirname(__file__), "seed-data.json")

HTML_FILES   = [
    "messages.html",  "messages2.html",  "messages3.html",
    "messages4.html", "messages5.html",  "messages6.html",
    "messages7.html", "messages8.html",  "messages9.html",
    "messages10.html","messages11.html", "messages12.html",
    "messages13.html",
]

# ---------------------------------------------------------------
# SIMPLE HTML → PLAIN TEXT STRIPPER
# ---------------------------------------------------------------
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("a",):
            # capture href as text supplement
            for k, v in attrs:
                if k == "href" and v and not v.startswith("#") and not v.startswith("go_to"):
                    self.parts.append(f" [{v}] ")

    def handle_data(self, data):
        self.parts.append(data)

    def get_text(self):
        return " ".join("".join(self.parts).split())

def strip_html(raw):
    p = TextExtractor()
    p.feed(raw)
    return p.get_text()

def unescape_tg(s):
    return (s.replace("&laquo;", "«")
              .replace("&raquo;", "»")
              .replace("&amp;", "&")
              .replace("&lt;", "<")
              .replace("&gt;", ">")
              .replace("&quot;", '"')
              .replace("&#39;", "'"))

# ---------------------------------------------------------------
# PARSE A SINGLE HTML FILE INTO A LIST OF RECORDS
# Each record: dict with keys:
#   id, type (service|message), from_name, text,
#   reply_to (int|None), photo (path|None), video (path|None),
#   date_str, timestamp_str
# ---------------------------------------------------------------
RE_MSG_OPEN = re.compile(
    r'<div class="message (service|default[^"]*)" id="message(-?\d+)"',
    re.I
)
RE_DATE_DIV = re.compile(
    r'<div class="pull_right date details" title="([^"]+)"'
)
RE_FROM     = re.compile(
    r'<div class="from_name">\s*(.*?)\s*</div>', re.S
)
RE_TEXT     = re.compile(
    r'<div class="text">(.*?)</div>', re.S
)
RE_REPLY    = re.compile(
    r'go_to_message(\d+)', re.I
)
RE_PHOTO    = re.compile(
    r'href="[^"]*chats/chat_01/(photos/[^"]+\.jpg)"', re.I
)
RE_VIDEO    = re.compile(
    r'href="[^"]*chats/chat_01/(video_files/[^"]+\.mp4)"', re.I
)
RE_SERVICE_BODY = re.compile(
    r'<div class="body details">(.*?)</div>', re.S
)
RE_DATE_SERVICE = re.compile(
    r'^(\d{1,2} \w+ \d{4})$'
)

def parse_html_file(filepath):
    with open(filepath, encoding="utf-8", errors="replace") as f:
        content = f.read()

    records = []

    # Split on message boundaries
    parts = re.split(r'(?=<div class="message (?:service|default)[^"]*" id="message)', content)

    for part in parts:
        msg_match = RE_MSG_OPEN.search(part)
        if not msg_match:
            continue

        msg_type_raw = msg_match.group(1).strip()   # "service" or "default ..."
        msg_type     = "service" if "service" in msg_type_raw else "message"
        msg_id       = int(msg_match.group(2))

        # --- Service message ---
        if msg_type == "service":
            body_m = RE_SERVICE_BODY.search(part)
            body   = strip_html(unescape_tg(body_m.group(1))) if body_m else ""
            records.append({
                "id": msg_id,
                "type": "service",
                "text": body,
                "from_name": None,
                "reply_to": None,
                "photo": None,
                "video": None,
                "timestamp": None,
            })
            continue

        # --- Normal message ---
        ts_m      = RE_DATE_DIV.search(part)
        from_m    = RE_FROM.search(part)
        text_m    = RE_TEXT.search(part)
        reply_m   = RE_REPLY.search(part)
        photo_ms  = RE_PHOTO.findall(part)   # ALL photos in this message block
        video_ms  = RE_VIDEO.findall(part)   # ALL videos in this message block

        timestamp = ts_m.group(1).split()[0] if ts_m else None   # "DD.MM.YYYY"
        from_name = strip_html(unescape_tg(from_m.group(1))) if from_m else None
        raw_text  = text_m.group(1) if text_m else ""
        text      = strip_html(unescape_tg(raw_text))
        reply_to  = int(reply_m.group(1)) if reply_m else None
        # Take the first photo and video for now; extras tracked in photos/videos list
        photo     = photo_ms[0] if photo_ms else None
        video     = video_ms[0] if video_ms else None
        extra_photos = photo_ms[1:] if len(photo_ms) > 1 else []
        extra_videos = video_ms[1:] if len(video_ms) > 1 else []

        records.append({
            "id": msg_id,
            "type": "message",
            "text": text,
            "from_name": from_name,
            "reply_to": reply_to,
            "photo": photo,
            "video": video,
            "extra_photos": extra_photos,
            "extra_videos": extra_videos,
            "timestamp": timestamp,
        })

    return records

# ---------------------------------------------------------------
# BOARD DEFINITIONS  (final name → list of alias service texts)
# ---------------------------------------------------------------
BOARDS = [
    # (board_key, display_title, search phrases in service text)
    ("muliebrity-casual-home",     "Muliebrity Casual@Home",              ["Muliebrity Casual@Home"]),
    ("muliebrity-casual-outdoors", "Muliebrity Casual (Outdoors-Night etc)", ["Muliebrity Casual (Outdoors", "Muliebrity Casual - Day", "Muliebrity Casual (Outdoors-Dayt"]),
    ("muliebrity-corporate",       "Muliebrity Corporate",                ["Muliebrity Corporate"]),
    ("muliebrity-official",        "Muliebrity Official",                 ["Muliebrity Official"]),
    ("muliebrity-casual-night",    "Muliebrity Casual - Night",           ["Muliebrity Casual - Night"]),
    ("sbd-sex-positions",          "SBD Sex Positions",                   ["SBD Sex Positions"]),
    ("casual-sling-shot",          "Casual Sling Shot Strings",           ["Casual Sling Shot"]),
    ("muliebrity-sports",          "Muliebrity Sports",                   ["Muliebrity Sports"]),
    ("art-of-sexuality",           "The Art of Sexuality",                ["The Art of Sexuality"]),
    ("self-defense-couples",       "Self Defense for Couples",            ["Self Defense for Couples"]),
    ("asses-cock",                 "Asses that need a cock",              ["Asses that need a cock"]),
    ("sexicize",                   "Sexicize",                            ["Sexicize"]),
    ("business-board",             "Business Board",                      ["Business Board"]),
    ("sucking-cock",               "Sucking that cock",                   ["Sucking that cock"]),
    ("art-of-pussy",               "The Art of the Pussy",                ["The Art of the Pussy"]),
    ("marriage-porn-beyond",       "Marriage = Porn & Beyond",            ["Marriage = Porn"]),
    ("sexual-hygiene",             "Sexual Hygiene et al",                ["Sexual Hygiene"]),
    ("organizational-skills",      "Organizational Skills",               ["Organizational Skills"]),
]

# ---------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------
def main():
    print("📖 Parsing all HTML files...")

    all_records = []
    for fname in HTML_FILES:
        fpath = os.path.join(TELEGRAM_DIR, fname)
        if not os.path.exists(fpath):
            print(f"  ⚠️  {fname} not found, skipping")
            continue
        recs = parse_html_file(fpath)
        print(f"  ✅ {fname}: {len(recs)} records")
        all_records.extend(recs)

    print(f"\n📊 Total records: {len(all_records)}")

    # Build id → record index for fast lookup
    id_map = {}
    for r in all_records:
        id_map[r["id"]] = r

    # -------------------------------------------------------
    # Step 1: Find the root message ID for each board
    # A root is the service message "created topic «Name»"
    # followed immediately by the first real message (id+1)
    # which replies back to the service msg id.
    # We record: board_key → set of topic-root message IDs
    # -------------------------------------------------------
    board_roots = {b[0]: set() for b in BOARDS}

    for r in all_records:
        if r["type"] != "service":
            continue
        text = r["text"]
        if "created topic" not in text.lower():
            continue
        for bkey, btitle, phrases in BOARDS:
            for phrase in phrases:
                if phrase.lower() in text.lower():
                    board_roots[bkey].add(r["id"])

    print("\n🗂  Board root message IDs:")
    for bkey, bids in board_roots.items():
        print(f"  {bkey}: {sorted(bids)}")

    # -------------------------------------------------------
    # Step 2: Assign every message to a board by following
    # the reply chain upward until we hit a known root,
    # OR the message directly replies to a root.
    # Messages with no reply_to go into "general" (unassigned).
    # We walk up at most MAX_DEPTH steps to avoid infinite loops.
    # -------------------------------------------------------
    MAX_DEPTH = 40

    # Build reverse: root_id → board_key
    root_to_board = {}
    for bkey, bids in board_roots.items():
        for bid in bids:
            root_to_board[bid] = bkey

    msg_board_cache = {}   # msg_id → board_key (memoised)

    def find_board(record, depth=0):
        mid = record["id"]
        if mid in msg_board_cache:
            return msg_board_cache[mid]
        if mid in root_to_board:
            result = root_to_board[mid]
            msg_board_cache[mid] = result
            return result
        if depth >= MAX_DEPTH or record["reply_to"] is None:
            msg_board_cache[mid] = "unassigned"
            return "unassigned"
        parent = id_map.get(record["reply_to"])
        if parent is None:
            msg_board_cache[mid] = "unassigned"
            return "unassigned"
        result = find_board(parent, depth + 1)
        msg_board_cache[mid] = result
        return result

    # -------------------------------------------------------
    # Step 3: Collect posts grouped by board
    # For "joined" messages (no from_name), resolve author
    # by walking up the id chain to find a named ancestor.
    # -------------------------------------------------------
    def resolve_author(record):
        """Walk up reply chain to find an author name."""
        seen = set()
        r = record
        while r:
            if r.get("from_name"):
                return r["from_name"]
            mid = r["id"]
            if mid in seen:
                break
            seen.add(mid)
            parent_id = r.get("reply_to")
            if parent_id is None:
                # try id - 1 (sequential joined messages)
                parent_id = mid - 1
            r = id_map.get(parent_id)
        return "Unknown"

    groups = {b[0]: [] for b in BOARDS}
    groups["unassigned"] = []
    unassigned_count = 0

    for r in all_records:
        if r["type"] != "message":
            continue
        # Skip empty messages (no text, no media)
        if not r["text"] and not r["photo"] and not r["video"]:
            continue

        board = find_board(r)
        if board == "unassigned":
            unassigned_count += 1

        author = r["from_name"] or resolve_author(r)

        # Collect all photos for this post
        photos = ([r["photo"]] if r["photo"] else []) + r.get("extra_photos", [])
        videos = ([r["video"]] if r["video"] else []) + r.get("extra_videos", [])

        post = {
            "msgId":      r["id"],
            "authorName": author,
            "content":    r["text"],
            "photos":     photos,   # list of relative paths
            "videos":     videos,   # list of relative paths
            "timestamp":  r["timestamp"],
        }
        groups[board].append(post)

    # -------------------------------------------------------
    # Step 4: Build final output structure
    # -------------------------------------------------------
    boards_out = []
    for bkey, btitle, _ in BOARDS:
        posts = groups[bkey]
        boards_out.append({
            "key":         bkey,
            "title":       btitle,
            "postCount":   len(posts),
            "posts":       posts,
        })

    output = {
        "group": {
            "key":         "am-rd",
            "title":       "AM-RD",
            "description": "Administrative Board — Muliebrity Research & Development. Exchange of ideas concerning SBD boards created for the Muliebrity fashion and sexuality education program.",
        },
        "boards": boards_out,
        "unassigned": {
            "count":  unassigned_count,
            "posts":  groups["unassigned"],
        },
        "stats": {
            "totalMessages":    sum(1 for r in all_records if r["type"] == "message"),
            "totalPosts":       sum(len(g["posts"]) for g in boards_out),
            "unassigned":       unassigned_count,
            "postsWithPhotos":  sum(1 for b in boards_out for p in b["posts"] if p["photos"]),
            "postsWithVideos":  sum(1 for b in boards_out for p in b["posts"] if p["videos"]),
            "boardBreakdown":   {b["key"]: b["postCount"] for b in boards_out},
        }
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Wrote {OUT_JSON}")
    print(f"\n📈 Stats:")
    print(f"   Total message records    : {output['stats']['totalMessages']}")
    print(f"   Posts assigned to boards : {output['stats']['totalPosts']}")
    print(f"   Unassigned               : {unassigned_count}")
    print(f"   Posts with photos        : {output['stats']['postsWithPhotos']}")
    print(f"   Posts with videos        : {output['stats']['postsWithVideos']}")
    print(f"\n📋 Posts per board:")
    for b in boards_out:
        media = sum(1 for p in b["posts"] if p["photos"] or p["videos"])
        bar = "█" * min(40, b["postCount"] // 5 + 1)
        print(f"   {b['title']:<46} {b['postCount']:>4} posts  {media:>4} w/media  {bar}")


if __name__ == "__main__":
    main()
