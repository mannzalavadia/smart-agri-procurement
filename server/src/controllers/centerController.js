import { query, withTransaction } from '../config/db.js';

export async function listCenters(req, res, next) {
  try {
    const { status, type, crop } = req.query;
    const user = req.user;

    let baseSql = 'SELECT * FROM centers';
    const whereClauses = [];
    const params = [];

    // Filter rule: Public and Farmers ONLY see approved & active centers (FR-02, AT-02)
    if (!user || user.role === 'farmer') {
      whereClauses.push("verification_status = 'approved'");
      whereClauses.push("active_state = 'active'");
    } else if (user.role === 'operator') {
      // Operators see centers assigned to them or their own drafts
      params.push(user.id);
      whereClauses.push(`
        id IN (SELECT center_id FROM center_operator_assignments WHERE operator_id = $${params.length})
      `);
    } else if (user.role === 'admin') {
      // Admin can filter by status
      if (status) {
        params.push(status);
        whereClauses.push(`verification_status = $${params.length}`);
      }
    }

    if (type) {
      params.push(type);
      whereClauses.push(`type = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      baseSql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    baseSql += ' ORDER BY name ASC';

    const centersRes = await query(baseSql, params);
    const centers = centersRes.rows;

    if (centers.length === 0) {
      return res.json({ success: true, count: 0, centers: [] });
    }

    const centerIds = centers.map((c) => c.id);

    // Fetch active crops and prices for these centers
    const cropsRes = await query(
      `SELECT cc.center_id, cr.id AS crop_id, cr.code, cr.name_en, cr.name_hi, cr.unit,
              cc.is_accepted, ccp.rate_per_quintal, ccp.effective_from
       FROM center_crops cc
       JOIN crops cr ON cc.crop_id = cr.id
       LEFT JOIN center_crop_prices ccp 
         ON ccp.center_id = cc.center_id 
        AND ccp.crop_id = cc.crop_id 
        AND (ccp.effective_to IS NULL OR ccp.effective_to > NOW())
       WHERE cc.is_accepted = TRUE AND cc.center_id = ANY($1::uuid[])
       ORDER BY ccp.effective_from DESC`,
      [centerIds]
    );

    // Group crops by center_id
    const cropsByCenter = {};
    for (const row of cropsRes.rows) {
      if (!cropsByCenter[row.center_id]) {
        cropsByCenter[row.center_id] = [];
      }
      // Only keep the most recent price per crop if multiple exist
      const existing = cropsByCenter[row.center_id].find((x) => x.crop_id === row.crop_id);
      if (!existing) {
        cropsByCenter[row.center_id].push({
          crop_id: row.crop_id,
          code: row.code,
          name_en: row.name_en,
          name_hi: row.name_hi,
          unit: row.unit,
          is_accepted: row.is_accepted,
          price_per_quintal: row.rate_per_quintal ? parseFloat(row.rate_per_quintal) : null,
          price_effective_from: row.effective_from,
        });
      }
    }

    // Attach crops to centers
    let enrichedCenters = centers.map((c) => ({
      ...c,
      crops: cropsByCenter[c.id] || [],
    }));

    // If crop filter requested, filter post-attachment
    if (crop) {
      enrichedCenters = enrichedCenters.filter((c) =>
        c.crops?.some((cr) => cr.code === crop || cr.crop_id === crop)
      );
    }

    res.json({
      success: true,
      count: enrichedCenters.length,
      centers: enrichedCenters,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCenterById(req, res, next) {
  try {
    const { centerId } = req.params;
    const user = req.user;

    const centerRes = await query('SELECT * FROM centers WHERE id = $1', [centerId]);
    if (centerRes.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: 'CENTER_NOT_FOUND',
        message: 'Procurement center not found',
      });
    }

    const center = centerRes.rows[0];

    // Access check: If unapproved, only assigned operator or admin can view details
    if (center.verification_status !== 'approved' || center.active_state !== 'active') {
      if (!user || (user.role !== 'admin' && user.role !== 'operator')) {
        return res.status(403).json({
          error: true,
          code: 'CENTER_NOT_PUBLIC',
          message: 'This center is currently pending verification or inactive',
        });
      }
    }

    // Fetch accepted crops with active prices
    const cropsRes = await query(
      `SELECT cr.id, cr.code, cr.name_en, cr.name_hi, cr.unit,
              cc.is_accepted, cc.min_quality_grade, cc.special_requirements,
              ccp.rate_per_quintal, ccp.effective_from, ccp.effective_to
       FROM center_crops cc
       JOIN crops cr ON cc.crop_id = cr.id
       LEFT JOIN center_crop_prices ccp 
         ON ccp.center_id = cc.center_id 
        AND ccp.crop_id = cc.crop_id 
        AND (ccp.effective_to IS NULL OR ccp.effective_to > NOW())
       WHERE cc.center_id = $1 AND cc.is_accepted = TRUE`,
      [centerId]
    );

    // Fetch schedules
    const scheduleRes = await query(
      'SELECT * FROM center_schedules WHERE center_id = $1 ORDER BY day_of_week ASC',
      [centerId]
    );

    // Fetch operator assignments
    const operatorsRes = await query(
      `SELECT u.id, u.email, fp.name, fp.mobile, coa.role_in_center
       FROM center_operator_assignments coa
       JOIN users u ON coa.operator_id = u.id
       LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
       WHERE coa.center_id = $1`,
      [centerId]
    );

    res.json({
      success: true,
      center: {
        ...center,
        crops: cropsRes.rows,
        schedules: scheduleRes.rows,
        operators: operatorsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createCenter(req, res, next) {
  try {
    const {
      name,
      type,
      address,
      district,
      state = 'Uttar Pradesh',
      pincode,
      latitude,
      longitude,
      contact_phone,
    } = req.body;

    if (!name || !type || !address || !district || !pincode || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Name, type (government/private), address, district, pincode, and coordinates are required',
      });
    }

    if (!['government', 'private'].includes(type)) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_CENTER_TYPE',
        message: "Center type must be either 'government' or 'private'",
      });
    }

    const pincodeRegex = /^[1-9]\d{5}$/;
    if (!pincodeRegex.test(pincode.trim())) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_PINCODE',
        message: 'Center PIN code must be exactly 6 digits and cannot start with 0',
      });
    }

    if (contact_phone && contact_phone.trim()) {
      const phoneClean = contact_phone.trim();
      const phoneRegex = /^(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}$|^0\d{2,4}[-\s]?\d{6,8}$/;
      if (!phoneRegex.test(phoneClean)) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_PHONE',
          message: 'Contact phone must be a valid 10-digit mobile number or standard landline',
        });
      }
    }

    const initialStatus = req.user.role === 'admin' ? 'approved' : 'pending_verification';

    const result = await withTransaction(async (client) => {
      const centerRes = await client.query(
        `INSERT INTO centers (
           name, type, address, district, state, pincode,
           latitude, longitude, contact_phone, verification_status, active_state
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
         RETURNING *`,
        [
          name.trim(),
          type,
          address.trim(),
          district.trim(),
          state.trim(),
          pincode.trim(),
          parseFloat(latitude),
          parseFloat(longitude),
          contact_phone ? contact_phone.trim() : null,
          initialStatus,
        ]
      );
      const newCenter = centerRes.rows[0];

      // If created by operator, assign operator to this center
      if (req.user.role === 'operator') {
        await client.query(
          `INSERT INTO center_operator_assignments (operator_id, center_id, role_in_center)
           VALUES ($1, $2, 'manager')`,
          [req.user.id, newCenter.id]
        );
      }

      // Create default weekly schedule (Mon-Sat, 9am - 5pm, 30 min slots, 10 farmers, 100 quintals)
      for (let day = 1; day <= 6; day++) {
        await client.query(
          `INSERT INTO center_schedules (
             center_id, day_of_week, open_time, close_time,
             slot_duration_minutes, default_max_farmers, default_max_quintals
           )
           VALUES ($1, $2, '09:00:00', '17:00:00', 30, 10, 100.00)`,
          [newCenter.id, day]
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, entity_name, entity_id, action, after_state)
         VALUES ($1, 'centers', $2, 'create_center', $3)`,
        [req.user.id, newCenter.id, JSON.stringify(newCenter)]
      );

      return newCenter;
    });

    res.status(201).json({
      success: true,
      message: initialStatus === 'approved' 
        ? 'Center created and approved successfully' 
        : 'Center registration submitted for admin verification',
      center: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function reviewCenterVerification(req, res, next) {
  try {
    const { centerId } = req.params;
    const { decision, reason } = req.body;

    if (!['approved', 'rejected', 'suspended'].includes(decision)) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_DECISION',
        message: "Decision must be 'approved', 'rejected', or 'suspended'",
      });
    }

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        error: true,
        code: 'MISSING_REASON',
        message: 'A clear reason (at least 5 characters) must be provided for governance review',
      });
    }

    const result = await withTransaction(async (client) => {
      // 1. Update center status
      const updateRes = await client.query(
        `UPDATE centers 
         SET verification_status = $1::varchar,
             active_state = CASE WHEN $1::varchar = 'approved' THEN 'active' ELSE 'inactive' END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [decision, centerId]
      );

      if (updateRes.rows.length === 0) {
        throw new Error('Center not found');
      }

      // 2. Record verification log
      await client.query(
        `INSERT INTO center_verifications (center_id, reviewed_by, decision, reason)
         VALUES ($1, $2, $3, $4)`,
        [centerId, req.user.id, decision, reason.trim()]
      );

      // 3. Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, entity_name, entity_id, action, after_state)
         VALUES ($1, 'centers', $2, $3, $4)`,
        [req.user.id, centerId, `verify_center_${decision}`, JSON.stringify({ decision, reason })]
      );

      return updateRes.rows[0];
    });

    res.json({
      success: true,
      message: `Center verification updated to '${decision}'`,
      center: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCenterPrices(req, res, next) {
  try {
    const { centerId } = req.params;
    const { cropPrices } = req.body; // Array of { cropId, ratePerQuintal }

    if (!Array.isArray(cropPrices) || cropPrices.length === 0) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_PRICES',
        message: 'cropPrices must be a non-empty array of { cropId, ratePerQuintal }',
      });
    }

    await withTransaction(async (client) => {
      for (const item of cropPrices) {
        const rate = parseFloat(item.ratePerQuintal);
        if (isNaN(rate) || rate <= 0) {
          throw new Error(`Invalid price rate: ${item.ratePerQuintal} for crop ${item.cropId}`);
        }

        // 1. Ensure center_crops has this crop enabled
        await client.query(
          `INSERT INTO center_crops (center_id, crop_id, is_accepted)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (center_id, crop_id) DO UPDATE SET is_accepted = TRUE`,
          [centerId, item.cropId]
        );

        // 2. Expire any currently active price for this crop at this center
        await client.query(
          `UPDATE center_crop_prices
           SET effective_to = NOW()
           WHERE center_id = $1 AND crop_id = $2 AND effective_to IS NULL`,
          [centerId, item.cropId]
        );

        // 3. Insert new effective price record
        await client.query(
          `INSERT INTO center_crop_prices (center_id, crop_id, rate_per_quintal, effective_from, updated_by)
           VALUES ($1, $2, $3, NOW(), $4)`,
          [centerId, item.cropId, rate, req.user.id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (actor_id, entity_name, entity_id, action, after_state)
         VALUES ($1, 'center_crop_prices', $2, 'update_prices', $3)`,
        [req.user.id, centerId, JSON.stringify(cropPrices)]
      );
    });

    res.json({
      success: true,
      message: 'Center crop published prices updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCenterSchedule(req, res, next) {
  try {
    const { centerId } = req.params;
    const { schedules } = req.body; // Array of { day_of_week, open_time, close_time, slot_duration_minutes, default_max_farmers, default_max_quintals, is_active }

    if (!Array.isArray(schedules)) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_SCHEDULES',
        message: 'schedules must be an array of daily schedules',
      });
    }

    await withTransaction(async (client) => {
      // Delete existing and reinsert updated daily schedules
      await client.query('DELETE FROM center_schedules WHERE center_id = $1', [centerId]);

      for (const s of schedules) {
        await client.query(
          `INSERT INTO center_schedules (
             center_id, day_of_week, open_time, close_time,
             slot_duration_minutes, default_max_farmers, default_max_quintals, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            centerId,
            s.day_of_week,
            s.open_time,
            s.close_time,
            s.slot_duration_minutes || 30,
            s.default_max_farmers || 10,
            s.default_max_quintals || 100.00,
            s.is_active !== undefined ? s.is_active : true,
          ]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (actor_id, entity_name, entity_id, action, after_state)
         VALUES ($1, 'center_schedules', $2, 'update_schedules', $3)`,
        [req.user.id, centerId, JSON.stringify(schedules)]
      );
    });

    res.json({
      success: true,
      message: 'Center operating schedule updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function pauseCenterHandler(req, res, next) {
  try {
    const { centerId } = req.params;
    const { reason } = req.body;
    const { pauseCenter } = await import('../services/emergencyService.js');
    const center = await pauseCenter({
      centerId,
      operatorId: req.user.id,
      operatorRole: req.user.role,
      reason,
    });
    res.json({
      success: true,
      message: 'Center operations temporarily paused',
      center,
    });
  } catch (err) {
    next(err);
  }
}

export async function resumeCenterHandler(req, res, next) {
  try {
    const { centerId } = req.params;
    const { resumeCenter } = await import('../services/emergencyService.js');
    const center = await resumeCenter({
      centerId,
      operatorId: req.user.id,
      operatorRole: req.user.role,
    });
    res.json({
      success: true,
      message: 'Center operations resumed',
      center,
    });
  } catch (err) {
    next(err);
  }
}

export async function emergencyCloseCenterHandler(req, res, next) {
  try {
    const { centerId } = req.params;
    const { reason, targetDate } = req.body;
    const { emergencyCloseCenter } = await import('../services/emergencyService.js');
    const result = await emergencyCloseCenter({
      centerId,
      operatorId: req.user.id,
      operatorRole: req.user.role,
      reason,
      targetDate,
    });
    res.json({
      success: true,
      message: 'Center closed due to emergency. Affected farmer appointments protected and notified.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCenterAnalyticsHandler(req, res, next) {
  try {
    const { centerId } = req.params;
    const { getCenterAnalytics } = await import('../services/analyticsService.js');
    const analytics = await getCenterAnalytics(centerId);
    res.json({
      success: true,
      analytics,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminAnalyticsHandler(req, res, next) {
  try {
    const { getAdminAnalytics } = await import('../services/analyticsService.js');
    const analytics = await getAdminAnalytics();
    res.json({
      success: true,
      analytics,
    });
  } catch (err) {
    next(err);
  }
}
