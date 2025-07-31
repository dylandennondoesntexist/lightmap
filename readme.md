# **Minimalist Connection Map**

A web application inspired by the principles of Ho'oponopono and The Pitt, designed to foster a sense of connection through simple, anonymous interactions on a global map. Users can send ephemeral messages ("I love you," "Thank you," etc.) that appear as temporary dots on a world map, or a single "Here for you" message that leaves a permanent mark for the day.

## **Features**

* **Ephemeral Messages**: Send one of four predefined messages ("I love you," "Thank you," "I forgive you," "Please forgive me") that appear as a colored dot on a world map for a short duration.  
* **"Here for you" Message**: After interacting with the ephemeral messages a few times, a special "Here for you" button unlocks, allowing you to place a single, permanent dot on the map for the current day (resets daily).  
* **Real-time Updates**: See messages from other users appear on the map in real-time.  
* **Geolocation-based**: Dots are placed based on your approximate geographic location (converted to a 6-character geohash for privacy). No personal identifiers are stored or shared.  
* **Dark/Light Mode**: Toggle between light and dark themes for comfortable viewing.  
* **Responsive Design**: Optimized for various screen sizes, including mobile and desktop.  
* **Automated Data Cleanup**: Firebase Cloud Functions automatically remove old ephemeral messages to maintain database efficiency.

## **Technologies Used**

* **Frontend**:  
  * HTML5  
  * CSS3  
  * JavaScript (ES6+)  
  * [D3.js](https://d3js.org/) for map rendering and animations  
  * [TopoJSON](https://github.com/topojson/topojson) for geographic data  
* **Backend**:  
  * [Firebase Realtime Database](https://firebase.google.com/docs/database) for storing message data.  
  * [Firebase Cloud Functions](https://firebase.google.com/docs/functions) for scheduled data cleanup.

## **Getting Started**

Follow these instructions to set up and run the project locally.

### **Prerequisites**

* Node.js (LTS version recommended)  
* npm (Node Package Manager)  
* A Firebase project  
* Firebase CLI (npm install \-g firebase-tools)

### **1\. Clone the Repository**

git clone https://github.com/your-username/your-repo-name.git  
cd your-repo-name

### **2\. Initialize Firebase**

If you haven't already, log in to Firebase and initialize your project:

firebase login  
firebase init

During firebase init, select:

* **Features**: Firestore, Functions, Hosting  
* **Project**: Select your existing Firebase project.  
* **Firestore**: Use default rules and index files.  
* **Functions**:  
  * Language: JavaScript  
  * ESLint: Yes  
  * Install dependencies: Yes  
* **Hosting**:  
  * Public directory: . (or public if you prefer, but your current setup assumes . for index.html)  
  * Configure as a single-page app: No (or Yes, if you plan to use client-side routing)  
  * Set up automatic builds and deploys with GitHub: (Your preference)

### **3\. Configure Firebase Client SDK**

Create a config.js file in your project's root directory (next to index.html) with your Firebase project configuration. You can find this in your Firebase Console under Project settings \-\> General \-\> Your apps \-\> Web app \-\> Firebase SDK snippet (Config).

// config.js  
export const firebaseConfig \= {  
  apiKey: "YOUR\_API\_KEY",  
  authDomain: "YOUR\_PROJECT\_ID.firebaseapp.com",  
  projectId: "YOUR\_PROJECT\_ID",  
  storageBucket: "YOUR\_PROJECT\_ID.appspot.com",  
  messagingSenderId: "YOUR\_MESSAGING\_SENDER\_ID",  
  appId: "YOUR\_APP\_ID",  
  databaseURL: "https://YOUR\_PROJECT\_ID-default-rtdb.firebaseio.com", // Ensure this is correct for Realtime Database  
};

**Important**: Do not commit your config.js if it contains sensitive information. For this project, the firebaseConfig is generally public, but always double-check. Consider adding config.js to your .gitignore and providing a config\_template.js for others to copy.

### **4\. Install Functions Dependencies**

Navigate into the functions directory and install its dependencies:

cd functions  
npm install  
cd .. \# Go back to the root directory

### **5\. Deploy Firebase Rules and Functions**

Ensure your firebase.json has the correct configurations for your hosting and functions.

Deploy your Firebase Realtime Database rules and Cloud Functions:

firebase deploy \--only database,functions

### **6\. Run Locally (Optional)**

You can serve your web application locally:

firebase emulators:start

This will provide local URLs for your hosting and functions.

## **Project Structure**

.  
├── .firebaserc             \# Firebase project aliases  
├── .gitignore              \# Git ignore for the root directory  
├── config\_template.js      \# Template for Firebase client configuration  
├── config.js               \# Your actual Firebase client configuration (KEEP PRIVATE IF SENSITIVE)  
├── favicon.png             \# Website favicon  
├── firebase.json           \# Firebase project configuration (hosting, functions, rules)  
├── functions/              \# Firebase Cloud Functions directory  
│   ├── .eslintrc.js        \# ESLint configuration for functions  
│   ├── .gitignore          \# Git ignore for functions (node\_modules, local files)  
│   ├── index.js            \# Cloud Functions code (cleanup logic)  
│   ├── package-lock.json   \# Exact dependency versions for functions  
│   └── package.json        \# Functions dependencies and scripts  
├── index.html              \# Main HTML file for the web application  
├── main.js                 \# Main JavaScript logic for the client-side  
└── style.css               \# CSS styles for the web application

## **Contributing**

Contributions are welcome\! If you'd like to contribute, please fork the repository and create a pull request.

1. Fork the repository.  
2. Create a new branch (git checkout \-b feature/your-feature-name).  
3. Make your changes.  
4. Commit your changes (git commit \-m 'Add new feature').  
5. Push to the branch (git push origin feature/your-feature-name).  
6. Create a new Pull Request.

Please ensure your code adheres to the existing style and that all tests pass.

## **License**

This project is licensed under the MIT License \- see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.

**Note**: This project is for demonstration and learning purposes. While efforts are made to ensure privacy (geohashing, no personal identifiers), always exercise caution when dealing with user data and consider all security implications for production applications.