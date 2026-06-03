const { Router } = require('express');
const { enqueuePrintJob, getPendingJobs, getQueueSize } = require('../controllers/print.controller');

const router = Router();

// Enqueue: autenticato JWT (montato sotto verifyToken). Usato dall'app.
router.post('/enqueue', enqueuePrintJob);
router.get('/queue-size', getQueueSize);

module.exports = router;

// L'endpoint /pending/:tenant_slug e' PUBBLICO (token-based) e va in
// public.routes.js — vedi commento li'.
