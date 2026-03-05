// Get Vendor Profile (by authenticated vendor)
exports.getVendorProfile = async (req, res) => {
  try {
    // req.user is set by authenticateToken middleware
    if (!req.user || req.user.type !== 'vendor') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const vendorId = req.user.vendor_id;
    const { data, error } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('vendor_id', vendorId)
      .single();
    if (error || !data) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }
    res.json({ supplier: data });
  } catch (error) {
    console.error('Error fetching vendor profile:', error);
    res.status(500).json({ error: error.message });
  }
};
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const firebaseAuthUtils = require('../config/firebaseAuth');
const { auth: firebaseAuth } = require('../config/firebase');

// Register Vendor
exports.registerVendor = async (req, res) => {
  try {
    const {
      company_name,
      company_tin,
      address,
      contact_person,
      contact_email,
      contact_phone,
      company_website,
      certificate_url,
    } = req.body;

    // Validation
    if (!company_name || !contact_email) {
      return res.status(400).json({ error: 'Company name and email are required' });
    }

    // Check if email already exists
    const { data: existingVendor, error: checkError } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('contact_email', contact_email)
      .single();

    if (!checkError && existingVendor) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create Firebase user WITHOUT password
    let firebaseUser;
    try {
      firebaseUser = await firebaseAuthUtils.createFirebaseUserNoPassword(contact_email, company_name);
    } catch (firebaseError) {
      console.error('Firebase user creation error:', firebaseError.message);
      return res.status(400).json({ 
        error: firebaseError.message || 'Failed to create account' 
      });
    }

    // Create registration request in database
    const vendorId = uuidv4();
    const { data, error } = await supabase
      .from('vendorregistration')
      .insert([
        {
          vendor_id: vendorId,
          firebase_uid: firebaseUser.uid,
          company_name,
          company_tin: company_tin || null,
          address: address || null,
          contact_person: contact_person || null,
          contact_email,
          contact_phone: contact_phone || null,
          company_website: company_website || null,
          certificate_url: certificate_url || null,
          certificate_status: 'pending',
          certificate_verified_at: null,
          status: 'pending',
          created_at: new Date().toISOString(),
          approved_at: null,
        },
      ])
      .select();

    if (error) {
      // Clean up Firebase user if database insert fails
      try {
        await firebaseAuthUtils.deleteFirebaseUser(firebaseUser.uid);
      } catch (err) {
        console.error('Error cleaning up Firebase user:', err);
      }
      return res.status(400).json({ error: error.message });
    }

    // Send password setup email so vendor can set their own password
    try {
      await firebaseAuthUtils.sendPasswordResetEmail(contact_email);
    } catch (emailErr) {
      console.error('Error sending password reset email:', emailErr.message);
      // Don't fail if email sending fails, registration is still successful
    }

    res.status(201).json({
      message: 'Registration submitted successfully. Check your email to set password and wait for purchase manager approval.',
      vendor_id: vendorId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Unified Login - Auto-detects Vendor or Purchase Manager
exports.loginVendor = async (req, res) => {
  try {
    const { contact_email, email, password } = req.body;
    const userEmail = contact_email || email; // Support both field names

    if (!userEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Step 1: Check if user is a VENDOR
    const { data: vendor, error: vendorError } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('contact_email', userEmail)
      .maybeSingle();

    if (vendor) {
      // VENDOR LOGIN FLOW
      // Check if approved
      if (vendor.status !== 'approved') {
        return res.status(403).json({
          error: `Your registration is ${vendor.status}. Please wait for purchase manager approval.`,
        });
      }

      // Verify email and password against Firebase
      let firebaseUser;
      try {
        firebaseUser = await firebaseAuthUtils.verifyEmailPassword(userEmail, password);
      } catch (firebaseError) {
        console.error('Firebase authentication failed:', firebaseError.message);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Sync Firebase UID if not already stored
      if (!vendor.firebase_uid || vendor.firebase_uid !== firebaseUser.uid) {
        await supabase
          .from('vendorregistration')
          .update({ firebase_uid: firebaseUser.uid })
          .eq('vendor_id', vendor.vendor_id);
      }

      // Set custom claims for vendor
      await firebaseAuthUtils.setCustomClaims(firebaseUser.uid, {
        vendor: true,
        vendor_id: vendor.vendor_id,
        company_name: vendor.company_name,
      });

      // Get fresh ID token that includes the custom claims
      let freshIdToken = firebaseUser.idToken;
      if (firebaseUser.refreshToken) {
        try {
          const refreshResult = await firebaseAuthUtils.refreshIdToken(firebaseUser.refreshToken);
          freshIdToken = refreshResult.idToken;
        } catch (refreshError) {
          console.warn('Could not refresh ID token:', refreshError.message);
        }
      }

      // Generate Firebase Custom Token
      const customToken = await firebaseAuthUtils.createCustomToken(firebaseUser.uid, {
        vendor: true,
        vendor_id: vendor.vendor_id,
        company_name: vendor.company_name,
      });

      return res.json({
        message: 'Login successful',
        userType: 'vendor',
        customToken,
        idToken: freshIdToken,
        vendor: {
          vendor_id: vendor.vendor_id,
          company_name: vendor.company_name,
          company_tin: vendor.company_tin,
          address: vendor.address,
          contact_person: vendor.contact_person,
          contact_email: vendor.contact_email,
          contact_phone: vendor.contact_phone,
          company_website: vendor.company_website,
          firebase_uid: firebaseUser.uid,
        },
      });
    }

    // Step 2: Check if user is a PURCHASE MANAGER
    const { data: purchaseManager, error: purchaseManagerError } = await supabase
      .from('purchaseManager')
      .select('*')
      .eq('email', userEmail)
      .maybeSingle();

    if (purchaseManager) {
      // PURCHASE MANAGER LOGIN FLOW
      // Check if purchase manager is active
      if (purchaseManager.status !== 'active') {
        return res.status(403).json({
          error: `Purchase Manager account is ${purchaseManager.status}. Please contact support.`,
        });
      }

      // Verify email and password against Firebase
      let firebaseUser;
      try {
        firebaseUser = await firebaseAuthUtils.verifyEmailPassword(userEmail, password);
      } catch (firebaseError) {
        console.error('Firebase authentication failed:', firebaseError.message);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Sync Firebase UID if not already stored
      if (!purchaseManager.firebase_uid || purchaseManager.firebase_uid !== firebaseUser.uid) {
        await supabase
          .from('purchaseManager')
          .update({ firebase_uid: firebaseUser.uid })
          .eq('purchaseManagerId', purchaseManager.purchaseManagerId);
      }

      // Set custom claims for purchase manager
      await firebaseAuthUtils.setCustomClaims(firebaseUser.uid, {
        purchase_manager: true,
        purchaseManagerId: purchaseManager.purchaseManagerId,
        email: purchaseManager.email,
        status: purchaseManager.status,
      });

      // Get fresh ID token that includes the custom claims
      let freshIdToken = firebaseUser.idToken;
      if (firebaseUser.refreshToken) {
        try {
          const refreshResult = await firebaseAuthUtils.refreshIdToken(firebaseUser.refreshToken);
          freshIdToken = refreshResult.idToken;
        } catch (refreshError) {
          console.warn('Could not refresh ID token:', refreshError.message);
        }
      }

      // Generate Firebase Custom Token
      const customToken = await firebaseAuthUtils.createCustomToken(firebaseUser.uid, {
        purchase_manager: true,
        purchaseManagerId: purchaseManager.purchaseManagerId,
        email: purchaseManager.email,
        status: purchaseManager.status,
      });

      // Update last login
      await supabase
        .from('purchaseManager')
        .update({ last_login: new Date().toISOString() })
        .eq('purchaseManagerId', purchaseManager.purchaseManagerId);

      return res.json({
        message: 'Login successful',
        userType: 'purchase_manager',
        customToken,
        idToken: freshIdToken,
        purchaseManager: {
          purchaseManagerId: purchaseManager.purchaseManagerId,
          email: purchaseManager.email,
          name: purchaseManager.name,
          phone: purchaseManager.phone,
          companyId: purchaseManager.companyId,
          status: purchaseManager.status,
          created_at: purchaseManager.created_at,
          updated_at: purchaseManager.updated_at,
          profile_image: purchaseManager.profile_image,
          firebase_uid: firebaseUser.uid,
        },
      });
    }

    // Step 3: User not found in either table
    return res.status(401).json({ error: 'Invalid email or password' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Registration Requests (Purchase Manager)
exports.getRegistrationRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase.from('vendorregistration').select('*');

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Single Registration Request
exports.getRegistrationRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('vendor_id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Registration request not found' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Approve Registration (Purchase Manager)
exports.approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('vendorregistration')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('vendor_id', id)
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Create or link a company record
    if (data && data[0]) {
      const vendor = data[0];

      const { data: existingCompany } = await supabase
        .from('Company')
        .select('companyId, vendor_id')
        .eq('companyId', vendor.vendor_id)
        .single();

      if (existingCompany) {
        if (!existingCompany.vendor_id) {
          await supabase
            .from('Company')
            .update({ vendor_id: vendor.vendor_id })
            .eq('companyId', vendor.vendor_id);
        }
      } else {
        await supabase.from('Company').insert([
          {
            companyId: vendor.vendor_id,
            vendor_id: vendor.vendor_id,
            company_name: vendor.company_name,
            company_tin: vendor.company_tin,
            address: vendor.address,
            contact_person: vendor.contact_person,
            contact_email: vendor.contact_email,
            contact_phone: vendor.contact_phone,
            company_website: vendor.company_website,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    }

    res.json({
      message: 'Registration approved successfully',
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Reject Registration (Purchase Manager)
exports.rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data, error } = await supabase
      .from('vendorregistration')
      .update({
        status: 'rejected',
        rejection_reason: reason || null,
        approved_at: new Date().toISOString(),
      })
      .eq('vendor_id', id)
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Registration rejected',
      data: data[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update vendor certificate status (Purchase Manager)
exports.updateCertificateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['pending', 'approved', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid certificate status' });
    }

    const updatePayload = {
      certificate_status: status,
      certificate_verified_at: status === 'approved' ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from('vendorregistration')
      .update(updatePayload)
      .eq('vendor_id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Certificate status updated', data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const canAccessVendorProfile = (reqUser, vendorId) => {
  if (!reqUser || !vendorId) return false;
  if (reqUser.type === 'purchase_manager') return true;
  return reqUser.type === 'vendor' && reqUser.vendor_id === vendorId;
};

const normalizeVendorProfilePayload = (body = {}) => ({
  company_name: body.company_name || null,
  company_tin: body.company_tin || null,
  address: body.address || null,
  contact_person: body.contact_person || null,
  contact_email: body.contact_email || null,
  contact_phone: body.contact_phone || null,
  company_website: body.company_website || null,
  updated_at: new Date().toISOString(),
});

// Get Vendor Profile (vendor self or purchase manager)
exports.getVendorProfile = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!canAccessVendorProfile(req.user, vendorId)) {
      return res.status(403).json({ error: 'Not authorized to access this profile' });
    }

    const { data, error } = await supabase
      .from('vendorregistration')
      .select('*')
      .eq('vendor_id', vendorId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    res.json({ vendor: data });
  } catch (error) {
    console.error('Error getting vendor profile:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get Vendor Profile (legacy self route)
exports.getOwnVendorProfile = async (req, res) => {
  try {
    if (!req.user || req.user.type !== 'vendor' || !req.user.vendor_id) {
      return res.status(403).json({ error: 'Only vendors can access their profile from this route' });
    }

    req.params.vendorId = req.user.vendor_id;
    return exports.getVendorProfile(req, res);
  } catch (error) {
    console.error('Error getting own vendor profile:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update Vendor Profile by vendorId (vendor self or purchase manager)
exports.updateVendorProfileById = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!canAccessVendorProfile(req.user, vendorId)) {
      return res.status(403).json({ error: 'Not authorized to update this profile' });
    }

    const payload = normalizeVendorProfilePayload(req.body);
    if (!payload.company_name || !payload.contact_email) {
      return res.status(400).json({ error: 'Company name and email are required' });
    }

    const { data, error } = await supabase
      .from('vendorregistration')
      .update(payload)
      .eq('vendor_id', vendorId)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({ error: error?.message || 'Failed to update vendor profile' });
    }

    res.json({
      message: 'Profile updated successfully',
      vendor: data,
    });
  } catch (error) {
    console.error('Error updating vendor profile:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update Vendor Profile (legacy self route)
exports.updateVendorProfile = async (req, res) => {
  try {
    if (!req.user || req.user.type !== 'vendor' || !req.user.vendor_id) {
      return res.status(403).json({ error: 'Only vendors can update their profile from this route' });
    }

    req.params.vendorId = req.user.vendor_id;
    return exports.updateVendorProfileById(req, res);
  } catch (error) {
    console.error('Error updating vendor profile:', error);
    res.status(500).json({ error: error.message });
  }
};
// Middleware to authenticate Firebase token
exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify Firebase ID token
    const decodedToken = await firebaseAuth.verifyIdToken(token);

    // Check if this is a purchase manager or vendor based on custom claims
    if (decodedToken.purchase_manager) {
      // Purchase Manager user - fetch purchase manager details from purchaseManager
      const { data: purchaseManager } = await supabase
        .from('purchaseManager')
        .select('*')
        .eq('firebase_uid', decodedToken.uid)
        .single();

      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        type: 'purchase_manager',
        purchaseManagerId: purchaseManager?.purchaseManagerId,
        name: purchaseManager?.name,
        ...decodedToken,
      };
    } else {
      // Vendor user - fetch vendor details from database
      const { data: vendor } = await supabase
        .from('vendorregistration')
        .select('*')
        .eq('firebase_uid', decodedToken.uid)
        .single();

      if (!vendor) {
        return res.status(403).json({ error: 'Vendor account not found' });
      }

      // Check if vendor is approved
      if (vendor.status !== 'approved') {
        return res.status(403).json({ 
          error: `Your account is ${vendor.status}. Please wait for purchase manager approval.` 
        });
      }

      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        type: 'vendor',
        vendor_id: vendor?.vendor_id,
        company_name: vendor?.company_name,
        ...decodedToken,
      };
    }

    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    if (error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Invalid token format' });
    }
    
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};
