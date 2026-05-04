// Tenant-aware DB helpers.
//
// Binds the current tenant id to the Postgres session var `app.tenant_id`
// for the lifetime of the transaction. RLS policies (Step 3) will read it
// via current_setting('app.tenant_id') to filter rows automatically.
//
// Today RLS is OFF, so these helpers are forward-compat plumbing — they
// already work as drop-in replacements for pool.query / client transactions
// and will start enforcing isolation the moment RLS is enabled.
//
// Usage:
//   const { rows } = await tenantQuery(req, 'SELECT ... WHERE id=$1', [id]);
//
//   await tenantTx(req, async (client) => {
//     await client.query('INSERT ...');
//     await client.query('UPDATE ...');
//   });

const pool = require('../config/db');

async function tenantQuery(req, text, params) {
  const tenantId = req?.tenant?.id;
  if (!tenantId) {
    throw new Error('tenantQuery: req.tenant not set — is resolveTenant middleware mounted?');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(name, value, is_local=true) == SET LOCAL
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function tenantTx(req, fn) {
  const tenantId = req?.tenant?.id;
  if (!tenantId) {
    throw new Error('tenantTx: req.tenant not set — is resolveTenant middleware mounted?');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { tenantQuery, tenantTx };
