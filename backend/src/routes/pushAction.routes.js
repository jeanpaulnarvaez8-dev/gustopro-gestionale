const { Router } = require('express');
const { execute } = require('../controllers/pushAction.controller');

const router = Router();

// POST /api/push-action — eseguito dal Service Worker (no JWT sessione).
// L'auth E' il token firmato nel body. Vedi pushAction.controller.
router.post('/', execute);

module.exports = router;
