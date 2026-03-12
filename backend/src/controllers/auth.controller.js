const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function login(req, res, next) {
  try {
    const { pin } = req.body;
    if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN non valido (4-6 cifre)' });
    }

    // Fetch all active users (we compare hashes client-side to avoid timing oracle)
    const { rows } = await pool.query(
      'SELECT id, name, pin_hash, role FROM users WHERE is_active = true'
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
      return res.status(401).json({ error: 'PIN non corretto' });
    }

    const token = jwt.sign(
      { id: matchedUser.id, name: matchedUser.name, role: matchedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
