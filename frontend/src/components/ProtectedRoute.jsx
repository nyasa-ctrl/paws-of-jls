import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, isAuthorized, loading } = useAuth();

  console.log('🛡️ ProtectedRoute - State:', {
    user: user ? user.email : 'null',
    isAuthorized,
    loading,
    timestamp: new Date().toISOString()
  });

  // Show loading while checking authentication
  if (loading) {
    console.log('⏳ ProtectedRoute - Showing loading state');
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // If not logged in, redirect to login
  if (!user) {
    console.log('🔄 ProtectedRoute - No user, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // If logged in but not authorized, redirect to access denied
  if (user && isAuthorized === false) {
    console.log('🚫 ProtectedRoute - User not authorized, redirecting to access denied');
    return <Navigate to="/access-denied" replace />;
  }

  // If logged in and authorized, show the protected content
  if (user && isAuthorized === true) {
    console.log('✅ ProtectedRoute - User authorized, showing protected content');
    return children;
  }

  // Default loading state while authorization is being checked
  console.log('⏳ ProtectedRoute - Checking authorization...');
  return (
    <div className="loading-container">
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Checking authorization...</p>
      </div>
    </div>
  );
};

export default ProtectedRoute;