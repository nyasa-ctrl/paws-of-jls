Authentication System Guide
⚠️ CRITICAL: READ THIS FIRST ⚠️
IMMEDIATE ACTION REQUIRED: .gitignore Configuration
BEFORE creating any files or committing anything, you MUST create/update .gitignore:

# Run this command FIRST:

cat >> .gitignore << 'EOF'

# Authentication Documentation (contains sensitive setup info)

docs/guides/AUTHENTICATION_SYSTEM.md

AUTHENTICATION_SYSTEM.md

# Environment files (NEVER commit these)

.env

.env.local

.env.*.local

.env.production

.env.development

# Service Account Keys (NEVER commit these)

*.json

service-account*.json

firebase-adminsdk*.json

.secrets/

secrets/

EOF

This is NON-NEGOTIABLE. This file contains setup instructions that reference:

Service account configuration details
Spreadsheet structure and IDs
Security patterns and implementation details

While it contains no actual secrets, it MUST NOT be committed to prevent:

Exposing internal system architecture
Revealing employee data structure
Documenting authentication bypass attempts



Complete reference for implementing the Google Sheets + Firebase authentication system used in UnderOneSky Weather.


Table of Contents
System Overview
Prerequisites
Google Sheets Setup
Service Account Configuration
Firebase Setup
Firebase Functions Implementation
Avatar Management
Environment Variables
Implementation Steps
Security Rules
Testing
Troubleshooting


System Overview
Architecture
┌─────────────────┐

│ Google Sheets   │

│ Employee List   │──┐

└─────────────────┘  │

                     │ Daily Sync (2:00 AM UTC)

                     │ Firebase Function: scheduledSync

                     ▼

              ┌──────────────────┐

              │ Firestore        │

              │ /config/         │

              │ authorizedEmails │

              └──────────────────┘

                     │

                     │ Authorization Check

                     ▼

              ┌──────────────────┐

              │ Firebase Auth    │

              │ Google OAuth     │

              └──────────────────┘

                     │

                     ├─────────────────┐

                     ▼                 ▼

              ┌─────────────┐   ┌──────────────┐

              │ User Profile│   │ Firebase     │

              │ /users/     │   │ Storage      │

              │ {email}     │   │ /avatars/    │

              └─────────────┘   └──────────────┘

                                      │

                                      │ Weekly Sync (Sundays)

                                      │ Firebase Function: syncAvatars

                                      ▼

                                Google Profile Photos
Authentication Flow
Initial Sync: Daily Firebase Function imports emails and addresses from Google Sheets to Firestore
User Login: User clicks "Sign in with Google" → Firebase OAuth
Avatar Save: On first login, user avatar is downloaded from Google and saved to Firebase Storage
Authorization: System checks if user's email exists in authorized list
Profile Load: If authorized, load or create user profile with pre-populated data
Access Grant: User gains access to application
Weekly Avatar Sync: Automatic sync of profile photos from Google to Firebase Storage
Key Components
Google Sheets: Single source of truth for employee emails and addresses
Service Account: Server-side credentials for Google Sheets API access
Firebase Auth: Google OAuth provider for user authentication
Firebase Functions: Server-side scheduled tasks and HTTP endpoints
Firestore: Stores authorized emails and user profiles
Firebase Storage: Cloud storage for user avatars
Daily Sync: Automated job via Firebase Functions Scheduler
Avatar Sync: Weekly automated avatar synchronization


Prerequisites
Before implementing this authentication system, ensure you have:
Required Accounts
Google Cloud Platform account
Firebase project (Blaze plan for Cloud Functions)
Google Sheets with employee data
Required Tools
Node.js 18+ installed
Firebase CLI installed: npm install -g firebase-tools
Google Cloud SDK (gcloud CLI): https://cloud.google.com/sdk/docs/install


Google Sheets Setup
1. Spreadsheet Structure
Required Columns:

Column
Index
Data Type
Description
Example
T
19
Email
Employee email address
john.doe@company.com
W
22
Country
Country code (2-letter)
US
X
23
Address 1
Street address
123 Main St
Y
24
Address 2
Apartment/Suite (optional)
Apt 4B
Z
25
City
City name
New York
AA
26
State
State/Province code
NY
AB
27
Zip
Postal code
10001


Sheet Name: Info Database

Data Range: Info Database!A:AB (Firebase Function reads full range automatically)

IMPORTANT: Column T (index 19) is the PRIMARY email column. This is hardcoded in functions/src/index.ts:317:

.map(row => row[19]) // Column T (index 19) contains emails
2. Spreadsheet ID
The spreadsheet ID is found in the URL:

https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit

Example:

URL: https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID_HERE/edit

ID:  YOUR_SPREADSHEET_ID_HERE
3. Sample Data Format
Row 1 (Headers): ... | Email | Country | Address1 | Address2 | City | State | Zip

Row 2: ... | stevepetuskyjls@gmail.com | US | 123 Main St | Apt 4B | New York | NY | 10001

Row 3: ... | jane.smith@company.com    | CA | 456 Oak Ave |        | Toronto  | ON | M5V 1A1


Service Account Configuration
1. Create Service Account
Go to Google Cloud Console: https://console.cloud.google.com
Select your Firebase project
Navigate to: IAM & Admin → Service Accounts
Click: "Create Service Account"
Fill in:
Name: underonesky (or your app name)
Description: Service account for Google Sheets and Firebase access
Click: "Create and Continue"
Skip role assignment (not needed for Sheets API)
Click: "Done"
2. Generate Service Account Key
Find your service account in the list
Click the service account email
Go to: Keys tab
Click: "Add Key" → "Create new key"
Select: JSON format
Click: "Create"
Save the downloaded JSON file securely

Expected Filename Format: your-project-name-[key-id].json
3. Service Account JSON Structure
Your downloaded file will look like this:

{

  "type": "service_account",

  "project_id": "your-project-id",

  "private_key_id": "abc123...",

  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",

  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",

  "client_id": "123456789...",

  "auth_uri": "https://accounts.google.com/o/oauth2/auth",

  "token_uri": "https://oauth2.googleapis.com/token",

  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",

  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/...",

  "universe_domain": "googleapis.com"

}

CRITICAL: The client_email field is what you'll share with your spreadsheet.
4. Enable Google Sheets API
Go to: APIs & Services → Library
Search for: "Google Sheets API"
Click: Enable
5. Share Spreadsheet with Service Account
Open your Google Sheets spreadsheet
Click: Share button (top right)
Add: The service account email from client_email field
Example: underonesky@underonesky-jls.iam.gserviceaccount.com
Set permission: Viewer (read-only access)
Uncheck: "Notify people" (it's a service account, not a person)
Click: Share


Firebase Setup
1. Create Firebase Project
Go to: https://console.firebase.google.com
Click: "Add project" or select existing project
Enter: Project name
Enable: Google Analytics (optional)
Click: "Create project"
2. Upgrade to Blaze Plan
REQUIRED: Firebase Functions require the Blaze (pay-as-you-go) plan.

Go to: Firebase Console → Project Settings → Usage and Billing
Click: "Modify plan"
Select: Blaze plan
Set billing alerts (recommended)
3. Enable Google Authentication
In Firebase Console: Authentication → Sign-in method
Click: Google provider
Toggle: Enable
Configure:
Project support email: Your email
Project public-facing name: Your app name
Click: Save
4. Register Web App
In Firebase Console: Project settings (gear icon)
Scroll to: Your apps section
Click: Web app icon (</>)
Register app:
App nickname: Your app name
Firebase Hosting: Optional
Copy the Firebase config object (you'll need this)

Expected Config:

const firebaseConfig = {

  apiKey: "AIza...",

  authDomain: "your-project.firebaseapp.com",

  projectId: "your-project-id",

  storageBucket: "your-project.appspot.com",

  messagingSenderId: "123456789",

  appId: "1:123456789:web:abc123"

};
5. Create Firestore Database
In Firebase Console: Firestore Database
Click: "Create database"
Select: Production mode
Choose: Firestore location (e.g., us-central1)
Click: Enable
6. Create Firebase Storage Bucket
In Firebase Console: Storage
Click: "Get started"
Select: Production mode
Use default location (matches Firestore)
Click: Done


Firebase Functions Implementation
1. Initialize Firebase Functions
# Login to Firebase

firebase login

# Initialize Functions

firebase init functions

# Select:

# - TypeScript

# - ESLint

# - Install dependencies
2. Install Dependencies
cd functions

npm install firebase-admin googleapis

npm install --save-dev @types/node
3. Firebase Functions Secret Management
Firebase Functions v2 uses built-in secret management (not Google Cloud Secret Manager).

Store the service account JSON as a Firebase secret:

# Store Google Sheets service account credentials

firebase functions:secrets:set GOOGLE_SHEETS_CREDENTIALS

# When prompted, paste the ENTIRE JSON content from your service account file

# It should be a valid JSON object on a single line or properly formatted

# Store OpenWeather API key (if needed for geocoding)

firebase functions:secrets:set OPENWEATHER_API_KEY

# Enter your API key when prompted

Verify secrets are set:

firebase functions:secrets:access GOOGLE_SHEETS_CREDENTIALS
4. Define Environment Parameters
Create or update functions/.env:

# Google Sheets Spreadsheet ID

GOOGLE_SHEETS_SPREADSHEET_ID=YOUR_SPREADSHEET_ID_HERE
5. Create Google Sheets Library
Create functions/src/lib/google-sheets.ts:

import { google } from 'googleapis';

import { defineSecret } from 'firebase-functions/params';

export const googleSheetsCredentials = defineSecret('GOOGLE_SHEETS_CREDENTIALS');

export async function readSheetRange(spreadsheetId: string, range: string) {

  const credentials = JSON.parse(googleSheetsCredentials.value());

  

  const auth = new google.auth.GoogleAuth({

    credentials,

    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],

  });

  

  const sheets = google.sheets({ version: 'v4', auth });

  

  const response = await sheets.spreadsheets.values.get({

    spreadsheetId,

    range,

  });

  

  return response.data.values || [];

}

export function extractAddressFromRow(row: any[], emailColumnIndex: number) {

  // Column mapping from Google Sheets:

  // T (19) = email

  // W (22) = country (emailColumnIndex + 3)

  // X (23) = address1 (emailColumnIndex + 4)

  // Y (24) = address2 (emailColumnIndex + 5)

  // Z (25) = city (emailColumnIndex + 6)

  // AA (26) = state (emailColumnIndex + 7)

  // AB (27) = zip (emailColumnIndex + 8)

  return {

    country: row[emailColumnIndex + 3]?.toString().trim() || 'US',

    address1: row[emailColumnIndex + 4]?.toString().trim() || '',

    address2: row[emailColumnIndex + 5]?.toString().trim() || '',

    city: row[emailColumnIndex + 6]?.toString().trim() || '',

    state: row[emailColumnIndex + 7]?.toString().trim() || '',

    zip: row[emailColumnIndex + 8]?.toString().trim() || '',

  };

}
6. Create Scheduled Sync Function
Add to functions/src/index.ts:

import { onSchedule } from 'firebase-functions/v2/scheduler';

import { defineString } from 'firebase-functions/params';

import { db } from './lib/firebase-admin';

import * as sheets from './lib/google-sheets';

const spreadsheetId = defineString('GOOGLE_SHEETS_SPREADSHEET_ID');

// Sync emails and user data from Google Sheets daily at 2 AM UTC

export const scheduledSync = onSchedule(

  {

    schedule: '0 2 * * *',  // Daily at 2:00 AM UTC

    timeZone: 'UTC',

    secrets: [sheets.googleSheetsCredentials],

  },

  async (event) => {

    console.log('=== Scheduled Sync Started ===');

    console.log('Trigger time:', new Date().toISOString());

    

    try {

      const sheetId = spreadsheetId.value();

      

      // Read employee data from Google Sheets

      const rows = await sheets.readSheetRange(sheetId, 'Info Database!A:AB');

      

      if (rows.length === 0) {

        console.log('No data found in Google Sheets');

        return;

      }

      

      // Extract emails and store authorized list

      const emails = rows

        .map(row => row[19]) // Column T (index 19) contains emails

        .filter((email): email is string => 

          typeof email === 'string' && 

          email.trim() !== '' &&

          email.includes('@')

        )

        .map(email => email.trim().toLowerCase());

      

      // Store authorized emails

      await db.collection('config').doc('authorizedEmails').set({

        emails,

        lastSync: new Date().toISOString(),

      });

      

      console.log(`Stored ${emails.length} authorized emails`);

      

      // Process each user and store their data

      let processedCount = 0;

      

      for (const row of rows) {

        const email = row[19]?.toString().trim().toLowerCase();

        if (!email || !email.includes('@')) continue;

        

        const addressData = sheets.extractAddressFromRow(row, 19);

        

        // Only process if address data exists

        if (!addressData.city) continue;

        

        // Store user data (add geocoding here if needed)

        await db.collection('users').doc(email).set({

          email,

          address: addressData,

          lastSync: new Date().toISOString(),

        }, { merge: true });

        

        processedCount++;

      }

      

      console.log(`=== Scheduled Sync Completed ===`);

      console.log(`Processed ${processedCount} users`);

      

    } catch (error) {

      console.error('=== Scheduled Sync Failed ===');

      console.error('Error:', error);

      throw error;

    }

  }

);
7. Deploy Functions
# Deploy all functions

firebase deploy --only functions

# Or deploy specific function

firebase deploy --only functions:scheduledSync


Avatar Management
Two-Part Avatar System
Immediate Upload (saveUserAvatar): Saves avatar when user first logs in
Weekly Sync (syncAvatars): Keeps avatars up-to-date with Google profile changes
1. Save User Avatar (On-Demand HTTP Function)
Create functions/src/http/saveUserAvatar.ts:

import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { getStorage } from 'firebase-admin/storage';

import { db } from '../lib/firebase-admin';

export const saveUserAvatar = onCall(

  {

    timeoutSeconds: 60,

  },

  async (request) => {

    const startTime = Date.now();

    console.log('=== Save User Avatar Started ===');

    

    try {

      const { email, photoURL } = request.data;

      if (!email) {

        throw new HttpsError('invalid-argument', 'email is required');

      }

      if (!photoURL) {

        throw new HttpsError('invalid-argument', 'photoURL is required');

      }

      console.log(`Email: ${email}`);

      console.log(`Photo URL: ${photoURL}`);

      // Download image from Google

      const response = await fetch(photoURL);

      

      if (!response.ok) {

        throw new HttpsError(

          'failed-precondition',

          `Failed to fetch avatar: ${response.statusText}`

        );

      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());

      const contentType = response.headers.get('content-type') || 'image/jpeg';

      

      console.log(`Downloaded image: ${imageBuffer.length} bytes, type: ${contentType}`);

      // Generate storage path

      const sanitizedEmail = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');

      const timestamp = Date.now();

      const avatarPath = `avatars/${sanitizedEmail}/${timestamp}.jpg`;

      

      // Upload to Firebase Storage

      const bucket = getStorage().bucket();

      const file = bucket.file(avatarPath);

      

      await file.save(imageBuffer, {

        metadata: {

          contentType: contentType,

          metadata: {

            email: email,

            uploadedAt: new Date().toISOString(),

            source: 'google',

            originalUrl: photoURL,

          },

        },

      });

      // Make the file publicly accessible

      await file.makePublic();

      

      // Get public URL

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${avatarPath}`;

      

      console.log(`Avatar uploaded to: ${avatarPath}`);

      console.log(`Public URL: ${publicUrl}`);

      // Update user profile with new avatar URL and metadata

      await db.collection('users').doc(email).set({

        photoURL: publicUrl,

        avatarStoragePath: avatarPath,

        avatarLastChecked: new Date().toISOString(),

        avatarVersion: 1,

      }, { merge: true });

      const elapsed = (Date.now() - startTime) / 1000;

      console.log('=== Save User Avatar Completed ===');

      console.log(`Execution time: ${elapsed.toFixed(2)}s`);

      return {

        success: true,

        avatarUrl: publicUrl,

        storagePath: avatarPath,

      };

    } catch (error) {

      const elapsed = (Date.now() - startTime) / 1000;

      console.error('=== Save User Avatar Failed ===');

      console.error(`Execution time before error: ${elapsed.toFixed(2)}s`);

      console.error('Error:', error);

      

      if (error instanceof HttpsError) {

        throw error;

      }

      

      throw new HttpsError(

        'internal',

        error instanceof Error ? error.message : 'Failed to save user avatar'

      );

    }

  }

);
2. Sync Avatars (Weekly Scheduled Function)
Create functions/src/scheduled/syncAvatars.ts:

import { onSchedule } from 'firebase-functions/v2/scheduler';

import admin, { db } from '../lib/firebase-admin';

export const syncAvatars = onSchedule(

  {

    schedule: '0 0 * * 0', // Sunday at midnight UTC

    timeZone: 'UTC',

    timeoutSeconds: 540,

    memory: '512MiB',

  },

  async (event) => {

    const startTime = Date.now();

    console.log('=== Avatar Sync Started ===');

    console.log('Trigger time:', new Date().toISOString());

    try {

      // Get all users from Firestore

      const usersSnapshot = await db.collection('users').get();

      console.log(`Found ${usersSnapshot.size} total users`);

      let processedCount = 0;

      let updatedCount = 0;

      let skippedCount = 0;

      let errorCount = 0;

      const sevenDaysAgo = new Date();

      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Process each user

      for (const userDoc of usersSnapshot.docs) {

        const email = userDoc.id;

        const userData = userDoc.data();

        // Skip users without Google photo URL

        if (!userData.avatarGooglePhotoUrl) {

          skippedCount++;

          continue;

        }

        // Skip if checked within last 7 days

        if (userData.avatarLastChecked) {

          const lastChecked = new Date(userData.avatarLastChecked);

          if (lastChecked > sevenDaysAgo) {

            skippedCount++;

            continue;

          }

        }

        processedCount++;

        console.log(`Processing ${email}...`);

        try {

          const googlePhotoUrl = userData.avatarGooglePhotoUrl;

          // Try to fetch the image from Google

          const response = await fetch(googlePhotoUrl);

          if (!response.ok) {

            console.log(`Google photo URL no longer valid for ${email}, skipping`);

            errorCount++;

            continue;

          }

          // Download the image

          const arrayBuffer = await response.arrayBuffer();

          const buffer = Buffer.from(arrayBuffer);

          // Create sanitized storage path

          const sanitizedEmail = email.replace(/[^a-zA-Z0-9@.-]/g, '_');

          const timestamp = Date.now();

          const storagePath = `avatars/${sanitizedEmail}/${timestamp}.jpg`;

          // Upload to Firebase Storage

          const file = admin.storage().bucket().file(storagePath);

          await file.save(buffer, {

            metadata: {

              contentType: 'image/jpeg',

              metadata: {

                email,

                uploadedAt: new Date().toISOString(),

                source: 'google-sync',

                originalUrl: googlePhotoUrl,

              },

            },

          });

          // Make the file public

          await file.makePublic();

          // Get the public URL

          const publicUrl = `https://storage.googleapis.com/${admin.storage().bucket().name}/${storagePath}`;

          console.log(`Avatar synced for ${email}: ${publicUrl}`);

          // Delete old avatar if it exists

          if (userData.avatarStoragePath) {

            try {

              const oldFile = admin.storage().bucket().file(userData.avatarStoragePath);

              await oldFile.delete();

              console.log(`Deleted old avatar: ${userData.avatarStoragePath}`);

            } catch (deleteErr) {

              console.log(`Could not delete old avatar for ${email}:`, deleteErr);

            }

          }

          // Update user profile in Firestore

          await db.collection('users').doc(email).update({

            photoURL: publicUrl,

            avatarStoragePath: storagePath,

            avatarLastChecked: new Date().toISOString(),

            avatarGooglePhotoUrl: googlePhotoUrl,

            updatedAt: new Date().toISOString(),

          });

          updatedCount++;

          console.log(`Successfully synced avatar for ${email}`);

        } catch (error) {

          console.error(`Error syncing avatar for ${email}:`, error);

          errorCount++;

          // Update lastChecked timestamp even on error to avoid retry loops

          try {

            await db.collection('users').doc(email).update({

              avatarLastChecked: new Date().toISOString(),

            });

          } catch (updateErr) {

            console.error(`Failed to update lastChecked for ${email}:`, updateErr);

          }

        }

      }

      const elapsed = (Date.now() - startTime) / 1000;

      console.log('=== Avatar Sync Completed ===');

      console.log(`Execution time: ${elapsed.toFixed(2)}s`);

      console.log(`Total users: ${usersSnapshot.size}`);

      console.log(`Processed: ${processedCount}`);

      console.log(`Updated: ${updatedCount}`);

      console.log(`Skipped: ${skippedCount}`);

      console.log(`Errors: ${errorCount}`);

    } catch (error) {

      const elapsed = (Date.now() - startTime) / 1000;

      console.error('=== Avatar Sync Failed ===');

      console.error(`Execution time before error: ${elapsed.toFixed(2)}s`);

      console.error('Error:', error);

      throw error;

    }

  }

);
3. Export Functions
Add to functions/src/index.ts:

// Avatar Functions

export { saveUserAvatar } from './http/saveUserAvatar';

export { syncAvatars } from './scheduled/syncAvatars';
4. Call saveUserAvatar from Frontend
In your onboarding or login flow:

import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

const saveAvatarFunction = httpsCallable(functions, 'saveUserAvatar');

// After user logs in with Google

const user = auth.currentUser;

if (user && user.photoURL) {

  try {

    const result = await saveAvatarFunction({

      email: user.email,

      photoURL: user.photoURL

    });

    console.log('Avatar saved:', result.data);

  } catch (error) {

    console.error('Failed to save avatar:', error);

  }

}


Environment Variables
Firebase Functions Environment
Firebase Functions use:

Secrets (via defineSecret()) - for sensitive credentials
Parameters (via defineString()) - for configuration

Set up secrets:

# Google Sheets service account (paste entire JSON)

firebase functions:secrets:set GOOGLE_SHEETS_CREDENTIALS

# OpenWeather API key (if using geocoding)

firebase functions:secrets:set OPENWEATHER_API_KEY

Create functions/.env for parameters:

GOOGLE_SHEETS_SPREADSHEET_ID=YOUR_SPREADSHEET_ID_HERE
Frontend Environment Variables
Create .env in project root:

# Firebase Web App Config

VITE_FIREBASE_API_KEY=AIzaSy...

VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com

VITE_FIREBASE_PROJECT_ID=your-project-id

VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com

VITE_FIREBASE_MESSAGING_SENDER_ID=123456789

VITE_FIREBASE_APP_ID=1:123456789:web:abc123


Implementation Steps
Step 1: Configure Firebase Client
Create src/lib/firebase/config.ts:

import { initializeApp } from 'firebase/app';

import { getAuth } from 'firebase/auth';

import { getFirestore } from 'firebase/firestore';

import { getFunctions } from 'firebase/functions';

import { getStorage } from 'firebase/storage';

const firebaseConfig = {

  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,

  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,

  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,

  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,

  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,

  appId: import.meta.env.VITE_FIREBASE_APP_ID,

};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const functions = getFunctions(app);

export const storage = getStorage(app);
Step 2: Implement Google Auth
Create src/lib/firebase/auth.ts:

import {

  signInWithPopup,

  GoogleAuthProvider,

  signOut as firebaseSignOut,

  onAuthStateChanged

} from 'firebase/auth';

import type { User } from 'firebase/auth';

import { auth } from './config';

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {

  try {

    const result = await signInWithPopup(auth, googleProvider);

    return result.user;

  } catch (error) {

    console.error('Error signing in with Google:', error);

    throw error;

  }

};

export const signOut = async () => {

  try {

    await firebaseSignOut(auth);

  } catch (error) {

    console.error('Error signing out:', error);

    throw error;

  }

};

export const onAuthStateChange = (callback: (user: User | null) => void) => {

  return onAuthStateChanged(auth, callback);

};

export { auth };
Step 3: Implement Authorization Check
Create src/lib/firebase/firestore.ts:

import { doc, getDoc } from 'firebase/firestore';

import { db } from './config';

export const getAuthorizedEmails = async (): Promise<string[]> => {

  try {

    const docRef = doc(db, 'config', 'authorizedEmails');

    const docSnap = await getDoc(docRef);

    

    if (docSnap.exists()) {

      const data = docSnap.data();

      return (data.emails || []) as string[];

    }

    

    return [];

  } catch (error) {

    console.error('Error getting authorized emails:', error);

    return [];

  }

};
Step 4: Create Auth Context
Create src/contexts/AuthContext.tsx:

import { createContext, useEffect, useState } from 'react';

import type { ReactNode } from 'react';

import type { User } from 'firebase/auth';

import { onAuthStateChange, signOut as firebaseSignOut } from '../lib/firebase/auth';

import { getAuthorizedEmails } from '../lib/firebase/firestore';

interface AuthContextType {

  user: User | null;

  loading: boolean;

  error: string | null;

  isAuthorized: boolean;

  signOut: () => Promise<void>;

}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {

  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [isAuthorized, setIsAuthorized] = useState(false);

  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([]);

  const [emailsLoaded, setEmailsLoaded] = useState(false);

  // Load authorized emails on mount

  useEffect(() => {

    const loadAuthorizedEmails = async () => {

      try {

        const emails = await getAuthorizedEmails();

        setAuthorizedEmails(emails);

        setEmailsLoaded(true);

      } catch (err) {

        console.error('Error loading authorized emails:', err);

        setEmailsLoaded(true);

      }

    };

    loadAuthorizedEmails();

  }, []);

  // Listen to auth state changes - ONLY after emails are loaded

  useEffect(() => {

    if (!emailsLoaded) return;

    const unsubscribe = onAuthStateChange(async (firebaseUser) => {

      setLoading(true);

      setError(null);

      if (firebaseUser) {

        const userEmail = firebaseUser.email?.toLowerCase() || '';

        const authorized = authorizedEmails.some(

          (email) => email.toLowerCase() === userEmail

        );

        if (authorized) {

          setUser(firebaseUser);

          setIsAuthorized(true);

        } else {

          setError('Your email is not authorized to access this application.');

          setIsAuthorized(false);

          setUser(null);

          await firebaseSignOut();

        }

      } else {

        setUser(null);

        setIsAuthorized(false);

      }

      setLoading(false);

    });

    return () => unsubscribe();

  }, [authorizedEmails, emailsLoaded]);

  const signOut = async () => {

    try {

      await firebaseSignOut();

      setUser(null);

      setIsAuthorized(false);

      setError(null);

    } catch (err) {

      console.error('Error signing out:', err);

      setError('Failed to sign out. Please try again.');

      throw err;

    }

  };

  const value: AuthContextType = {

    user,

    loading,

    error,

    isAuthorized,

    signOut,

  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

}


Security Rules
Firestore Security Rules
Create/update firestore.rules:

rules_version = '2';

service cloud.firestore {

  match /databases/{database}/documents {

    

    // Helper: Check if user is authenticated

    function isAuthenticated() {

      return request.auth != null;

    }

    

    // CONFIG COLLECTION: Authorized emails readable by anyone

    // CRITICAL: Needed for pre-authentication authorization check

    match /config/authorizedEmails {

      allow read: if true;  // Public read (only contains email list)

      allow write: if false; // Server-side only

    }

    

    // USERS COLLECTION: User profiles and data

    // Email is used as document ID

    match /users/{email} {

      // Any authenticated user can read (for team features)

      allow read: if isAuthenticated();

      

      // Users can only write their own data

      allow write: if isAuthenticated() && request.auth.token.email == email;

    }

    

    // DEFAULT DENY: All other collections

    match /{document=**} {

      allow read, write: if false;

    }

  }

}
Firebase Storage Security Rules
Create/update storage.rules:

rules_version = '2';

service firebase.storage {

  match /b/{bucket}/o {

    

    // Avatars are publicly readable, user-writable

    match /avatars/{email}/{filename} {

      // Anyone can read

      allow read: if true;

      

      // Only the user themselves can write

      allow write: if request.auth != null && request.auth.token.email == email;

    }

    

    // Default deny

    match /{allPaths=**} {

      allow read, write: if false;

    }

  }

}

Deploy rules:

firebase deploy --only firestore:rules,storage:rules


Testing
Step 1: Test Firebase Functions Locally
# Start Functions emulator

firebase emulators:start --only functions

# Test scheduled sync manually

# This won't work directly - scheduled functions need to be triggered via Firebase Console

# Instead, create a manual trigger function for testing
Step 2: Test Manual Sync
Add a manual trigger to functions/src/index.ts:

import { onRequest } from 'firebase-functions/v2/https';

export const manualSync = onRequest(

  {

    secrets: [sheets.googleSheetsCredentials],

  },

  async (req, res) => {

    // Same logic as scheduledSync

    // ... (copy the scheduledSync implementation)

    

    res.json({ success: true, message: 'Sync completed' });

  }

);

Test it:

# Deploy the manual trigger

firebase deploy --only functions:manualSync

# Trigger it via HTTP

curl https://your-region-your-project.cloudfunctions.net/manualSync
Step 3: Verify Firestore Data
Open Firebase Console → Firestore Database
Check /config/authorizedEmails:

{

  "emails": ["user1@company.com", "user2@company.com"],

  "lastSync": "2025-10-22T02:00:00Z"

}

Check /users/{email}:

{

  "email": "user@company.com",

  "address": {

    "country": "US",

    "address1": "123 Main St",

    "city": "New York",

    "state": "NY",

    "zip": "10001"

  }

}
Step 4: Test Login Flow
Navigate to login page
Click "Sign in with Google"
Select an authorized email account
Verify:
✅ User is authenticated
✅ isAuthorized is true
✅ Avatar is saved to Firebase Storage
✅ Redirected to app (not blocked)
Step 5: Test Unauthorized Email
Sign out
Sign in with an email NOT in authorized list
Verify:
❌ User is NOT authorized
⚠️ Error message shown
🚪 User is automatically signed out
Step 6: Test Avatar Functions
Test immediate avatar save:

// In browser console after login

const functions = getFunctions();

const saveAvatar = httpsCallable(functions, 'saveUserAvatar');

const result = await saveAvatar({

  email: 'test@example.com',

  photoURL: 'https://lh3.googleusercontent.com/...'

});

console.log(result);

Verify avatar in Storage:

Firebase Console → Storage
Check avatars/{email}/{timestamp}.jpg exists
Verify file is public
Test public URL in browser


Troubleshooting
Issue: "The caller does not have permission"
Cause: Service account doesn't have access to spreadsheet

Solution:

Open Google Sheets
Click Share
Add service account email: your-account@your-project.iam.gserviceaccount.com
Set to Viewer
Save
Issue: "Secret not found: GOOGLE_SHEETS_CREDENTIALS"
Cause: Secret not properly configured

Solution:

# Set the secret

firebase functions:secrets:set GOOGLE_SHEETS_CREDENTIALS

# Paste the entire JSON content when prompted

# Verify it was set

firebase functions:secrets:access GOOGLE_SHEETS_CREDENTIALS
Issue: "Scheduled function not running"
Cause: Functions not deployed or schedule not triggered

Solution:

Deploy functions: firebase deploy --only functions
Check Firebase Console → Functions → Logs
Scheduled functions show in Firebase Console → Functions (with schedule icon)
Wait for next scheduled time or test with manual trigger
Issue: "Avatar upload fails"
Cause: Storage rules or permissions issue

Solution:

Check storage.rules allows writes to /avatars/{email}/
Deploy storage rules: firebase deploy --only storage:rules
Verify user is authenticated
Check Firebase Console → Storage for error logs
Issue: "User authorized but redirect loops"
Cause: Missing user profile or security rules blocking access

Solution:

Check Firestore /users/{email} document exists
Verify security rules allow authenticated read
Check browser console for specific error


Summary Checklist
Setup Phase
Create Google Sheets with employee data (column T for email, W-AB for addresses)
Note Spreadsheet ID from URL
Create Google Cloud service account
Download service account JSON
Enable Google Sheets API
Share spreadsheet with service account email (Viewer access)
Create Firebase project (Blaze plan)
Enable Google Auth in Firebase
Create Firestore database
Create Firebase Storage bucket
Firebase Functions Setup
Initialize Firebase Functions: firebase init functions
Install dependencies: firebase-admin, googleapis
Store secrets: firebase functions:secrets:set GOOGLE_SHEETS_CREDENTIALS
Create functions/.env with GOOGLE_SHEETS_SPREADSHEET_ID
Create functions/src/lib/google-sheets.ts
Create functions/src/index.ts with scheduledSync
Create functions/src/http/saveUserAvatar.ts
Create functions/src/scheduled/syncAvatars.ts
Deploy functions: firebase deploy --only functions
Frontend Setup
Configure Firebase client (config.ts)
Implement Google auth (auth.ts)
Implement auth context (AuthContext.tsx)
Add avatar save call after login
Deploy Firestore security rules
Deploy Storage security rules
Testing Phase
Test service account access to spreadsheet
Run initial sync manually
Verify data in Firestore (/config/authorizedEmails and /users)
Test login with authorized email
Test login with unauthorized email (should be rejected)
Test avatar upload and storage
Verify weekly sync schedule in Firebase Console


Quick Reference
Common Commands
# Firebase Functions

firebase login

firebase init functions

firebase deploy --only functions

firebase deploy --only functions:scheduledSync

firebase emulators:start --only functions

# Secrets Management

firebase functions:secrets:set GOOGLE_SHEETS_CREDENTIALS

firebase functions:secrets:access GOOGLE_SHEETS_CREDENTIALS

firebase functions:secrets:destroy GOOGLE_SHEETS_CREDENTIALS

# Deploy Security Rules

firebase deploy --only firestore:rules

firebase deploy --only storage:rules

# View Logs

firebase functions:log

firebase functions:log --only scheduledSync
Firestore Paths
/config/authorizedEmails      # List of authorized emails (public read)

/users/{email}                 # User profiles and addresses

/avatars/{email}/{timestamp}   # User avatar files in Storage
Cron Schedule Examples
0 2 * * *    - Daily at 2:00 AM UTC (scheduledSync)

0 0 * * 0    - Weekly on Sunday at midnight UTC (syncAvatars)

0 */12 * * * - Every 12 hours

0 1 1 * *    - Monthly on the 1st at 1:00 AM



Last Updated: October 2025
System Version: v2.0 (Firebase Functions)
Reference Implementation: UnderOneSky Weather App

