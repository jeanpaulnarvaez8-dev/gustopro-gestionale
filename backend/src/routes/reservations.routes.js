const { Router } = require('express');
const {
  listReservations, listUpcoming, createReservation, updateReservation, deleteReservation,
} = require('../controllers/reservations.controller');

const router = Router();

router.get('/',          listReservations);   // ?date=YYYY-MM-DD
router.get('/upcoming',  listUpcoming);
router.post('/',         createReservation);
router.put('/:id',       updateReservation);
router.delete('/:id',    deleteReservation);

module.exports = router;
