const pool = require('../config/db');
const { getIO } = require('../socket');

async function listReservations(req, res, next) {
  try {
    const { date } = req.query;  // YYYY-MM-DD, defaults to today
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT r.*,
              t.table_number, t.seats,
              u.name AS created_by_name,
              c.phone AS customer_phone_from_crm
       FROM reservations r
       LEFT JOIN tables    t ON t.id = r.table_id
       LEFT JOIN users     u ON u.id = r.created_by
       LEFT JOIN customers c ON c.id = r.customer_id
       WHERE r.reserved_date = $1
       ORDER BY r.reserved_time, r.customer_name`,
      [targetDate]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function listUpcoming(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              t.table_number,
              c.phone AS customer_phone_from_crm
       FROM reservations r
       LEFT JOIN tables    t ON t.id = r.table_id
       LEFT JOIN customers c ON c.id = r.customer_id
       WHERE r.reserved_date >= CURRENT_DATE
         AND r.status NOT IN ('cancelled','no_show')
       ORDER BY r.reserved_date, r.reserved_time
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createReservation(req, res, next) {
  try {
    const {
      customer_id, customer_name, customer_phone,
      table_id, party_size, reserved_date, reserved_time, notes,
    } = req.body;

    if (!customer_name?.trim()) return res.status(400).json({ error: 'Nome cliente obbligatorio' });
    if (!reserved_date)         return res.status(400).json({ error: 'Data obbligatoria' });
    if (!reserved_time)         return res.status(400).json({ error: 'Orario obbligatorio' });

    const { rows: [r] } = await pool.query(
      `INSERT INTO reservations
         (customer_id, customer_name, customer_phone, table_id,
          party_size, reserved_date, reserved_time, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        customer_id || null, customer_name.trim(), customer_phone || null,
        table_id || null, party_size || 2,
        reserved_date, reserved_time, notes || null,
        req.user.id,
      ]
    );

    // Mark table as reserved if assigned
    if (table_id) {
      await pool.query(
        "UPDATE tables SET status='reserved' WHERE id=$1 AND status='free'",
        [table_id]
      );
      getIO()?.emit('table-status-changed', { tableId: table_id, status: 'reserved' });
    }

    getIO()?.to('role:admin').to('role:manager').emit('reservation:new', {
      id: r.id,
      customer_name: r.customer_name,
      party_size:    r.party_size,
      reserved_date: r.reserved_date,
      reserved_time: r.reserved_time,
    });

    res.status(201).json(r);
  } catch (err) { next(err); }
}

async function updateReservation(req, res, next) {
  try {
    const { id } = req.params;
    const {
      customer_name, customer_phone, table_id,
      party_size, reserved_date, reserved_time, status, notes,
    } = req.body;

    const { rows: [r] } = await pool.query(
      `UPDATE reservations SET
         customer_name  = COALESCE($1, customer_name),
         customer_phone = COALESCE($2, customer_phone),
         table_id       = COALESCE($3, table_id),
         party_size     = COALESCE($4, party_size),
         reserved_date  = COALESCE($5, reserved_date),
         reserved_time  = COALESCE($6, reserved_time),
         status         = COALESCE($7, status),
         notes          = COALESCE($8, notes),
         updated_at     = NOW()
       WHERE id=$9 RETURNING *`,
      [
        customer_name || null, customer_phone || null, table_id || null,
        party_size || null, reserved_date || null, reserved_time || null,
        status || null, notes || null, id,
      ]
    );
    if (!r) return res.status(404).json({ error: 'Prenotazione non trovata' });

    // If seated → mark table occupied
    if (status === 'seated' && r.table_id) {
      await pool.query(
        "UPDATE tables SET status='occupied' WHERE id=$1", [r.table_id]
      );
      getIO()?.emit('table-status-changed', { tableId: r.table_id, status: 'occupied' });
    }
    // If cancelled → free up table
    if (status === 'cancelled' && r.table_id) {
      // Only free if no open order exists
      const { rows: [open] } = await pool.query(
        "SELECT id FROM orders WHERE table_id=$1 AND status='open' LIMIT 1",
        [r.table_id]
      );
      if (!open) {
        await pool.query(
          "UPDATE tables SET status='free' WHERE id=$1 AND status='reserved'",
          [r.table_id]
        );
        getIO()?.emit('table-status-changed', { tableId: r.table_id, status: 'free' });
      }
    }

    res.json(r);
  } catch (err) { next(err); }
}

async function deleteReservation(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [r] } = await pool.query(
      'DELETE FROM reservations WHERE id=$1 RETURNING *', [id]
    );
    if (!r) return res.status(404).json({ error: 'Non trovata' });

    // Free table if reserved
    if (r.table_id) {
      await pool.query(
        "UPDATE tables SET status='free' WHERE id=$1 AND status='reserved'",
        [r.table_id]
      );
      getIO()?.emit('table-status-changed', { tableId: r.table_id, status: 'free' });
    }
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listReservations, listUpcoming, createReservation, updateReservation, deleteReservation };
