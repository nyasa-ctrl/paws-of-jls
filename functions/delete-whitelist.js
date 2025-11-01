const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

async function deleteWhitelistCollection() {
  try {
    console.log('Deleting whitelist collection...');
    
    // Get all documents in the whitelist collection
    const snapshot = await db.collection('whitelist').get();
    
    if (snapshot.empty) {
      console.log('Whitelist collection is already empty.');
      return;
    }
    
    // Delete all documents in batches
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.docs.length} documents from whitelist collection.`);
    
  } catch (error) {
    console.error('Error deleting whitelist collection:', error);
  } finally {
    process.exit(0);
  }
}

deleteWhitelistCollection();