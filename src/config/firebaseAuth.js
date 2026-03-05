// Firebase Authentication Utilities
const { auth: firebaseAuth, apiKey } = require('./firebase');
const axios = require('axios');

/**
 * Verify email and password with Firebase REST API
 * This allows backend to verify credentials without client-side Firebase SDK
 */
exports.verifyEmailPassword = async (email, password) => {
  try {
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not configured');
    }

    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );

    return {
      uid: response.data.localId,
      idToken: response.data.idToken,
      refreshToken: response.data.refreshToken,
      email: response.data.email,
    };
  } catch (error) {
    if (error.response?.data?.error?.message === 'INVALID_PASSWORD') {
      throw new Error('Invalid email or password');
    }
    if (error.response?.data?.error?.message === 'EMAIL_NOT_FOUND') {
      throw new Error('Invalid email or password');
    }
    throw error;
  }
};

/**
 * Create Firebase user with email only (no password)
 * Then send password reset email so they can set their own password
 */
exports.createFirebaseUserNoPassword = async (email, displayName = null) => {
  try {
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not configured');
    }

    // Create user with temporary password
    const tempPassword = Math.random().toString(36).slice(-12) + 'Temp@123';

    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        email,
        password: tempPassword,
        displayName,
        returnSecureToken: true,
      }
    );

    return {
      uid: response.data.localId,
      email: response.data.email,
      idToken: response.data.idToken,
    };
  } catch (error) {
    if (error.response?.data?.error?.message === 'EMAIL_EXISTS') {
      throw new Error('Email already exists');
    }
    throw error;
  }
};

/**
 * Create Firebase user with email and password
 */
exports.createFirebaseUser = async (email, password, displayName = null) => {
  try {
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not configured');
    }

    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        email,
        password,
        displayName,
        returnSecureToken: true,
      }
    );

    return {
      uid: response.data.localId,
      email: response.data.email,
      idToken: response.data.idToken,
    };
  } catch (error) {
    if (error.response?.data?.error?.message === 'EMAIL_EXISTS') {
      throw new Error('Email already exists');
    }
    throw error;
  }
};

/**
 * Change Firebase user password
 */
exports.changeFirebasePassword = async (idToken, newPassword) => {
  try {
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not configured');
    }

    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
      {
        idToken,
        password: newPassword,
        returnSecureToken: true,
      }
    );

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Send password reset email
 */
exports.sendPasswordResetEmail = async (email) => {
  try {
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not configured');
    }

    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        requestType: 'PASSWORD_RESET',
        email,
      }
    );

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Delete Firebase user from Admin SDK
 */
exports.deleteFirebaseUser = async (uid) => {
  try {
    await firebaseAuth.deleteUser(uid);
    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Get Firebase user by email
 */
exports.getFirebaseUserByEmail = async (email) => {
  try {
    const user = await firebaseAuth.getUserByEmail(email);
    return user;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
};

/**
 * Create custom token for client authentication
 */
exports.createCustomToken = async (uid, customClaims = {}) => {
  try {
    const token = await firebaseAuth.createCustomToken(uid, customClaims);
    return token;
  } catch (error) {
    throw error;
  }
};

/**
 * Set custom claims for user (for authorization)
 */
exports.setCustomClaims = async (uid, customClaims) => {
  try {
    await firebaseAuth.setCustomUserClaims(uid, customClaims);
    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Refresh ID token using refresh token
 * This gets a NEW ID token that includes any custom claims that were set after the original token was issued
 */
exports.refreshIdToken = async (refreshToken) => {
  try {
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not configured');
    }

    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }
    );

    return {
      idToken: response.data.id_token,
      refreshToken: response.data.refresh_token,
    };
  } catch (error) {
    console.error('Error refreshing token:', error.message);
    throw error;
  }
};

/**
 * Get Firebase user by UID
 */
exports.getFirebaseUser = async (uid) => {
  try {
    const user = await firebaseAuth.getUser(uid);
    return user;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
};
