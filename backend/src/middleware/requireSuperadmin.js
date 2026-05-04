// requireSuperadmin — protects routes that perform tenant-level operations
// (create / update / list tenants). Authenticates via a static secret in
// the `X-Superadmin-Key` header that must match SUPERADMIN_API_KEY in env.
//
// We deliberately avoid coupling to the JWT/role system: tenant onboarding
// is a server-to-server / CLI operation, not a user-facing flow. Keeping
// it out-of-band means a compromised admin user cannot escalate to create
// new tenants.

function requireSuperadmin(req, res, next) {
  const expected = process.env.SUPERADMIN_API_KEY;
  if (!expected) {
    return res.status(503).json({
      error: 'SUPERADMIN_API_KEY non configurata sul server',
    });
  }

  const provided = req.headers['x-superadmin-key'];
  if (!provided || provided !== expected) {
    // Generic message — do not reveal whether the header was missing or wrong.
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  return next();
}

module.exports = { requireSuperadmin };
