# SBD Network - Private Learning Community PWA

A mobile-first Progressive Web App (PWA) built for marriageducation.com to replace Telegram groups with a structured, private learning community platform.

## 🎯 Features

### Core Features
- **User Authentication** - Secure signup/login with Firebase Auth
- **Group System** - Telegram-style groups (channels) with controlled access
- **Board Organization** - Multiple boards within each group
- **Rich Posts** - Text, images, and video (YouTube embeds or direct URLs)
- **Threaded Comments** - Reddit-style discussion under each post
- **Real-time Updates** - Instant updates using Firestore listeners
- **Admin Panel** - Complete management of groups, boards, and users

### PWA Features
- **Installable** - Add to home screen on mobile devices
- **Offline Support** - Service worker caching for offline access
- **Fast Performance** - Optimized mobile-first design
- **Responsive** - Works perfectly on all screen sizes

## 🎨 Design

- **Dark Modern Interface** - Black background with cyan accent (#00bcd4)
- **Mobile-First** - Optimized for phones, scales up to desktop
- **Card-Based Layout** - Inspired by Discord, Telegram, and Reddit

## 🛠️ Tech Stack

### Frontend
- HTML5
- CSS3 (Mobile-first responsive)
- Vanilla JavaScript (ES6+)

### Backend
- Firebase Authentication
- Cloud Firestore (Database)
- Firebase Storage (Images)
- Firebase Hosting

## 📁 Project Structure

```
sbd-network/
├── public/                  # HTML pages
│   ├── index.html           # Login/Signup
│   ├── dashboard.html       # User dashboard
│   ├── group.html           # Group page with boards
│   ├── board.html           # Board with posts and comments
│   └── admin.html           # Admin panel
├── css/
│   └── styles.css           # Complete styling
├── js/
│   ├── firebase.js          # Firebase config & initialization
│   ├── auth.js              # Authentication logic
│   ├── dashboard.js         # Dashboard functionality
│   ├── group.js             # Group page logic
│   ├── board.js             # Board page logic
│   ├── posts.js             # Post management
│   ├── upload.js            # Image/video upload utilities
│   └── admin.js             # Admin panel logic
├── assets/
│   └── icons/               # PWA icons (need to be created)
├── manifest.json            # PWA manifest
├── service-worker.js        # Service worker for offline support
├── firebase.json            # Firebase configuration
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore indexes
├── storage.rules            # Storage security rules
└── README.md                # This file
```

## 🚀 Setup Instructions

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project called "SBD Network" (or your preferred name)
3. Enable the following services:
   - **Authentication** → Email/Password provider
   - **Firestore Database** → Create in production mode
   - **Storage** → Create bucket
   - **Hosting** (optional, for deployment)

### 2. Firebase Configuration

1. In Firebase Console, go to Project Settings → General
2. Scroll to "Your apps" → Add web app
3. Copy the Firebase configuration object
4. Open `js/firebase.js` and replace the config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Deploy Security Rules

#### Firestore Rules
1. Go to Firestore → Rules tab
2. Copy contents from `firestore.rules`
3. Publish the rules

#### Storage Rules
1. Go to Storage → Rules tab
2. Copy contents from `storage.rules`
3. Publish the rules

#### Firestore Indexes
1. Go to Firestore → Indexes tab
2. The app will automatically prompt you to create indexes when you first run queries
3. Or manually create indexes from `firestore.indexes.json`

### 4. Create PWA Icons

You need to create PNG icons in these sizes and place them in `assets/icons/`:
- icon-72.png (72x72)
- icon-96.png (96x96)
- icon-128.png (128x128)
- icon-144.png (144x144)
- icon-152.png (152x152)
- icon-192.png (192x192)
- icon-384.png (384x384)
- icon-512.png (512x512)

**Quick way**: Use a tool like [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator) or create a simple logo and resize it.

### 5. Local Testing

#### Option A: Use Firebase Hosting (Recommended)
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project folder
cd sbd-network
firebase init

# Select: Hosting, Firestore, Storage
# Use existing project
# Public directory: public
# Configure as single-page app: Yes
# Set up automatic builds: No

# Serve locally
firebase serve
```

Visit: `http://localhost:5000`

#### Option B: Use Python HTTP Server
```bash
cd sbd-network
python3 -m http.server 8000
```

Visit: `http://localhost:8000/public/`

#### Option C: Use VS Code Live Server
1. Install "Live Server" extension in VS Code
2. Right-click `public/index.html`
3. Select "Open with Live Server"

### 6. Create First Admin User

1. Sign up with your email
2. Go to Firebase Console → Firestore
3. Find your user document in the `users` collection
4. Edit the document and change `role` from `"member"` to `"admin"`
5. Refresh the app and you'll see the "Admin Panel" button

## 📊 Database Structure

### Collections

#### users
```javascript
{
  uid: "firebase_uid",
  name: "John Doe",
  email: "john@example.com",
  role: "admin" | "member",
  groups: ["groupId1", "groupId2"],
  createdAt: timestamp,
  lastActive: timestamp
}
```

#### groups (Channels)
```javascript
{
  groupId: "auto_generated",
  title: "Sexual Literacy Training",
  description: "Advanced training course",
  createdAt: timestamp
}
```

#### boards
```javascript
{
  boardId: "auto_generated",
  groupId: "reference_to_group",
  title: "The Art of Sexuality",
  description: "Discussion board",
  createdAt: timestamp
}
```

#### posts
```javascript
{
  postId: "auto_generated",
  boardId: "reference_to_board",
  authorId: "user_uid",
  authorName: "John Doe",
  content: "Post text content",
  imageUrl: "firebase_storage_url" | null,
  videoUrl: "youtube_or_direct_url" | null,
  timestamp: timestamp,
  commentCount: 0,
  isPinned: false
}
```

#### comments
```javascript
{
  commentId: "auto_generated",
  postId: "reference_to_post",
  authorId: "user_uid",
  authorName: "John Doe",
  text: "Comment text",
  timestamp: timestamp
}
```

## 👤 User Roles & Permissions

### Member
- View groups they belong to
- View boards in their groups
- Create posts
- Comment on posts
- Delete their own posts/comments
- Upload images

### Admin
- All member permissions
- Access admin panel
- Create/delete groups
- Create/delete boards
- Delete any post/comment
- Add users to groups
- Manage user memberships

## 🎯 Usage Workflow

### For Members
1. **Sign up** → Create account
2. **Wait for admin** → Admin adds you to groups
3. **Access groups** → See groups on dashboard
4. **Explore boards** → Tap group to see boards
5. **Read/discuss** → View posts, add comments
6. **Create posts** → Use FAB button to create posts with text/images/videos

### For Admins
1. **Login** → Access admin panel
2. **Create groups** → e.g., "Teleios School", "Marriage Systems"
3. **Create boards** → Add boards to groups
4. **Manage users** → Add members to appropriate groups
5. **Moderate** → Delete inappropriate content if needed

## 📱 PWA Installation

### iOS (iPhone/iPad)
1. Open Safari (must use Safari)
2. Navigate to your hosted app
3. Tap Share button → "Add to Home Screen"
4. Name it "SBD Network"
5. Tap "Add"

### Android
1. Open Chrome
2. Navigate to your hosted app
3. Tap menu (3 dots) → "Add to Home screen"
4. Or look for the install prompt at the bottom

## 🚀 Deployment to Firebase Hosting

```bash
# Build and deploy
firebase deploy

# Deploy only hosting
firebase deploy --only hosting

# Deploy only rules
firebase deploy --only firestore:rules,storage:rules
```

Your app will be live at: `https://YOUR_PROJECT_ID.web.app`

## 🔧 Customization

### Change Colors
Edit `css/styles.css` → `:root` variables:
```css
--accent-primary: #00bcd4;  /* Main accent color */
--bg-primary: #000000;       /* Background */
--bg-card: #1a1a1a;          /* Card background */
```

### Change App Name
1. `manifest.json` → `name` and `short_name`
2. All HTML files → `<title>` tags
3. `js/firebase.js` → Update references

### Add More Features
- Edit relevant JS files
- Follow existing patterns
- Update security rules if adding new collections

## 🐛 Troubleshooting

### "Permission Denied" Errors
- Check Firestore rules are deployed
- Verify user is logged in
- Check user has required role (admin features)
- Verify user belongs to the group

### Images Not Uploading
- Check Storage rules are deployed
- Verify file size < 5MB
- Check file format (JPG, PNG, WEBP only)
- Look at browser console for errors

### Real-time Updates Not Working
- Ensure Firestore indexes are created
- Check browser console for index creation links
- Click the link and create the index

### PWA Not Installing
- Must be served over HTTPS (or localhost)
- Check manifest.json is valid
- Ensure icons exist
- Check service worker is registered

### Video Not Playing
- Verify YouTube URL format
- Check if video is public/embeddable
- For direct videos, ensure CORS is allowed

## 📞 Support

For issues related to:
- **Firebase Setup**: [Firebase Documentation](https://firebase.google.com/docs)
- **PWA Features**: [PWA Documentation](https://web.dev/progressive-web-apps/)
- **App Features**: Review code comments and structure

## 📄 License

This project is built for marriageducation.com.

---

**Built with ❤️ by Dr. Coach Achu's team**
**Version 1.0 - March 2026**
