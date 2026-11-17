import crypto from 'crypto';
import { query, withTransaction } from '../config/db.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateBookingReference() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AGRI-${dateStr}-${randomSuffix}`;
}

export async function createBooking({
  farmerId,
  centerId,
  slotId,
  cropId,
  estimatedQuintals,
  idempotencyKey,
}) {
  const quantity = parseFloat(estimatedQuintals);
  if (isNaN(quantity) || quantity <= 0 || quantity > 1000) {
    const err = new Error('Estimated quantity must be a valid number between 0.5 and 1000 quintals');
    err.statusCode = 400;
    err.code = 'INVALID_QUANTITY';
    throw err;
  }

  // Idempotency check: if an idempotency key was supplied and already matches a confirmed booking, return it
  if (idempotencyKey) {
    const existing = await query(
      `SELECT b.*, cr.name_en AS crop_name, c.name AS center_name, s.starts_at, s.ends_at
       FROM bookings b
       JOIN crops cr ON b.crop_id = cr.id
       JOIN centers c ON b.center_id = c.id
       JOIN slots s ON b.slot_id = s.id
       WHERE b.farmer_id = $1 AND b.cancellation_reason = $2`,
      [farmerId, `IDEMPOTENCY:${idempotencyKey}`]
    );
    if (existing.rows.length > 0) {
      return { booking: existing.rows[0], isIdempotentReplay: true };
    }
  }

  return withTransaction(async (client) => {
    // 1. Lock the slot row exclusively (Pessimistic locking to serialize concurrent attempts)
    const slotRes = await client.query(
      `SELECT id, center_id, starts_at, ends_at, max_farmers, max_quintals,
              reserved_farmers, reserved_quintals, is_blocked
       FROM slots
       WHERE id = $1
       FOR UPDATE`,
      [slotId]
    );

    if (slotRes.rows.length === 0) {
      const err = new Error('Selected booking slot was not found');
      err.statusCode = 404;
      err.code = 'SLOT_NOT_FOUND';
      throw err;
    }

    const slot = slotRes.rows[0];

    if (slot.is_blocked) {
      const err = new Error('This slot is currently blocked by center administration');
      err.statusCode = 409;
      err.code = 'SLOT_BLOCKED';
      throw err;
    }

    if (new Date(slot.starts_at) <= new Date()) {
      const err = new Error('Cannot reserve a slot that has already passed');
      err.statusCode = 400;
      err.code = 'PAST_SLOT';
      throw err;
    }

    // 2. Validate center is approved and active
    const centerRes = await client.query(
      `SELECT id, name, verification_status, active_state 
       FROM centers WHERE id = $1`,
      [slot.center_id]
    );

    if (centerRes.rows.length === 0 || centerRes.rows[0].verification_status !== 'approved' || centerRes.rows[0].active_state !== 'active') {
      const err = new Error('Center is not currently verified and active for bookings');
      err.statusCode = 400;
      err.code = 'CENTER_INACTIVE';
      throw err;
    }

    // 3. Validate crop eligibility and retrieve current published price snapshot (FR-05)
    const priceRes = await client.query(
      `SELECT rate_per_quintal FROM center_crop_prices
       WHERE center_id = $1 AND crop_id = $2 AND (effective_to IS NULL OR effective_to > NOW())
       ORDER BY effective_from DESC LIMIT 1`,
      [slot.center_id, cropId]
    );

    if (priceRes.rows.length === 0) {
      const err = new Error('This center does not currently accept or publish prices for the selected crop');
      err.statusCode = 400;
      err.code = 'CROP_NOT_ACCEPTED';
      throw err;
    }

    const priceSnapshot = parseFloat(priceRes.rows[0].rate_per_quintal);

    // 4. Overlap check: Prevent farmer from having overlapping active bookings (AT-06)
    const overlapRes = await client.query(
      `SELECT b.id, b.booking_reference, s.starts_at, s.ends_at
       FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       WHERE b.farmer_id = $1
         AND b.status IN ('confirmed', 'checked_in', 'in_service')
         AND s.starts_at < $2
         AND s.ends_at > $3`,
      [farmerId, slot.ends_at, slot.starts_at]
    );

    if (overlapRes.rows.length > 0) {
      const err = new Error(
        `You already have an active booking (${overlapRes.rows[0].booking_reference}) during this time window. Overlapping bookings are not permitted.`
      );
      err.statusCode = 409;
      err.code = 'FARMER_SLOT_OVERLAP';
      throw err;
    }

    // 5. Dual capacity check: Farmer count limit & Crop volume limit (AT-04, AT-05)
    const currentFarmers = parseInt(slot.reserved_farmers, 10);
    const currentQuintals = parseFloat(slot.reserved_quintals);

    if (currentFarmers + 1 > slot.max_farmers) {
      const err = new Error(
        `This slot has reached its maximum farmer attendance capacity (${slot.max_farmers}/${slot.max_farmers}). Please select another slot.`
      );
      err.statusCode = 409;
      err.code = 'FARMER_CAPACITY_EXCEEDED';
      throw err;
    }

    if (currentQuintals + quantity > parseFloat(slot.max_quintals)) {
      const remainingQuintals = Math.max(0, parseFloat(slot.max_quintals) - currentQuintals);
      const err = new Error(
        `Requested quantity (${quantity}q) exceeds the remaining slot capacity (${remainingQuintals}q available). Please select another slot.`
      );
      err.statusCode = 409;
      err.code = 'QUINTAL_CAPACITY_EXCEEDED';
      throw err;
    }

    // 6. Atomically reserve slot capacity
    await client.query(
      `UPDATE slots
       SET reserved_farmers = reserved_farmers + 1,
           reserved_quintals = reserved_quintals + $1
       WHERE id = $2`,
      [quantity, slot.id]
    );

    // 7. Generate opaque QR token & hash
    const rawQrToken = `agri_qr_${crypto.randomUUID()}_${crypto.randomBytes(16).toString('hex')}`;
    const qrTokenHash = hashToken(rawQrToken);
    const bookingReference = generateBookingReference();

    // 8. Insert confirmed booking record with price snapshot
    const bookingRes = await client.query(
      `INSERT INTO bookings (
         booking_reference, farmer_id, center_id, slot_id, crop_id,
         estimated_quintals, price_snapshot, status, qr_token_hash, cancellation_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $9)
       RETURNING *`,
      [
        bookingReference,
        farmerId,
        slot.center_id,
        slot.id,
        cropId,
        quantity,
        priceSnapshot,
        qrTokenHash,
        idempotencyKey ? `IDEMPOTENCY:${idempotencyKey}` : null,
      ]
    );

    const booking = bookingRes.rows[0];

    // 9. Record event in booking_events
    await client.query(
      `INSERT INTO booking_events (booking_id, actor_id, previous_status, new_status, reason)
       VALUES ($1, $2, NULL, 'confirmed', 'Automated atomic booking confirmed')`,
      [booking.id, farmerId]
    );

    return {
      booking: {
        ...booking,
        center_name: centerRes.rows[0].name,
        slot_starts_at: slot.starts_at,
        slot_ends_at: slot.ends_at,
      },
      qrToken: rawQrToken,
    };
  });
}

export async function cancelBooking(bookingId, farmerId, reason = 'Cancelled by farmer') {
  return withTransaction(async (client) => {
    // 1. Lock booking row
    const bRes = await client.query(
      `SELECT b.*, s.starts_at, s.ends_at
       FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       WHERE b.id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bRes.rows.length === 0) {
      const err = new Error('Booking not found');
      err.statusCode = 404;
      err.code = 'BOOKING_NOT_FOUND';
      throw err;
    }

    const booking = bRes.rows[0];

    // Ownership check
    if (booking.farmer_id !== farmerId) {
      const err = new Error('You do not have permission to cancel this booking');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (booking.status !== 'confirmed') {
      const err = new Error(`Cannot cancel booking with current status: '${booking.status}'`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    // 2. Lock slot row and release capacity if slot is in the future (AT-07)
    if (new Date(booking.starts_at) > new Date()) {
      await client.query(
        `UPDATE slots
         SET reserved_farmers = GREATEST(0, reserved_farmers - 1),
             reserved_quintals = GREATEST(0, reserved_quintals - $1)
         WHERE id = $2`,
        [booking.estimated_quintals, booking.slot_id]
      );
    }

    // 3. Update booking status
    const updateRes = await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancellation_reason = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason.trim(), bookingId]
    );

    // 4. Log event
    await client.query(
      `INSERT INTO booking_events (booking_id, actor_id, previous_status, new_status, reason)
       VALUES ($1, $2, 'confirmed', 'cancelled', $3)`,
      [bookingId, farmerId, reason.trim()]
    );

    return updateRes.rows[0];
  });
}

export async function listFarmerBookings(farmerId) {
  const result = await query(
    `SELECT b.id, b.booking_reference, b.estimated_quintals, b.price_snapshot,
            b.status, b.cancellation_reason, b.created_at, b.qr_token_hash,
            c.id AS center_id, c.name AS center_name, c.type AS center_type,
            c.address AS center_address, c.district AS center_district,
            cr.code AS crop_code, cr.name_en AS crop_name_en, cr.name_hi AS crop_name_hi,
            s.starts_at, s.ends_at,
            (b.estimated_quintals * b.price_snapshot) AS total_indicative_value,
            qe.token_number, qe.queue_status
     FROM bookings b
     JOIN centers c ON b.center_id = c.id
     JOIN crops cr ON b.crop_id = cr.id
     JOIN slots s ON b.slot_id = s.id
     LEFT JOIN queue_entries qe ON b.id = qe.booking_id
     WHERE b.farmer_id = $1
     ORDER BY s.starts_at DESC`,
    [farmerId]
  );

  return result.rows;
}
