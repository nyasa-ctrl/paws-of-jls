const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./../../../../Downloads/paws-of-jls-f814acd21e24.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'paws-of-jls'
});

const db = admin.firestore();

async function initializeFirestore() {
  try {
    console.log('🚀 Initializing Firestore database...');
    
    // Force create the whitelist collection and document
    const whitelistRef = db.collection('whitelist').doc('nyasasingh19@gmail.com');
    
    const docData = {
      name: 'Nyasa Singh',
      email: 'nyasasingh19@gmail.com',
      lastUpdated: admin.firestore.Timestamp.now()
    };
    
    console.log('📝 Creating whitelist document...');
    await whitelistRef.set(docData);
    
    console.log('✅ Document created successfully!');
    
    // Verify it was created
    console.log('🔍 Verifying document exists...');
    const doc = await whitelistRef.get();
    
    if (doc.exists) {
      console.log('✅ Document verified! Data:', doc.data());
    } else {
      console.log('❌ Document still not found after creation');
    }
    
  } catch (error) {
    console.error('❌ Error initializing Firestore:', error.message);
    console.error('Full error:', error);
  }
  
  process.exit(0);
}

initializeFirestore();