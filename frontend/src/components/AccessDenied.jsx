import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const AccessDenied = () => {
  const { signOut, user } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="access-denied-container">
      <div className="access-denied-card">
        <div className="access-denied-header">
          <h1>🚫 Access Denied</h1>
        </div>
        
        <div className="access-denied-content">
          <p>This app is for JLS employees only.</p>
          <p>Please contact IT if you believe this is a mistake.</p>
          
          {user && (
            <div className="user-info">
              <p>Signed in as: <strong>{user.email}</strong></p>
            </div>
          )}
          
          <button 
            onClick={handleLogout}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;