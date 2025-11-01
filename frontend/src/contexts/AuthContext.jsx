import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  // Check if user is authorized by checking whitelist collection directly
  const checkAuthorization = async (user) => {
    console.log('🔍 Checking authorization for user:', user?.email);
    
    if (!user?.email) {
      console.log('❌ No user email found');
      setIsAuthorized(false);
      setUserProfile(null);
      return false;
    }

    const userEmail = user.email.toLowerCase();
    
    try {
      console.log('🔍 Checking Firestore whitelist...');
      
      // Try to use Firestore SDK with timeout and fallback
      const whitelistDocRef = doc(db, 'whitelist', userEmail);
      
      // Set a timeout for the Firestore operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Firestore timeout')), 10000);
      });
      
      const docPromise = getDoc(whitelistDocRef);
      
      try {
        const whitelistDoc = await Promise.race([docPromise, timeoutPromise]);
        
        if (whitelistDoc.exists()) {
          console.log('✅ User authorized via Firestore whitelist:', userEmail);
          const whitelistData = whitelistDoc.data();
          
          const profileData = {
            name: whitelistData.name || user.displayName || 'JLS Employee',
            email: userEmail,
            avatarUrl: whitelistData.avatarUrl || user.photoURL || ''
          };
          
          console.log('📄 User profile loaded from Firestore whitelist:', profileData);
          setUserProfile(profileData);
          setIsAuthorized(true);
          return true;
        } else {
          console.log('❌ User not found in Firestore whitelist:', userEmail);
          setIsAuthorized(false);
          setUserProfile(null);
          return false;
        }
      } catch (firestoreError) {
        console.warn('⚠️ Firestore SDK failed, trying REST API fallback:', firestoreError.message);
        
        // Fallback to REST API
        const idToken = await user.getIdToken();
        const projectId = 'paws-of-jls';
        
        // Properly encode the email for URL
        const encodedEmail = encodeURIComponent(userEmail);
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/whitelist/${encodedEmail}`;
        
        console.log('🔍 Trying REST API fallback...');
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ User authorized via REST API fallback:', userEmail);
          
          // Extract data from Firestore REST API format
          const whitelistData = {};
          if (data.fields) {
            Object.keys(data.fields).forEach(key => {
              const field = data.fields[key];
              if (field.stringValue) whitelistData[key] = field.stringValue;
              else if (field.booleanValue !== undefined) whitelistData[key] = field.booleanValue;
              else if (field.integerValue) whitelistData[key] = parseInt(field.integerValue);
              else if (field.doubleValue) whitelistData[key] = parseFloat(field.doubleValue);
            });
          }
          
          const profileData = {
            name: whitelistData.name || user.displayName || 'JLS Employee',
            email: userEmail,
            avatarUrl: whitelistData.avatarUrl || user.photoURL || ''
          };
          
          console.log('📄 User profile loaded via REST API:', profileData);
          setUserProfile(profileData);
          setIsAuthorized(true);
          return true;
        } else if (response.status === 404) {
          console.log('❌ User not found in whitelist (REST API):', userEmail);
          setIsAuthorized(false);
          setUserProfile(null);
          return false;
        } else {
          console.error('� REST API also failed:', response.status, response.statusText);
          setIsAuthorized(false);
          setUserProfile(null);
          return false;
        }
      }
    } catch (error) {
      console.error('💥 Authorization check completely failed:', error);
      setIsAuthorized(false);
      setUserProfile(null);
      return false;
    }
  };

  // Sign in with Google using popup
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      console.log('🚀 Starting Google sign-in popup...');
      const result = await signInWithPopup(auth, googleProvider);
      console.log('✅ Google sign-in successful:', result.user.email);
      // The auth state listener will handle the rest
    } catch (error) {
      console.error('💥 Error signing in with Google:', error);
      console.error('Error details:', error.code, error.message);
      setLoading(false);
      throw error;
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setIsAuthorized(null);
      setUserProfile(null);
      console.log('👋 User signed out');
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  // Listen to auth state changes
  useEffect(() => {
    console.log('👂 Setting up auth state listener...');
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔄 Auth state changed:', firebaseUser ? `User: ${firebaseUser.email}` : 'No user');
      setLoading(true);
      
      if (firebaseUser) {
        console.log('👤 User found, checking authorization...');
        const authorized = await checkAuthorization(firebaseUser);
        
        if (authorized) {
          setUser(firebaseUser);
          console.log('✅ User set and authorized');
        } else {
          console.log('🚫 User not authorized, signing out...');
          await firebaseSignOut(auth);
          setUser(null);
          setIsAuthorized(false);
          setUserProfile(null);
        }
      } else {
        console.log('👤 No user, clearing auth state');
        setUser(null);
        setIsAuthorized(null);
        setUserProfile(null);
      }
      
      setLoading(false);
      console.log('✅ Auth state processing complete');
    });

    return unsubscribe;
  }, []);

  const value = {
    user,
    isAuthorized,
    userProfile,
    loading,
    signInWithGoogle,
    signOut,
    checkAuthorization
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};