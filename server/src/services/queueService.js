import crypto from 'crypto';
import { query, withTransaction } from '../config/db.js';
import { hashToken } from './bookingService.js';

/**
 * Checks in a farmer using their scanned QR token (FR-06, AT-08).
 * Idempotent: duplicate scans return existing queue position without creating duplicate rows.
 */
export async function checkInFarmer({ qrToken, centerId, operatorId }) {
  if (!qrToken) {
    const err = new Error('QR token is required');
    err.statusCode = 400;
    err.code = 'MISSING_QR_TOKEN';
    throw err;
  }

  const tokenHash = hashToken(qrToken);

  // 1. Look up booking by token hash
  const bRes = await query(
    `SELECT b.*, s.starts_at, s.ends_at, c.name AS center_name, c.active_state,
            fp.name AS farmer_name, cr.name_en AS crop_name
     FROM bookings b
     JOIN slots s ON b.slot_id = s.id
     JOIN centers c ON b.center_id = c.id
     LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
     LEFT JOIN crops cr ON b.crop_id = cr.id
     WHERE b.qr_token_hash = $1`,
    [tokenHash]
  );

  if (bRes.rows.length === 0) {
    const err = new Error('Invalid or unrecognised QR appointment token');
    err.statusCode = 404;
    err.code = 'INVALID_QR_TOKEN';
    throw err;
  }

  const booking = bRes.rows[0];

  // 2. Validate center matches
  if (booking.center_id !== centerId) {
    const err = new Error('This booking is registered for a different procurement center');
    err.statusCode = 400;
    err.code = 'CENTER_MISMATCH';
    throw err;
  }

  // 3. Check center is not paused or closed
  if (booking.active_state === 'paused') {
    const err = new Error('Center operations are temporarily paused. Check-in will resume shortly.');
    err.statusCode = 409;
    err.code = 'CENTER_PAUSED';
    throw err;
  }

  if (booking.active_state === 'closed') {
    const err = new Error('Center is currently closed due to emergency or scheduled maintenance.');
    err.statusCode = 409;
    err.code = 'CENTER_CLOSED';
    throw err;
  }

  // 4. Idempotent check: If already checked in, return current queue position safely (AT-08)
  if (booking.status === 'checked_in') {
    const qeRes = await query(
      `SELECT * FROM queue_entries WHERE booking_id = $1`,
      [booking.id]
    );

    const qe = qeRes.rows[0];

    // Compute live queue position
    const posRes = await query(
      `SELECT COUNT(*) AS position 
       FROM queue_entries q
       JOIN bookings b2 ON q.booking_id = b2.id
       JOIN slots s2 ON b2.slot_id = s2.id
       WHERE q.center_id = $1 
         AND q.queue_status IN ('waiting', 'called')
         AND (
           s2.starts_at < $2 
           OR (s2.starts_at = $2 AND q.checked_in_at <= $3)
         )`,
      [centerId, booking.starts_at, qe.checked_in_at]
    );

    const queuePosition = parseInt(posRes.rows[0].position, 10);

    return {
      isRepeat: true,
      message: 'Farmer has already checked in. Returning existing token.',
      tokenNumber: qe.token_number,
      queuePosition: Math.max(1, queuePosition),
      queueStatus: qe.queue_status,
      booking,
    };
  }

  if (booking.status !== 'confirmed') {
    const err = new Error(`Cannot check in. Booking status is '${booking.status}'`);
    err.statusCode = 400;
    err.code = 'INVALID_BOOKING_STATUS';
    throw err;
  }

  // 5. Check-in window validation (-15 min to +15 min from slot start)
  const now = new Date();
  const slotStart = new Date(booking.starts_at);
  const earliestCheckIn = new Date(slotStart.getTime() - 15 * 60 * 1000);
  const latestCheckIn = new Date(slotStart.getTime() + 15 * 60 * 1000);

  // If before earliest check-in
  if (now < earliestCheckIn) {
    const waitMins = Math.round((earliestCheckIn - now) / 60000);
    const err = new Error(
      `Check-in is not yet open. Opens 15 minutes before slot start (in approximately ${waitMins} minutes).`
    );
    err.statusCode = 400;
    err.code = 'CHECK_IN_TOO_EARLY';
    throw err;
  }

  // If past latest cutoff
  if (now > latestCheckIn) {
    // Mark as no-show
    await query(
      `UPDATE bookings SET status = 'no_show', updated_at = NOW() WHERE id = $1`,
      [booking.id]
    );
    await query(
      `INSERT INTO booking_events (booking_id, actor_id, previous_status, new_status, reason)
       VALUES ($1, $2, 'confirmed', 'no_show', 'Missed +15 minute check-in window cutoff')`,
      [booking.id, operatorId]
    );

    const err = new Error(
      'Check-in window has expired (+15 minutes past slot start). Booking has been marked as No-Show. Please reschedule an appointment.'
    );
    err.statusCode = 400;
    err.code = 'CHECK_IN_EXPIRED_NO_SHOW';
    throw err;
  }

  // 6. Valid first check-in: Create queue entry in transaction (AT-08, AT-09)
  return withTransaction(async (client) => {
    // Calculate next sequential daily token number for this center
    const tokenRes = await client.query(
      `SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token
       FROM queue_entries
       WHERE center_id = $1 AND checked_in_at >= (NOW() - INTERVAL '24 hours')`,
      [centerId]
    );
    const tokenNumber = parseInt(tokenRes.rows[0].next_token, 10);

    // Insert into queue_entries
    const qeRes = await client.query(
      `INSERT INTO queue_entries (
         booking_id, center_id, token_number, checked_in_at, queue_status
       )
       VALUES ($1, $2, $3, NOW(), 'waiting')
       RETURNING *`,
      [booking.id, centerId, tokenNumber]
    );
    const queueEntry = qeRes.rows[0];

    // Update booking status
    await client.query(
      `UPDATE bookings SET status = 'checked_in', updated_at = NOW() WHERE id = $1`,
      [booking.id]
    );

    // Audit log event
    await client.query(
      `INSERT INTO booking_events (booking_id, actor_id, previous_status, new_status, reason)
       VALUES ($1, $2, 'confirmed', 'checked_in', 'Operator QR check-in verified')`,
      [booking.id, operatorId]
    );

    // Calculate queue position: Count entries ahead in waiting/called status
    // Priority: slot start time first, then check-in time (AT-09)
    const posRes = await client.query(
      `SELECT COUNT(*) AS position 
       FROM queue_entries q
       JOIN bookings b2 ON q.booking_id = b2.id
       JOIN slots s2 ON b2.slot_id = s2.id
       WHERE q.center_id = $1 
         AND q.queue_status IN ('waiting', 'called')
         AND (
           s2.starts_at < $2 
           OR (s2.starts_at = $2 AND q.checked_in_at <= $3)
         )`,
      [centerId, booking.starts_at, queueEntry.checked_in_at]
    );

    const queuePosition = parseInt(posRes.rows[0].position, 10);

    return {
      isRepeat: false,
      message: 'Check-in successful. Token assigned.',
      tokenNumber,
      queuePosition: Math.max(1, queuePosition),
      queueStatus: 'waiting',
      booking: {
        ...booking,
        status: 'checked_in',
      },
    };
  });
}

/**
 * Retrieves the live active queue for a center (FR-06, AT-09).
 * Strict priority ordering:
 * 1. Slot start time ASC (earlier scheduled slots served first)
 * 2. Check-in timestamp ASC (earlier arrival within same slot served first)
 */
export async function getCenterQueue(centerId) {
  const result = await query(
    `SELECT qe.id AS queue_entry_id, qe.token_number, qe.queue_status,
            qe.checked_in_at, qe.called_at, qe.service_started_at, qe.completed_at,
            b.id AS booking_id, b.booking_reference, b.estimated_quintals, b.price_snapshot,
            fp.name AS farmer_name, fp.mobile AS farmer_mobile,
            cr.name_en AS crop_name_en, cr.name_hi AS crop_name_hi,
            s.starts_at AS slot_starts_at, s.ends_at AS slot_ends_at
     FROM queue_entries qe
     JOIN bookings b ON qe.booking_id = b.id
     JOIN slots s ON b.slot_id = s.id
     JOIN crops cr ON b.crop_id = cr.id
     LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
     WHERE qe.center_id = $1
       AND qe.queue_status IN ('waiting', 'called', 'serving')
     ORDER BY 
       CASE WHEN qe.queue_status = 'serving' THEN 1
            WHEN qe.queue_status = 'called' THEN 2
            ELSE 3 END,
       s.starts_at ASC,
       qe.checked_in_at ASC`,
    [centerId]
  );

  // Add position index and estimated wait time (15 mins per ahead token)
  let positionCounter = 1;
  return result.rows.map((entry) => {
    const isAhead = entry.queue_status === 'waiting';
    const pos = entry.queue_status === 'serving' ? 0 : positionCounter++;
    const estWaitMinutes = pos * 15;

    return {
      ...entry,
      position: pos,
      estimatedWaitMinutes: estWaitMinutes,
    };
  });
}

export async function callNextInQueue(centerId, operatorId) {
  return withTransaction(async (client) => {
    // Find next eligible waiting entry ordered by slot time, then check-in time
    const nextRes = await client.query(
      `SELECT qe.id, qe.token_number, qe.booking_id, b.farmer_id, fp.name AS farmer_name
       FROM queue_entries qe
       JOIN bookings b ON qe.booking_id = b.id
       JOIN slots s ON b.slot_id = s.id
       LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
       WHERE qe.center_id = $1 AND qe.queue_status = 'waiting'
       ORDER BY s.starts_at ASC, qe.checked_in_at ASC
       LIMIT 1
       FOR UPDATE`,
      [centerId]
    );

    if (nextRes.rows.length === 0) {
      return null;
    }

    const nextEntry = nextRes.rows[0];

    await client.query(
      `UPDATE queue_entries 
       SET queue_status = 'called', called_at = NOW() 
       WHERE id = $1`,
      [nextEntry.id]
    );

    await client.query(
      `INSERT INTO booking_events (booking_id, actor_id, previous_status, new_status, reason)
       VALUES ($1, $2, 'checked_in', 'checked_in', 'Token called by center operator')`,
      [nextEntry.booking_id, operatorId]
    );

    return nextEntry;
  });
}

export async function updateQueueStatus(queueEntryId, newStatus, operatorId) {
  if (!['called', 'serving', 'completed', 'skipped'].includes(newStatus)) {
    throw new Error(`Invalid queue status: ${newStatus}`);
  }

  return withTransaction(async (client) => {
    const qeRes = await client.query(
      `SELECT qe.*, b.farmer_id FROM queue_entries qe 
       JOIN bookings b ON qe.booking_id = b.id 
       WHERE qe.id = $1 FOR UPDATE`,
      [queueEntryId]
    );

    if (qeRes.rows.length === 0) {
      throw new Error('Queue entry not found');
    }

    const qe = qeRes.rows[0];

    let updateSql = 'UPDATE queue_entries SET queue_status = $1';
    const params = [newStatus, queueEntryId];

    if (newStatus === 'serving') {
      updateSql += ', service_started_at = NOW()';
      await client.query(
        `UPDATE bookings SET status = 'in_service', updated_at = NOW() WHERE id = $1`,
        [qe.booking_id]
      );
    } else if (newStatus === 'completed') {
      updateSql += ', completed_at = NOW()';
      await client.query(
        `UPDATE bookings SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [qe.booking_id]
      );
    }

    updateSql += ' WHERE id = $2 RETURNING *';

    const result = await client.query(updateSql, params);

    await client.query(
      `INSERT INTO booking_events (booking_id, actor_id, previous_status, new_status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [qe.booking_id, operatorId, qe.queue_status, newStatus, `Queue state updated to ${newStatus}`]
    );

    return result.rows[0];
  });
}

/**
 * Sweep no-shows for expired cutoffs (+15 mins past slot start) (FR-07, AT-10)
 * Protects paused or closed centers from marking no-shows.
 */
export async function sweepNoShows() {
  const expiredRes = await query(
    `SELECT b.id, b.booking_reference, b.center_id, s.starts_at, s.ends_at
     FROM bookings b
     JOIN slots s ON b.slot_id = s.id
     JOIN centers c ON b.center_id = c.id
     WHERE b.status = 'confirmed'
       AND s.starts_at + INTERVAL '15 minutes' < NOW()
       AND c.active_state = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM center_closures cc
         WHERE cc.center_id = b.center_id
           AND cc.start_time <= s.starts_at
           AND (cc.end_time IS NULL OR cc.end_time >= s.ends_at)
       )`
  );

  let updatedCount = 0;
  for (const b of expiredRes.rows) {
    await query(
      `UPDATE bookings SET status = 'no_show', updated_at = NOW() WHERE id = $1`,
      [b.id]
    );
    await query(
      `INSERT INTO booking_events (booking_id, previous_status, new_status, reason)
       VALUES ($1, 'confirmed', 'no_show', 'Automated cutoff sweep: farmer did not check in within +15 mins')`,
      [b.id]
    );
    updatedCount++;
  }

  return { sweptCount: updatedCount };
}

/**
 * 10-Minute Waitlist Hold Offer (FR-07, AT-11)
 */
export async function createWaitlistHold({ farmerId, slotId, cropId, quintals }) {
  const holdToken = `hold_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const res = await query(
    `INSERT INTO slot_holds (farmer_id, slot_id, crop_id, quintals, hold_token, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'offered')
     RETURNING *`,
    [farmerId, slotId, cropId, quintals, holdToken, expiresAt]
  );

  return res.rows[0];
}

export async function acceptWaitlistHold(holdToken, farmerId) {
  return withTransaction(async (client) => {
    const holdRes = await client.query(
      `SELECT * FROM slot_holds WHERE hold_token = $1 FOR UPDATE`,
      [holdToken]
    );

    if (holdRes.rows.length === 0) {
      throw new Error('Hold token not found');
    }

    const hold = holdRes.rows[0];

    if (hold.farmer_id !== farmerId) {
      throw new Error('Unauthorized hold access');
    }

    if (hold.status !== 'offered' || new Date(hold.expires_at) < new Date()) {
      await client.query(`UPDATE slot_holds SET status = 'expired' WHERE id = $1`, [hold.id]);
      throw new Error('This 10-minute slot hold has expired');
    }

    // Mark accepted
    await client.query(`UPDATE slot_holds SET status = 'accepted' WHERE id = $1`, [hold.id]);
    return hold;
  });
}
