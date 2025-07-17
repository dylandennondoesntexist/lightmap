# Lightmap - Global Message Map

A real-time global message map inspired by ho'oponopono principles.

## Setup

1. Clone this repository
2. Copy `config.template.js` to `config.js`
3. Fill in your Firebase configuration in `config.js`:
   - Get your config from Firebase Console → Project Settings → General → Your Apps
4. Update `.firebaserc` with your Firebase project ID
5. Set up Firebase Realtime Database rules.

## Local Development

```bash
# Install Firebase CLI if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Serve locally
firebase serve

# Or just open index.html directly in browser
```

## Deployment

```bash
# Deploy to Firebase Hosting
firebase deploy

# Deploy only hosting (skip functions, etc.)
firebase deploy --only hosting
```

## Firebase Setup

1. Create a new Firebase project
2. Enable Realtime Database
3. Enable Firebase Hosting
4. Set security rules (see above)
5. Copy your config from Project Settings
6. Paste into `config.js`
7. Update `.firebaserc` with your project ID

## Features

- Real-time message display across all devices
- Geohashed locations for privacy
- Rate limiting to prevent spam
- Automatic cleanup of old messages
- Dark/light theme toggle
- Mobile responsive

## Messages

- 🔴 I love you
- 🟢 Thank you  
- 🔵 I forgive you
- 🟣 Please forgive me
