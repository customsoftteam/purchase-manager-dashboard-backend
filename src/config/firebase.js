// Firebase Admin SDK Configuration
const admin = require('firebase-admin');

// Initialize Firebase Admin
let firebaseApp;

try {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error(
      'Missing Firebase env vars. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );
  }

  // Backward-compatible normalization for accidentally truncated service-account emails.
  if (!clientEmail.includes('.iam.gserviceaccount.com')) {
    clientEmail = `${clientEmail}.iam.gserviceaccount.com`;
    console.warn('⚠️ FIREBASE_CLIENT_EMAIL was missing .iam.gserviceaccount.com; auto-corrected from env value.');
  }

  if (!clientEmail.endsWith('.iam.gserviceaccount.com')) {
    throw new Error('Invalid FIREBASE_CLIENT_EMAIL format. Expected a Firebase service account email ending with .iam.gserviceaccount.com');
  }

  // Support escaped newlines and accidental wrapping quotes from copied .env values.
  const privateKey = rawPrivateKey
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      privateKey,
      clientEmail,
    }),
    projectId,
  });

  console.log('✅ Firebase Admin SDK initialized with environment variables (Option 1)');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin SDK:', error.message);
  console.error('Make sure environment variables are set:');
  console.error('  FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
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
