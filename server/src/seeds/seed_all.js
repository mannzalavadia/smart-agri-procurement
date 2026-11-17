import bcrypt from 'bcryptjs';
import { initDb, query, withTransaction } from '../config/db.js';

export async function seedAll({ clean = false } = {}) {
  console.log('🌱 Starting comprehensive database seeding...');
  await initDb();

  if (clean) {
    try {
      await query(`
        TRUNCATE TABLE 
          demo_scenarios,
          email_jobs,
          notifications,
          payment_events,
          payments,
          receipts,
          procurement_records,
          queue_entries,
          slot_holds,
          booking_events,
          bookings,
          slots,
          center_closures,
          center_verifications,
          audit_logs
        CASCADE;

        DELETE FROM users WHERE email NOT IN (
          'admin@agriprocure.local',
          'operator.lucknow@agriprocure.local',
          'operator.kisan@agriprocure.local',
          'farmer.ramesh@agriprocure.local',
          'farmer.suresh@agriprocure.local'
        );
      `);
    } catch (e) {
      // Table might not exist yet if before migrations
    }
  }

  const adminHash = await bcrypt.hash('Admin@12345', 10);
  const operatorHash = await bcrypt.hash('Operator@12345', 10);
  const farmerHash = await bcrypt.hash('Farmer@12345', 10);

  await withTransaction(async (client) => {
    // 1. Seed Master Crops (FR-03)
    console.log('🌾 Seeding master crops catalog...');
    const crops = [
      { code: 'wheat', name_en: 'Wheat (Gehun)', name_hi: 'गेहूं', unit: 'quintal' },
      { code: 'rice', name_en: 'Paddy / Rice (Dhan)', name_hi: 'धान / चावल', unit: 'quintal' },
      { code: 'maize', name_en: 'Maize (Makka)', name_hi: 'मक्का', unit: 'quintal' },
      { code: 'mustard', name_en: 'Mustard (Sarson)', name_hi: 'सरसों', unit: 'quintal' },
      { code: 'gram', name_en: 'Gram / Chickpea (Chana)', name_hi: 'चना', unit: 'quintal' },
    ];

    const cropMap = {};
    for (const crop of crops) {
      const res = await client.query(`
        INSERT INTO crops (code, name_en, name_hi, unit)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE 
        SET name_en = EXCLUDED.name_en, name_hi = EXCLUDED.name_hi
        RETURNING id, code;
      `, [crop.code, crop.name_en, crop.name_hi, crop.unit]);
      cropMap[res.rows[0].code] = res.rows[0].id;
    }

    // 2. Seed Administrator
    console.log('👤 Seeding Administrator...');
    const adminRes = await client.query(`
      INSERT INTO users (email, password_hash, role, token_version, is_active)
      VALUES ('admin@agriprocure.local', $1, 'admin', 1, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `, [adminHash]);
    const adminId = adminRes.rows[0].id;

    // 3. Seed Operators
    console.log('🏢 Seeding Operators...');
    const op1 = await client.query(`
      INSERT INTO users (email, password_hash, role, token_version, is_active)
      VALUES ('operator.lucknow@agriprocure.local', $1, 'operator', 1, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `, [operatorHash]);
    const op1Id = op1.rows[0].id;

    const op2 = await client.query(`
      INSERT INTO users (email, password_hash, role, token_version, is_active)
      VALUES ('operator.kisan@agriprocure.local', $1, 'operator', 1, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `, [operatorHash]);
    const op2Id = op2.rows[0].id;

    // 4. Seed Farmers & Profiles
    console.log('🚜 Seeding Farmers...');
    const farmer1 = await client.query(`
      INSERT INTO users (email, password_hash, role, token_version, is_active)
      VALUES ('farmer.ramesh@agriprocure.local', $1, 'farmer', 1, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `, [farmerHash]);

    await client.query(`
      INSERT INTO farmer_profiles (
        user_id, name, mobile, state, district, village, pincode,
        latitude, longitude, preferred_language
      )
      VALUES ($1, 'Ramesh Kumar Verma', '9876543210', 'Uttar Pradesh', 'Lucknow', 'Bakshi Ka Talab', '226201', 26.9800, 80.9200, 'hi')
      ON CONFLICT (user_id) DO UPDATE 
      SET name = EXCLUDED.name, preferred_language = EXCLUDED.preferred_language;
    `, [farmer1.rows[0].id]);

    const farmer2 = await client.query(`
      INSERT INTO users (email, password_hash, role, token_version, is_active)
      VALUES ('farmer.suresh@agriprocure.local', $1, 'farmer', 1, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `, [farmerHash]);

    await client.query(`
      INSERT INTO farmer_profiles (
        user_id, name, mobile, state, district, village, pincode,
        latitude, longitude, preferred_language
      )
      VALUES ($1, 'Suresh Chandra Singh', '9876543211', 'Uttar Pradesh', 'Lucknow', 'Mohanlalganj', '226301', 26.6800, 80.9800, 'en')
      ON CONFLICT (user_id) DO UPDATE 
      SET name = EXCLUDED.name, preferred_language = EXCLUDED.preferred_language;
    `, [farmer2.rows[0].id]);

    // 5. Seed 6 Procurement Centers (3 Govt + 3 Private around Lucknow, FR-13)
    console.log('🏬 Seeding 6 Procurement Centers around Lucknow...');
    const centersData = [
      {
        name: 'Lucknow Central Krishi Mandi Samiti',
        type: 'government',
        address: 'Sitapur Road, Near Ring Road, Lucknow',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226020',
        latitude: 26.9124,
        longitude: 80.9324,
        phone: '0522-2731101',
        status: 'approved',
        active: 'active',
        assignedOperator: op1Id,
        wheatPrice: 2275.00,
        ricePrice: 2183.00,
        maizePrice: 2090.00,
        mustardPrice: 5650.00,
        gramPrice: 5440.00,
      },
      {
        name: 'Bakshi Ka Talab Government Procurement Depot',
        type: 'government',
        address: 'Main NH-24, Bakshi Ka Talab, Lucknow',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226201',
        latitude: 27.0120,
        longitude: 80.8920,
        phone: '0522-2821200',
        status: 'approved',
        active: 'active',
        assignedOperator: null,
        wheatPrice: 2275.00,
        ricePrice: 2183.00,
        maizePrice: 2090.00,
        mustardPrice: 5650.00,
        gramPrice: 5440.00,
      },
      {
        name: 'Mohanlalganj State Grain Procurement Mandi',
        type: 'government',
        address: 'Jail Road Junction, Mohanlalganj, Lucknow',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226301',
        latitude: 26.6780,
        longitude: 80.9950,
        phone: '0522-2931405',
        status: 'approved',
        active: 'active',
        assignedOperator: null,
        wheatPrice: 2275.00,
        ricePrice: 2183.00,
        maizePrice: 2090.00,
        mustardPrice: 5650.00,
        gramPrice: 5440.00,
      },
      {
        name: 'Kisan Agro Logistics Hub',
        type: 'private',
        address: 'Faizabad Road, Chinhat, Lucknow',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226028',
        latitude: 26.8850,
        longitude: 81.0120,
        phone: '0522-4105210',
        status: 'approved',
        active: 'active',
        assignedOperator: op2Id,
        wheatPrice: 2320.00,
        ricePrice: 2225.00,
        maizePrice: 2120.00,
        mustardPrice: 5750.00,
        gramPrice: 5550.00,
      },
      {
        name: 'Avadh Farmers Modern Warehouse & Mandi',
        type: 'private',
        address: 'Hardoi Road, Malihabad, Lucknow',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226102',
        latitude: 26.9210,
        longitude: 80.7120,
        phone: '0522-4821033',
        status: 'approved',
        active: 'active',
        assignedOperator: null,
        wheatPrice: 2310.00,
        ricePrice: 2210.00,
        maizePrice: 2105.00,
        mustardPrice: 5720.00,
        gramPrice: 5500.00,
      },
      {
        name: 'Pragati Kisan Private Procurement Center',
        type: 'private',
        address: 'Raebareli Road, Mohanlalganj, Lucknow',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226301',
        latitude: 26.7450,
        longitude: 80.9410,
        phone: '0522-4912044',
        status: 'pending_verification', // For testing pending verification flow
        active: 'active',
        assignedOperator: null,
        wheatPrice: 2330.00,
        ricePrice: 2235.00,
        maizePrice: 2130.00,
        mustardPrice: 5780.00,
        gramPrice: 5560.00,
      },
    ];

    for (const cData of centersData) {
      // Check if center exists by name
      const existing = await client.query('SELECT id FROM centers WHERE name = $1', [cData.name]);
      let centerId;
      if (existing.rows.length === 0) {
        const centerRes = await client.query(`
          INSERT INTO centers (
            name, type, address, district, state, pincode,
            latitude, longitude, contact_phone, verification_status, active_state
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id;
        `, [
          cData.name, cData.type, cData.address, cData.district, cData.state,
          cData.pincode, cData.latitude, cData.longitude, cData.phone,
          cData.status, cData.active
        ]);
        centerId = centerRes.rows[0].id;
      } else {
        centerId = existing.rows[0].id;
        await client.query(`
          UPDATE centers 
          SET verification_status = $1, 
              active_state = $2, 
              contact_phone = $3,
              latitude = $4,
              longitude = $5,
              address = $6
          WHERE id = $7
        `, [
          cData.status, cData.active, cData.phone,
          cData.latitude, cData.longitude, cData.address,
          centerId
        ]);
      }

      // Assign Operator if specified
      if (cData.assignedOperator) {
        await client.query(`
          INSERT INTO center_operator_assignments (operator_id, center_id, role_in_center)
          VALUES ($1, $2, 'manager')
          ON CONFLICT (operator_id, center_id) DO NOTHING;
        `, [cData.assignedOperator, centerId]);
      }

      // Add regular schedule (Mon-Sat, 9am - 5pm, 30 min, 10 farmers, 100 quintals)
      for (let day = 1; day <= 6; day++) {
        await client.query(`
          INSERT INTO center_schedules (
            center_id, day_of_week, open_time, close_time,
            slot_duration_minutes, default_max_farmers, default_max_quintals
          )
          VALUES ($1, $2, '09:00:00', '17:00:00', 30, 10, 100.00)
          ON CONFLICT DO NOTHING;
        `, [centerId, day]);
      }

      // Add accepted crops and prices
      const cropPrices = [
        { id: cropMap.wheat, rate: cData.wheatPrice },
        { id: cropMap.rice, rate: cData.ricePrice },
        { id: cropMap.maize, rate: cData.maizePrice },
        { id: cropMap.mustard, rate: cData.mustardPrice },
        { id: cropMap.gram, rate: cData.gramPrice },
      ];

      for (const cp of cropPrices) {
        if (cp.id) {
          await client.query(`
            INSERT INTO center_crops (center_id, crop_id, is_accepted)
            VALUES ($1, $2, TRUE)
            ON CONFLICT (center_id, crop_id) DO UPDATE SET is_accepted = TRUE;
          `, [centerId, cp.id]);

          await client.query(`
            INSERT INTO center_crop_prices (center_id, crop_id, rate_per_quintal, effective_from)
            VALUES ($1, $2, $3, NOW());
          `, [centerId, cp.id, cp.rate]);
        }
      }
    }
  });

  console.log('✅ Complete database seeding finished successfully.');
}

if (process.argv[1]?.endsWith('seed_all.js') || process.argv[1]?.endsWith('seed_phase2.js')) {
  seedAll().then(() => process.exit(0)).catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });
}
