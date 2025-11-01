const admin = require('firebase-admin');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { initializeApp } = require('firebase/app');

// Initialize Firebase Admin SDK
const serviceAccount = require('../paws-of-jls-f814acd21e24.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'paws-of-jls'
});

// Initialize Firebase client SDK for calling functions
const firebaseConfig = {
  apiKey: "AIzaSyDvQJKoOLqgOhHWJvhqYhJhqYhJhqYhJhq",
  authDomain: "paws-of-jls.firebaseapp.com",
  projectId: "paws-of-jls",
  storageBucket: "paws-of-jls.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function runSync() {
  try {
    console.log('Calling testSyncWhitelist function...');
    
    // Call the testSyncWhitelist function
    const testSyncWhitelist = httpsCallable(functions, 'testSyncWhitelist');
    const result = await testSyncWhitelist();
    
    console.log('Sync result:', result.data);
    
    if (result.data.success) {
      console.log(`✅ Successfully synced ${result.data.usersProcessed} users to whitelist`);
    } else {
      console.error('❌ Sync failed:', result.data.error);
    }
    
  } catch (error) {
    console.error('Error running sync:', error);
  }
  
  process.exit(0);
}

runSync();