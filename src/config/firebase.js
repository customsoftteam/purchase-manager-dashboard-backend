// Firebase Admin SDK Configuration
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
let firebaseApp;

try {
  // Option 1: Use environment variables (recommended for production)
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    
    console.log('✅ Firebase Admin SDK initialized with environment variables');
  } 
  // Option 2: Use service account file from FIREBASE_SERVICE_ACCOUNT_PATH env variable
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(__dirname, '../..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = require(serviceAccountPath);
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    
    console.log('✅ Firebase Admin SDK initialized with service account file');
    // console.log('📧 Project ID:', serviceAccount.project_id);
    // console.log('📁 File path:', serviceAccountPath);
  }
  // Option 3: Use default serviceAccount.json location (fallback)
  else {
    const serviceAccountPath = path.join(__dirname, '../../serviceAccount.json');
    const serviceAccount = require(serviceAccountPath);
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    
    console.log('✅ Firebase Admin SDK initialized with serviceAccount.json');
    console.log('📧 Project ID:', serviceAccount.project_id);
  }
} catch (error) {
  console.error('❌ Error initializing Firebase Admin SDK:', error.message);
  console.error('Make sure either:');
  console.error('  1. Environment variables are set (FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL)');
  console.error('  2. FIREBASE_SERVICE_ACCOUNT_PATH points to your service account JSON file');
  console.error('  3. serviceAccount.json exists in /backend/ directory');
  throw error;
}

// Export Firebase Admin services
const auth = admin.auth();
const firestore = admin.firestore();

// Get API key from environment
const apiKey = process.env.FIREBASE_API_KEY;

if (!apiKey) {
  console.warn('⚠️ FIREBASE_API_KEY environment variable not set. Firebase REST API calls may fail.');
}

module.exports = {
  admin,
  auth,
  firestore,
  firebaseApp,
  apiKey,
};
