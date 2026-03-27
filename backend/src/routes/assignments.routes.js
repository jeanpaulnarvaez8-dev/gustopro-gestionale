const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  listAssignments,
  myAssignments,
  createAssignment,
  deleteAssignment,
  copyFromYesterday,
} = require('../controllers/assignments.controller');

const router = Router();

router.get('/',               requireRole('manager','admin'), listAssignments);
router.get('/my',             requireRole('waiter','manager','admin'), myAssignments);
router.post('/',              requireRole('manager','admin'), createAssignment);
router.post('/copy-yesterday', requireRole('manager','admin'), copyFromYesterday);
router.delete('/:id',         requireRole('manager','admin'), deleteAssignment);

module.exports = router;
