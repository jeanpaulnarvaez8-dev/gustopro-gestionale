const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { enqueuePrintJob, enqueueTestPrint, getPendingJobs, getQueueSize } = require('../controllers/print.controller');

const router = Router();

// Enqueue: autenticato JWT (montato sotto verifyToken). Usato dall'app.
router.post('/enqueue', enqueuePrintJob);
router.get('/queue-size', getQueueSize);
// JP 2026-06-08: stampa di prova (admin only) per verificare stampanti
// dopo cambi cavo/posizione.
router.post('/test', requireRole('admin', 'manager'), enqueueTestPrint);

module.exports = router;

// L'endpoint /pending/:tenant_slug e' PUBBLICO (token-based) e va in
// public.routes.js — vedi commento li'.
