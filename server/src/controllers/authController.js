import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../config/db.js';
import { ENV } from '../config/env.js';

export async function registerFarmer(req, res, next) {
  try {
    const {
      email,
      password,
      name,
      mobile,
      state = 'Uttar Pradesh',
      district = 'Lucknow',
      village = '',
      pincode = '',
      latitude = null,
      longitude = null,
      preferred_language = 'en',
    } = req.body;

    // Validate inputs
    if (!email || !password || !name || !mobile) {
      return res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Name, email, password, and mobile number are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: true,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters long',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_EMAIL',
        message: 'Please provide a valid email address',
      });
    }

    // Validate mobile: exactly 10 digits
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobile.trim())) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_MOBILE',
        message: 'Mobile number must be exactly 10 digits and start with 6-9',
      });
    }

    // Validate pincode: exactly 6 digits (Indian PIN code) — optional field
    if (pincode && pincode.trim()) {
      const pincodeRegex = /^[1-9]\d{5}$/;
      if (!pincodeRegex.test(pincode.trim())) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_PINCODE',
          message: 'PIN code must be exactly 6 digits and cannot start with 0',
        });
      }
    }

    // Validate name: letters, numbers, spaces, dots, and hyphens allowed
    const nameRegex = /^[a-zA-Z0-9\u0900-\u097F\s.\-']+$/;
    if (!nameRegex.test(name.trim())) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_NAME',
        message: 'Name can only contain letters, spaces, and dots',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: true,
        code: 'EMAIL_IN_USE',
        message: 'An account with this email address already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await withTransaction(async (client) => {
      // 1. Create user
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, role, token_version, is_active)
         VALUES ($1, $2, 'farmer', 1, TRUE)
         RETURNING id, email, role, token_version, created_at`,
        [normalizedEmail, passwordHash]
      );
      const newUser = userRes.rows[0];

      // 2. Create farmer profile
      const profileRes = await client.query(
        `INSERT INTO farmer_profiles (
           user_id, name, mobile, state, district, village, pincode,
           latitude, longitude, preferred_language
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          newUser.id,
          name.trim(),
          mobile.trim(),
          state.trim(),
          district.trim(),
          village.trim(),
          pincode.trim(),
          latitude ? parseFloat(latitude) : null,
          longitude ? parseFloat(longitude) : null,
          ['en', 'hi'].includes(preferred_language) ? preferred_language : 'en',
        ]
      );

      // 3. Log audit event
      await client.query(
        `INSERT INTO audit_logs (actor_id, entity_name, entity_id, action, after_state)
         VALUES ($1, 'users', $2, 'register_farmer', $3)`,
        [newUser.id, newUser.id, JSON.stringify({ email: normalizedEmail, role: 'farmer' })]
      );

      return { user: newUser, profile: profileRes.rows[0] };
    });

    const token = jwt.sign(
      { userId: result.user.id, role: result.user.role, tokenVersion: result.user.token_version },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: 'Farmer registered successfully',
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        name: result.profile.name,
        preferred_language: result.profile.preferred_language,
        profile: result.profile,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        error: true,
        code: 'MISSING_CREDENTIALS',
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userRes = await query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.token_version, u.is_active,
              fp.name, fp.preferred_language, fp.district
       FROM users u
       LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
       WHERE u.email = $1`,
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        error: true,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        error: true,
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled. Please contact administrator.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error: true,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, tokenVersion: user.token_version },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name || (user.role === 'admin' ? 'Platform Administrator' : 'Center Operator'),
        preferred_language: user.preferred_language || 'en',
        district: user.district || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    if (req.user && req.user.id) {
      await query(
        'UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1',
        [req.user.id]
      );
    }
    res.json({
      success: true,
      message: 'Logged out successfully. Active session token has been revoked.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    const userRes = await query(
      `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
              fp.name, fp.mobile, fp.state, fp.district, fp.village, fp.pincode,
              fp.latitude, fp.longitude, fp.preferred_language
       FROM users u
       LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: 'USER_NOT_FOUND',
        message: 'User record not found',
      });
    }

    const row = userRes.rows[0];
    res.json({
      success: true,
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        name: row.name || (row.role === 'admin' ? 'Platform Administrator' : 'Center Operator'),
        preferred_language: row.preferred_language || 'en',
        profile: row.role === 'farmer' ? {
          name: row.name,
          mobile: row.mobile,
          state: row.state,
          district: row.district,
          village: row.village,
          pincode: row.pincode,
          latitude: row.latitude,
          longitude: row.longitude,
          preferred_language: row.preferred_language,
        } : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
