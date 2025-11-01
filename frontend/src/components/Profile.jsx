import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../firebase';

const Profile = () => {
  const { user, userProfile, signOut } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [currentProfile, setCurrentProfile] = useState(userProfile);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Update current profile when userProfile changes
  useEffect(() => {
    setCurrentProfile(userProfile);
  }, [userProfile]);

  // Load all users and their pet photos
  useEffect(() => {
    loadAllUsers();
  }, [user]);

  const loadAllUsers = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      
      // Get all users from whitelist collection
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/paws-of-jls/databases/(default)/documents/whitelist`,
        {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const users = [];
        
        if (data.documents) {
          for (const doc of data.documents) {
            const userData = {
              email: doc.fields.email?.stringValue || '',
              name: doc.fields.name?.stringValue || '',
              avatarUrl: doc.fields.avatarUrl?.stringValue || '',
              isCurrentUser: doc.fields.email?.stringValue === user.email
            };
            users.push(userData);
          }
        }
        
        // Sort users: current user first, then alphabetically
        users.sort((a, b) => {
          if (a.isCurrentUser) return -1;
          if (b.isCurrentUser) return 1;
          return a.name.localeCompare(b.name);
        });
        
        setAllUsers(users);
      }
    } catch (error) {
      console.error('Error loading all users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to refresh profile data using REST API
  const refreshProfile = async () => {
    if (!user?.email) return;
    
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/paws-of-jls/databases/(default)/documents/whitelist/${encodeURIComponent(user.email)}`,
        {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const docData = await response.json();
        if (docData.fields) {
          // Convert Firestore REST format to regular object
          const profileData = {
            name: docData.fields.name?.stringValue || '',
            email: docData.fields.email?.stringValue || user.email,
            avatarUrl: docData.fields.avatarUrl?.stringValue || ''
          };
          setCurrentProfile(profileData);
          
          // Reload all users to show updated data
          await loadAllUsers();
        }
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);
      setUploadError('');

      // Create a reference to the file location
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `pets/${user.uid}/${fileName}`);

      // Upload the file
      const snapshot = await uploadBytes(storageRef, file);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Call the saveUserAvatar function
      const saveUserAvatar = httpsCallable(functions, 'saveUserAvatar');
      await saveUserAvatar({ avatarUrl: downloadURL });

      // Refresh the profile to show the new avatar
      await refreshProfile();

      // Clear the file input
      event.target.value = '';

    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadError('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user || !currentProfile) {
    return (
      <div className="profile-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-card">
        <div className="profile-header">
          <h1>🐾 Paws of JLS</h1>
          <div className="header-actions">
            <span className="welcome-text">Welcome, {currentProfile.name}!</span>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>

        {/* Current User Upload Section */}
        <div className="upload-section">
          <h3>📸 Upload Your Pet Photo</h3>
          
          <div className="current-user-upload">
            <label htmlFor="pet-photo" className="upload-label">
              {currentProfile.avatarUrl ? 'Update Your Pet Photo' : 'Upload Your Pet Photo'}
            </label>
            
            <input
              id="pet-photo"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              className="file-input"
            />

            {uploading && (
              <div className="upload-status">
                <div className="spinner"></div>
                <span>Uploading your pet photo...</span>
              </div>
            )}

            {uploadError && (
              <div className="error-message">
                {uploadError}
              </div>
            )}

            <div className="upload-info">
              <p>📝 Share your pet with the JLS team!</p>
              <p className="file-requirements">
                • Image files only (JPG, PNG, GIF) • Maximum size: 5MB
              </p>
            </div>
          </div>
        </div>

        {/* All Users Gallery */}
        <div className="pets-gallery">
          <h3>🏢 JLS Team Pets Gallery</h3>
          
          {loading ? (
            <div className="loading">Loading team pets...</div>
          ) : (
            <div className="pets-grid">
              {allUsers.map((userData, index) => (
                <div 
                  key={userData.email} 
                  className={`pet-card ${userData.isCurrentUser ? 'current-user' : ''}`}
                >
                  <div className="pet-info">
                    <h4>{userData.name}</h4>
                    {userData.isCurrentUser && <span className="you-badge">You</span>}
                  </div>
                  
                  <div className="pet-photo-container">
                    {userData.avatarUrl ? (
                      <img 
                        src={userData.avatarUrl} 
                        alt={`${userData.name}'s pet`} 
                        className="pet-photo"
                      />
                    ) : (
                      <div className="no-pet-photo">
                        <span>🐾</span>
                        <p>No pet photo yet</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!loading && allUsers.length === 0 && (
            <div className="no-users">
              <p>No team members found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;