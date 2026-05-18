const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function login(req, res, next) {
  try {
    const { pin } = req.body;
    if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN non valido (4-6 cifre)' });
    }

    // Tenant is resolved by the resolveTenant middleware. During the
    // single-tenant transition window every user lives under the default
    // tenant, so this filter is effectively a no-op until a second tenant
    // is onboarded — but it future-proofs the login path.
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(503).json({ error: 'Tenant non risolto' });
    }

    // Fetch active users for this tenant only. We still iterate + bcrypt.compare
    // (rather than hashing client-side) to avoid leaking which users exist.
    const { rows } = await pool.query(
      'SELECT id, name, pin_hash, role, sub_role FROM users WHERE is_active = true AND tenant_id = $1',
      [tenantId]
    );

    let matchedUser = null;
    for (const user of rows) {
      const match = await bcrypt.compare(pin, user.pin_hash);
      if (match) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      req.log?.warn({
        tenantId,
        ip: req.ip,
        ua: req.get('user-agent') || '',
      }, '[auth] login fail');
      return res.status(401).json({ error: 'PIN non corretto' });
    }

    const token = jwt.sign(
      {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        sub_role: matchedUser.sub_role,
        tenant_id: tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        sub_role: matchedUser.sub_role,
        tenant_id: tenantId,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
