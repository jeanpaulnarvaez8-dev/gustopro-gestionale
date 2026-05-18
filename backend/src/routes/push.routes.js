const { Router } = require('express');
const { getPublicKey, subscribe, unsubscribe, sendTest } = require('../controllers/push.controller');

const router = Router();

// /api/push/key e' anche utile pre-subscribe (frontend lo legge per
// pushManager.subscribe). Non e' un segreto (public key).
router.get('/key',           getPublicKey);
router.post('/subscribe',    subscribe);
router.post('/unsubscribe',  unsubscribe);
router.post('/test',         sendTest);

module.exports = router;
