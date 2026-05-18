const { Router } = require('express');
const { verify } = require('../controllers/override.controller');

const router = Router();

// Accessibile a tutti i ruoli loggati (waiter+cashier richiedono override
// per operazioni sensibili). Il verify rifiuta se il PIN non e' di un
// manager/admin del tenant.
router.post('/verify', verify);

module.exports = router;
