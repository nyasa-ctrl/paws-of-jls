const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {GoogleAuth} = require("google-auth-library");
const {google} = require("googleapis");
const logger = require("firebase-functions/logger");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Initialize Firestore with explicit database reference
// Specify the database location to match firebase.json (nam5)
const db = admin.firestore();

// Try to set the database settings to handle location mismatch
try {
  db.settings({
    ignoreUndefinedProperties: true,
    // Force the database to use the correct project and location
    projectId: 'paws-of-jls',
    databaseId: '(default)' // Use the new database
  });
} catch (error) {
  logger.error("Error setting Firestore settings:", error);
}

// Add some debugging to see what's happening
logger.log("Firebase Admin SDK initialized");
logger.log("Firestore instance created");

// Test Firestore connectivity
const testFirestoreConnection = async () => {
  try {
    logger.log("Testing Firestore connection...");
    const testRef = db.collection('_test').doc('connection');
    await testRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
    logger.log("Firestore connection test successful");
    await testRef.delete(); // Clean up test document
  } catch (error) {
    logger.error("Firestore connection test failed:", error);
  }
};

// Define secrets and config
const GOOGLE_SHEETS_CREDENTIALS = defineSecret("GOOGLE_SHEETS_CREDENTIALS");
// For now, use the legacy config until migration is complete
const SPREADSHEET_ID = "16BdvkH63Su9rDrANfwPMZZXRfi66pVCT55scpREB6zU";

// --- Google Sheets Helper Library ---
// (Based on 'googleSheets.js' from the AUTHENTICATION_SYSTEM.md doc)

/**
 * Creates an authorized Google Sheets API client with read-only scope.
 * @return {Promise<sheets_v4.Sheets>} An authorized Sheets API client.
 */
const getGoogleSheetsClient = async () => {
  // Use the "GOOGLE_SHEETS_CREDENTIALS" secret
  const auth = new GoogleAuth({
    credentials: JSON.parse(GOOGLE_SHEETS_CREDENTIALS.value()),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const client = await auth.getClient();
  return google.sheets({version: "v4", auth: client});
};

/**
 * Reads data from a specified range in a Google Sheet.
 * @param {sheets_v4.Sheets} sheetsClient - Authorized Sheets API client.
 * @param {string} range - The A1 notation of the range to retrieve.
 * @return {Promise<any[][]>} A 2D array of the data.
 */
const readSheetData = async (sheetsClient, range) => {
  logger.log(`Reading sheet data from range: ${range}, spreadsheetId: ${SPREADSHEET_ID}`);
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  return res.data.values;
};

// --- End Google Sheets Helper Library ---


/**
 * Scheduled function that runs daily to sync the employee whitelist
 * from Google Sheets to Firestore.
 * (From "6. Create Scheduled Sync Function" in AUTHENTICATION_SYSTEM.md)
 */
exports.syncWhitelist = onSchedule({
  schedule: "every 24 hours",
  secrets: [GOOGLE_SHEETS_CREDENTIALS],
}, async (event) => {
  try {
    logger.log("Starting whitelist sync...");
    logger.log(`Using SPREADSHEET_ID: ${SPREADSHEET_ID}`);
    
    // Test Firestore connection first
    await testFirestoreConnection();
    
    if (!SPREADSHEET_ID) {
      logger.error("SPREADSHEET_ID is not defined!");
      return null;
    }
    
    const sheetsClient = await getGoogleSheetsClient();
    const data = await readSheetData(sheetsClient, "Employees!A2:B");

        if (!data || data.length === 0) {
          logger.log("No data found in sheet.");
          return null;
        }

        const batch = db.batch();
        const whitelistCollection = db.collection("whitelist");

        // For Enterprise DB, we'll skip the deletion of old users and just add/update new ones
        // This avoids the RunQuery operation that's not supported in Enterprise DB
        logger.log("Processing sheet data for Enterprise Firestore database...");

        // Process sheet data - add/update users
        // NOTE: Google Sheets has columns swapped: A=name, B=email
        for (const row of data) {
          const name = row[0] || "JLS Employee";  // Column A = name
          const email = row[1];                   // Column B = email

          if (email) {
            const userRef = whitelistCollection.doc(email);
            batch.set(userRef, {
              email: email,
              name: name,
              lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, {merge: true}); // Use merge to avoid overwriting avatarUrl
            
            logger.log(`Adding/updating user: ${email} (${name})`);
          }
        }

        await batch.commit();
        logger.log(`Whitelist sync complete. ${data.length} users processed.`);
        return null;
      } catch (err) {
        logger.error("Error syncing whitelist:", err);
        return null;
      }
    });

/**
 * HTTP callable function for a user to update their own avatar.
 * (From "1. Save User Avatar" in AUTHENTICATION_SYSTEM.md)
 */
exports.saveUserAvatar = onCall(async (request) => {
  // 1. Check authentication
  if (!request.auth) {
    throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  const userEmail = request.auth.token.email;
  const {avatarUrl} = request.data;

  if (!avatarUrl) {
    throw new HttpsError(
        "invalid-argument",
        "The function must be called with an 'avatarUrl' argument.",
    );
  }

  try {
    // 2. Verify user is in the whitelist
    const userRef = db.collection("whitelist").doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError(
          "permission-denied",
          "User is not in the whitelist.",
      );
    }

    // 3. Update the avatarUrl in Firestore
    await userRef.update({avatarUrl: avatarUrl});

    logger.log(`User ${userEmail} updated avatar to: ${avatarUrl}`);
    return {success: true, avatarUrl: avatarUrl};
  } catch (err) {
    logger.error(`Failed to save avatar for ${userEmail}:`, err);
    throw new HttpsError("internal", "Failed to save avatar.");
  }
});

/**
 * Scheduled function to sync Firestore avatar URLs back to the Google Sheet.
 * (From "2. Sync Avatars" in AUTHENTICATION_SYSTEM.md)
 */
exports.syncAvatars = onSchedule({
  schedule: "0 0 * * 0", // Every Sunday at midnight
  secrets: [GOOGLE_SHEETS_CREDENTIALS],
}, async (event) => {
  try {
    logger.log("Starting avatar sync to Google Sheets...");

        // 1. Get all users from Firestore
        const snapshot = await db.collection("whitelist").get();
        if (snapshot.empty) {
          logger.log("No users in whitelist. Stopping sync.");
          return null;
        }

        // 2. Map users to [email, avatarUrl] for the update
        const data = snapshot.docs.map((doc) => [
          doc.data().email,
          doc.data().avatarUrl || "", // Get URL or empty string
        ]);

        // 3. Authenticate with Google Sheets (with write scope)
        const auth = new GoogleAuth({
          credentials: JSON.parse(GOOGLE_SHEETS_CREDENTIALS.value()),
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const sheetsClient = google.sheets({version: "v4", auth: client});

        // 4. Find all emails in the sheet to map them to row numbers
        // Note: This uses the helper, but the helper itself only has read scope.
        // We will create a quick local reader with the write-scoped client.
        const sheetEmailsRes = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: "Employees!B2:B",  // Column B contains emails
        });
        const sheetEmails = sheetEmailsRes.data.values;
        
        const emailToRow = {};
        if (sheetEmails) {
          sheetEmails.forEach((row, index) => {
            if (row[0]) {
              emailToRow[row[0]] = index + 2; // +2 for 1-based index and header row
            }
          });
        }

        // 5. Prepare batch update data
        const updateRequests = data
            .filter((user) => emailToRow[user[0]]) // Only update if email exists in sheet
            .map((user) => ({
              range: `Employees!C${emailToRow[user[0]]}`, // Column C
              values: [[user[1]]], // avatarUrl
            }));

        if (updateRequests.length === 0) {
          logger.log("No matching users found to update in sheet.");
          return null;
        }
        
        // 6. Send batch update to Google Sheets
        await sheetsClient.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            valueInputOption: "RAW",
            data: updateRequests,
          },
        });
    
    /**
     * Simple HTTP function to manually test the sync logic
     */
    exports.testSync = onCall(async (request) => {
      try {
        logger.log("Manual test sync triggered...");
        
        // Test Firestore connection first
        await testFirestoreConnection();
        
        logger.log(`Using SPREADSHEET_ID: ${SPREADSHEET_ID}`);
        
        if (!SPREADSHEET_ID) {
          logger.error("SPREADSHEET_ID is not defined!");
          return {success: false, error: "SPREADSHEET_ID not defined"};
        }
        
        const sheetsClient = await getGoogleSheetsClient();
        const data = await readSheetData(sheetsClient, "Employees!A2:B");
    
        if (!data || data.length === 0) {
          logger.log("No data found in sheet.");
          return {success: false, error: "No data found in sheet"};
        }
    
        logger.log(`Found ${data.length} rows in Google Sheets`);
    
        const batch = db.batch();
        const whitelistCollection = db.collection("whitelist");
    
        // 1. Get all existing emails in Firestore
        const snapshot = await whitelistCollection.get();
        const firestoreEmails = new Set(snapshot.docs.map((doc) => doc.id));
    
        // 2. Process sheet data
        // NOTE: Google Sheets has columns swapped: A=name, B=email
        for (const row of data) {
          const name = row[0] || "JLS Employee";  // Column A = name
          const email = row[1];                   // Column B = email

          if (email) {
            const userRef = whitelistCollection.doc(email);
            batch.set(userRef, {
              email: email,
              name: name,
            }, {merge: true}); // Use merge to avoid overwriting avatarUrl
            
            // Remove from the set, so only old emails remain
            firestoreEmails.delete(email);
          }
        }
        
        // 3. Delete users in Firestore that are no longer in the sheet
        firestoreEmails.forEach((email) => {
          logger.log(`Deleting old email: ${email}`);
          batch.delete(whitelistCollection.doc(email));
        });
    
        await batch.commit();
        logger.log(`Whitelist sync complete. ${data.length} users processed.`);
        return {success: true, usersProcessed: data.length, message: "Sync completed successfully"};
      } catch (err) {
        logger.error("Error in test sync:", err);
        return {success: false, error: err.message};
      }
    });
    
    /**
     * HTTP callable function to manually trigger whitelist sync for testing
     */
    exports.testSyncWhitelist = onCall(async (request) => {
      try {
        logger.log("Manual whitelist sync triggered...");
        logger.log(`Using SPREADSHEET_ID: ${SPREADSHEET_ID}`);
        
        if (!SPREADSHEET_ID) {
          logger.error("SPREADSHEET_ID is not defined!");
          return {success: false, error: "SPREADSHEET_ID not defined"};
        }
        
        const sheetsClient = await getGoogleSheetsClient();
        const data = await readSheetData(sheetsClient, "Employees!A2:B");
    
        if (!data || data.length === 0) {
          logger.log("No data found in sheet.");
          return {success: false, error: "No data found in sheet"};
        }
    
        const batch = db.batch();
        const whitelistCollection = db.collection("whitelist");
    
        // For Enterprise DB, we'll skip the deletion of old users and just add/update new ones
        // This avoids the RunQuery operation that's not supported in Enterprise DB
        logger.log("Processing sheet data for Enterprise Firestore database...");
    
        // Process sheet data - add/update users
        // NOTE: Google Sheets has columns swapped: A=name, B=email
        for (const row of data) {
          const name = row[0] || "JLS Employee";  // Column A = name
          const email = row[1];                   // Column B = email

          if (email) {
            const userRef = whitelistCollection.doc(email);
            batch.set(userRef, {
              email: email,
              name: name,
              lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, {merge: true}); // Use merge to avoid overwriting avatarUrl
            
            logger.log(`Adding/updating user: ${email} (${name})`);
          }
        }
    
        await batch.commit();
        logger.log(`Whitelist sync complete. ${data.length} users processed.`);
        return {success: true, usersProcessed: data.length};
      } catch (err) {
        logger.error("Error syncing whitelist:", err);
        return {success: false, error: err.message};
      }
    });

        logger.log(`Avatar sync to sheets complete. ${updateRequests.length} rows updated.`);
        return null;
      } catch (err) {
        logger.error("Error syncing avatars to sheets:", err);
        return null;
      }
    });