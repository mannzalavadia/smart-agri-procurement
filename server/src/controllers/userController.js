import { query } from '../config/db.js';

export async function getProfile(req, res, next) {
  try {
    if (req.user.role !== 'farmer') {
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
        },
      });
    }

    const resProfile = await query(
      'SELECT * FROM farmer_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (resProfile.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: 'PROFILE_NOT_FOUND',
        message: 'Farmer profile record not found',
      });
    }

    res.json({
      success: true,
      profile: resProfile.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const {
      name,
      mobile,
      state,
      district,
      village,
      pincode,
      latitude,
      longitude,
      preferred_language,
    } = req.body;

    if (req.user.role !== 'farmer') {
      return res.status(400).json({
        error: true,
        code: 'NOT_A_FARMER',
        message: 'Only farmer profiles can be updated with these fields',
      });
    }

    // Validate mobile if provided
    if (mobile !== undefined && mobile !== null && mobile.trim() !== '') {
      const mobileRegex = /^[6-9]\d{9}$/;
      if (!mobileRegex.test(mobile.trim())) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_MOBILE',
          message: 'Mobile number must be exactly 10 digits and start with 6-9',
        });
      }
    }

    // Validate pincode if provided
    if (pincode !== undefined && pincode !== null && pincode.trim() !== '') {
      const pincodeRegex = /^[1-9]\d{5}$/;
      if (!pincodeRegex.test(pincode.trim())) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_PINCODE',
          message: 'PIN code must be exactly 6 digits and cannot start with 0',
        });
      }
    }

    // Validate name if provided
    if (name !== undefined && name !== null && name.trim() !== '') {
      const nameRegex = /^[a-zA-Z0-9\u0900-\u097F\s.\-']+$/;
      if (!nameRegex.test(name.trim())) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_NAME',
          message: 'Name can only contain letters, numbers, spaces, dots, and hyphens',
        });
      }
    }

    const currentProfile = await query(
      'SELECT * FROM farmer_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (currentProfile.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found',
      });
    }

    const cur = currentProfile.rows[0];

    const updated = await query(
      `UPDATE farmer_profiles
       SET name = COALESCE($1, name),
           mobile = COALESCE($2, mobile),
           state = COALESCE($3, state),
           district = COALESCE($4, district),
           village = COALESCE($5, village),
           pincode = COALESCE($6, pincode),
           latitude = COALESCE($7, latitude),
           longitude = COALESCE($8, longitude),
           preferred_language = COALESCE($9, preferred_language),
           updated_at = NOW()
       WHERE user_id = $10
       RETURNING *`,
      [
        name ? name.trim() : null,
        mobile ? mobile.trim() : null,
        state ? state.trim() : null,
        district ? district.trim() : null,
        village ? village.trim() : null,
        pincode ? pincode.trim() : null,
        latitude !== undefined ? parseFloat(latitude) : null,
        longitude !== undefined ? parseFloat(longitude) : null,
        preferred_language && ['en', 'hi'].includes(preferred_language) ? preferred_language : null,
        req.user.id,
      ]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (actor_id, entity_name, entity_id, action, before_state, after_state)
       VALUES ($1, 'farmer_profiles', $2, 'update_profile', $3, $4)`,
      [req.user.id, cur.id, JSON.stringify(cur), JSON.stringify(updated.rows[0])]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
}
