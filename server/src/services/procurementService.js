import { query, withTransaction } from '../config/db.js';

/**
 * Service to handle crop inspection, weighing, quality grading,
 * exact payment calculation, and immutable digital receipt generation (Phase 6).
 */

export async function recordProcurementIntake({
  bookingId,
  operatorId,
  operatorRole,
  grossWeight,
  tareWeight = 0,
  qualityGrade,
  acceptedQuantity,
  deductionAmount = 0,
  outcome = 'accepted',
  rejectionReason = null,
  notes = null,
}) {
  return await withTransaction(async (client) => {
    // 1. Lock and verify booking
    const bookingRes = await client.query(
      `SELECT b.*, c.name_en as crop_name_en, c.name_hi as crop_name_hi,
              cen.name as center_name, cen.district as center_district,
              fp.name as farmer_name, fp.mobile as farmer_phone
       FROM bookings b
       JOIN crops c ON b.crop_id = c.id
       JOIN centers cen ON b.center_id = cen.id
       LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
       WHERE b.id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingRes.rows.length === 0) {
      const err = new Error('Booking not found');
      err.statusCode = 404;
      err.code = 'BOOKING_NOT_FOUND';
      throw err;
    }

    const booking = bookingRes.rows[0];

    // Check operator center authorization unless admin
    if (operatorRole !== 'admin') {
      const authRes = await client.query(
        `SELECT id FROM center_operator_assignments WHERE center_id = $1 AND operator_id = $2`,
        [booking.center_id, operatorId]
      );
      if (authRes.rows.length === 0) {
        const err = new Error('Unauthorized: You are not assigned to this procurement center.');
        err.statusCode = 403;
        err.code = 'UNAUTHORIZED_CENTER_OPERATOR';
        throw err;
      }
    }

    // Check if intake was already recorded
    const existingRec = await client.query(
      `SELECT id FROM procurement_records WHERE booking_id = $1`,
      [bookingId]
    );
    if (existingRec.rows.length > 0) {
      const err = new Error('Intake and procurement have already been recorded for this booking.');
      err.statusCode = 409;
      err.code = 'PROCUREMENT_ALREADY_RECORDED';
      throw err;
    }

    // Verify booking status
    if (['completed', 'cancelled', 'no_show', 'rescheduling_required'].includes(booking.status)) {
      const err = new Error(`Cannot process intake for booking with status: ${booking.status}`);
      err.statusCode = 400;
      err.code = 'INVALID_BOOKING_STATUS';
      throw err;
    }

    // 2. Exact Decimal Arithmetic
    const gross = Number(grossWeight);
    const tare = Number(tareWeight || 0);

    if (isNaN(gross) || gross <= 0) {
      const err = new Error('Gross weight must be a positive number');
      err.statusCode = 400;
      throw err;
    }

    if (isNaN(tare) || tare < 0 || tare >= gross) {
      const err = new Error('Tare weight must be non-negative and strictly less than gross weight');
      err.statusCode = 400;
      throw err;
    }

    // Net weight in quintals
    const netWeight = Number((gross - tare).toFixed(2));
    const rateSnapshot = Number(booking.price_snapshot);
    const deductions = Number(Number(deductionAmount || 0).toFixed(2));

    let accepted = 0;
    let grossPayable = 0;
    let payable = 0;

    if (outcome === 'rejected') {
      if (!rejectionReason || !rejectionReason.trim()) {
        const err = new Error('A rejection reason must be provided when crop is rejected.');
        err.statusCode = 400;
        err.code = 'REJECTION_REASON_REQUIRED';
        throw err;
      }
      accepted = 0.00;
      grossPayable = 0.00;
      payable = 0.00;
    } else {
      // Accepted or partially accepted
      accepted = acceptedQuantity !== undefined && acceptedQuantity !== null
        ? Number(Number(acceptedQuantity).toFixed(2))
        : netWeight;

      if (accepted <= 0) {
        const err = new Error('Accepted quantity must be greater than zero for accepted outcome.');
        err.statusCode = 400;
        throw err;
      }

      if (accepted > netWeight) {
        const err = new Error(
          `Accepted quantity (${accepted}q) cannot exceed the net weighed quantity (${netWeight}q).`
        );
        err.statusCode = 400;
        err.code = 'ACCEPTED_EXCEEDS_NET';
        throw err;
      }

      grossPayable = Number((accepted * rateSnapshot).toFixed(2));
      payable = Math.max(0, Number((grossPayable - deductions).toFixed(2)));
    }

    // 3. Insert procurement record
    const insertRecRes = await client.query(
      `INSERT INTO procurement_records (
        booking_id, center_id, operator_id,
        gross_weight, tare_weight, net_weight, accepted_quantity,
        quality_grade, final_rate_per_quintal, deduction_amount, payable_amount,
        outcome, rejection_reason, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        bookingId,
        booking.center_id,
        operatorId,
        gross.toFixed(2),
        tare.toFixed(2),
        netWeight.toFixed(2),
        accepted.toFixed(2),
        qualityGrade || 'Grade A',
        rateSnapshot.toFixed(2),
        deductions.toFixed(2),
        payable.toFixed(2),
        outcome,
        rejectionReason || null,
        notes || null,
      ]
    );

    const procurementRecord = insertRecRes.rows[0];

    // 4. Update Booking status to completed
    await client.query(
      `UPDATE bookings
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [bookingId]
    );

    // 5. Update Queue Entry status to completed if present
    await client.query(
      `UPDATE queue_entries
       SET queue_status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE booking_id = $1`,
      [bookingId]
    );

    // 6. Generate sequential receipt number: RCP-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countRes = await client.query(
      `SELECT COUNT(*) as cnt FROM receipts WHERE issued_at >= (NOW() - INTERVAL '24 hours')`
    );
    const seq = String(Number(countRes.rows[0]?.cnt || 0) + 1).padStart(4, '0');
    const receiptNumber = `RCP-${dateStr}-${seq}`;

    // 7. Generate snapshot data for immutable receipt
    const snapshotData = {
      receiptNumber,
      bookingReference: booking.booking_reference,
      center: {
        id: booking.center_id,
        name: booking.center_name,
        district: booking.center_district,
      },
      farmer: {
        id: booking.farmer_id,
        name: booking.farmer_name,
        phone: booking.farmer_phone,
      },
      crop: {
        id: booking.crop_id,
        nameEn: booking.crop_name_en,
        nameHi: booking.crop_name_hi,
      },
      weights: {
        grossWeightQuintals: gross,
        tareWeightQuintals: tare,
        netWeightQuintals: netWeight,
        acceptedQuantityQuintals: accepted,
      },
      grading: {
        qualityGrade: qualityGrade || 'Grade A',
        outcome,
        rejectionReason: rejectionReason || null,
      },
      financials: {
        ratePerQuintal: rateSnapshot,
        grossPayable,
        deductionAmount: deductions,
        payableAmount: payable,
      },
      inspectedBy: {
        operatorId,
      },
      issuedAt: new Date().toISOString(),
    };

    const insertReceiptRes = await client.query(
      `INSERT INTO receipts (
        procurement_record_id, receipt_number, version, content_snapshot
      ) VALUES ($1, $2, 1, $3)
      RETURNING *`,
      [procurementRecord.id, receiptNumber, JSON.stringify(snapshotData)]
    );

    const receipt = insertReceiptRes.rows[0];

    // 8. Create initial payment row
    const insertPaymentRes = await client.query(
      `INSERT INTO payments (
        procurement_record_id, amount, payment_status, reference_id, actor_id, notes
      ) VALUES ($1, $2, 'pending', $3, $4, 'Generated on crop intake')
      RETURNING *`,
      [procurementRecord.id, payable.toFixed(2), `TXN-${receiptNumber}`, operatorId]
    );

    const payment = insertPaymentRes.rows[0];

    // 9. Create initial payment audit event
    await client.query(
      `INSERT INTO payment_events (
        payment_id, procurement_record_id, from_status, to_status, amount, reference_id, actor_id, notes
      ) VALUES ($1, $2, NULL, 'pending', $3, $4, $5, 'Initial payment record created')`,
      [payment.id, procurementRecord.id, payable.toFixed(2), payment.reference_id, operatorId]
    );

    return {
      procurementRecord,
      receipt,
      payment,
    };
  });
}

/**
 * Get procurement record and receipt by booking ID
 */
export async function getProcurementByBookingId(bookingId) {
  const res = await query(
    `SELECT pr.*, r.receipt_number, r.content_snapshot, r.issued_at as receipt_issued_at,
            p.id as payment_id, p.payment_status, p.amount as payment_amount, p.reference_id as payment_reference
     FROM procurement_records pr
     LEFT JOIN receipts r ON r.procurement_record_id = pr.id
     LEFT JOIN payments p ON p.procurement_record_id = pr.id
     WHERE pr.booking_id = $1`,
    [bookingId]
  );
  return res.rows[0] || null;
}

/**
 * Get receipts for a farmer
 */
export async function getFarmerReceipts(farmerId) {
  const res = await query(
    `SELECT r.*, pr.booking_id, pr.outcome, pr.payable_amount, pr.accepted_quantity,
            b.booking_reference, c.name_en as crop_name_en, c.name_hi as crop_name_hi,
            cen.name as center_name, p.payment_status
     FROM receipts r
     JOIN procurement_records pr ON r.procurement_record_id = pr.id
     JOIN bookings b ON pr.booking_id = b.id
     JOIN crops c ON b.crop_id = c.id
     JOIN centers cen ON b.center_id = cen.id
     LEFT JOIN payments p ON p.procurement_record_id = pr.id
     WHERE b.farmer_id = $1
     ORDER BY r.issued_at DESC`,
    [farmerId]
  );
  return res.rows;
}

/**
 * Get receipt by receipt number or ID
 */
export async function getReceiptByIdOrNumber(identifier) {
  const res = await query(
    `SELECT r.*, pr.booking_id, pr.outcome, pr.payable_amount, pr.accepted_quantity,
            b.booking_reference, c.name_en as crop_name_en, c.name_hi as crop_name_hi,
            cen.name as center_name, p.payment_status, p.reference_id as payment_reference
     FROM receipts r
     JOIN procurement_records pr ON r.procurement_record_id = pr.id
     JOIN bookings b ON pr.booking_id = b.id
     JOIN crops c ON b.crop_id = c.id
     JOIN centers cen ON b.center_id = cen.id
     LEFT JOIN payments p ON p.procurement_record_id = pr.id
     WHERE r.id::text = $1 OR r.receipt_number = $1`,
    [identifier]
  );
  return res.rows[0] || null;
}

/**
 * List center procurement records
 */
export async function getCenterProcurements(centerId) {
  const res = await query(
    `SELECT pr.*, r.receipt_number, b.booking_reference,
            fp.name as farmer_name, fp.mobile as farmer_phone,
            c.name_en as crop_name_en, c.name_hi as crop_name_hi,
            p.payment_status, p.id as payment_id
     FROM procurement_records pr
     JOIN bookings b ON pr.booking_id = b.id
     LEFT JOIN farmer_profiles fp ON b.farmer_id = fp.user_id
     JOIN crops c ON b.crop_id = c.id
     LEFT JOIN receipts r ON r.procurement_record_id = pr.id
     LEFT JOIN payments p ON p.procurement_record_id = pr.id
     WHERE pr.center_id = $1
     ORDER BY pr.inspected_at DESC`,
    [centerId]
  );
  return res.rows;
}
