import { query, withTransaction } from '../config/db.js';

/**
 * Service for payment status tracking, authorized transitions,
 * and immutable payment event audit history (Phase 6, AT-15).
 */

export async function updatePaymentStatus({
  paymentId,
  newStatus,
  referenceId = null,
  notes = null,
  actorId,
  actorRole,
}) {
  const validStatuses = ['pending', 'processing', 'paid', 'failed'];
  if (!validStatuses.includes(newStatus)) {
    const err = new Error(`Invalid payment status: ${newStatus}`);
    err.statusCode = 400;
    err.code = 'INVALID_PAYMENT_STATUS';
    throw err;
  }

  return await withTransaction(async (client) => {
    // 1. Fetch and lock payment record
    const payRes = await client.query(
      `SELECT p.*, pr.center_id, pr.booking_id, b.farmer_id
       FROM payments p
       JOIN procurement_records pr ON p.procurement_record_id = pr.id
       JOIN bookings b ON pr.booking_id = b.id
       WHERE p.id = $1
       FOR UPDATE`,
      [paymentId]
    );

    if (payRes.rows.length === 0) {
      const err = new Error('Payment record not found');
      err.statusCode = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    const payment = payRes.rows[0];

    // 2. Authorization check: must be admin or assigned center operator
    if (actorRole !== 'admin') {
      const authRes = await client.query(
        `SELECT id FROM center_operator_assignments WHERE center_id = $1 AND operator_id = $2`,
        [payment.center_id, actorId]
      );
      if (authRes.rows.length === 0) {
        const err = new Error('Unauthorized: You are not authorized to update payments for this center.');
        err.statusCode = 403;
        err.code = 'UNAUTHORIZED_PAYMENT_OPERATOR';
        throw err;
      }
    }

    // 3. Status transition validations
    if (payment.payment_status === 'paid') {
      const err = new Error('Payment has already been marked as PAID and cannot be changed.');
      err.statusCode = 400;
      err.code = 'PAYMENT_ALREADY_SETTLED';
      throw err;
    }

    const fromStatus = payment.payment_status;
    const ref = referenceId || payment.reference_id || `TXN-REF-${Date.now()}`;

    // 4. Update payment record
    const updateRes = await client.query(
      `UPDATE payments
       SET payment_status = $1,
           reference_id = $2,
           actor_id = $3,
           notes = COALESCE($4, notes)
       WHERE id = $5
       RETURNING *`,
      [newStatus, ref, actorId, notes, paymentId]
    );

    const updatedPayment = updateRes.rows[0];

    // 5. Append immutable event to payment_events
    const eventRes = await client.query(
      `INSERT INTO payment_events (
        payment_id, procurement_record_id, from_status, to_status, amount, reference_id, actor_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        paymentId,
        payment.procurement_record_id,
        fromStatus,
        newStatus,
        payment.amount,
        ref,
        actorId,
        notes || `Transitioned from ${fromStatus} to ${newStatus}`,
      ]
    );

    return {
      payment: updatedPayment,
      event: eventRes.rows[0],
    };
  });
}

/**
 * Get full payment history with audit events
 */
export async function getPaymentDetails(paymentId) {
  const payRes = await query(
    `SELECT p.*, pr.booking_id, pr.center_id, pr.gross_weight, pr.net_weight, pr.accepted_quantity,
            pr.final_rate_per_quintal, pr.deduction_amount, pr.payable_amount, pr.outcome,
            r.receipt_number, b.booking_reference, fp.name as farmer_name,
            c.name_en as crop_name_en, cen.name as center_name
     FROM payments p
     JOIN procurement_records pr ON p.procurement_record_id = pr.id
     JOIN bookings b ON pr.booking_id = b.id
     LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
     JOIN crops c ON b.crop_id = c.id
     JOIN centers cen ON pr.center_id = cen.id
     LEFT JOIN receipts r ON r.procurement_record_id = pr.id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (payRes.rows.length === 0) {
    return null;
  }

  const eventsRes = await query(
    `SELECT pe.*, u.email as actor_email, u.role as actor_role
     FROM payment_events pe
     LEFT JOIN users u ON pe.actor_id = u.id
     WHERE pe.payment_id = $1
     ORDER BY pe.created_at ASC`,
    [paymentId]
  );

  return {
    ...payRes.rows[0],
    events: eventsRes.rows,
  };
}

/**
 * Get payments for a farmer
 */
export async function getFarmerPayments(farmerId) {
  const res = await query(
    `SELECT p.*, pr.booking_id, pr.accepted_quantity, pr.payable_amount,
            b.booking_reference, c.name_en as crop_name_en, c.name_hi as crop_name_hi,
            cen.name as center_name, r.receipt_number
     FROM payments p
     JOIN procurement_records pr ON p.procurement_record_id = pr.id
     JOIN bookings b ON pr.booking_id = b.id
     JOIN crops c ON b.crop_id = c.id
     JOIN centers cen ON pr.center_id = cen.id
     LEFT JOIN receipts r ON r.procurement_record_id = pr.id
     WHERE b.farmer_id = $1
     ORDER BY p.created_at DESC`,
    [farmerId]
  );
  return res.rows;
}

/**
 * Get payments for a center
 */
export async function getCenterPayments(centerId) {
  const res = await query(
    `SELECT p.*, pr.booking_id, pr.accepted_quantity, pr.payable_amount,
            b.booking_reference, fp.name as farmer_name, fp.mobile as farmer_phone,
            c.name_en as crop_name_en, r.receipt_number
     FROM payments p
     JOIN procurement_records pr ON p.procurement_record_id = pr.id
     JOIN bookings b ON pr.booking_id = b.id
     LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
     JOIN crops c ON b.crop_id = c.id
     LEFT JOIN receipts r ON r.procurement_record_id = pr.id
     WHERE pr.center_id = $1
     ORDER BY p.created_at DESC`,
    [centerId]
  );
  return res.rows;
}
