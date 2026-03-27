const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  getTimingConfig, updateTimingConfig,
  updateItemDisplay, sendCourse, markCourseServed,
  getOrderCourseStatus,
} = require('../controllers/courses.controller');

const router = Router();

router.get('/timing',                    requireRole('admin','manager'), getTimingConfig);
router.put('/timing/:id',               requireRole('admin','manager'), updateTimingConfig);
router.patch('/items/:itemId/display',   requireRole('waiter','kitchen','manager','admin'), updateItemDisplay);
router.post('/send-course',              requireRole('waiter','manager','admin'), sendCourse);
router.post('/mark-course-served',       requireRole('waiter','manager','admin'), markCourseServed);
router.get('/order/:orderId/status',     requireRole('waiter','kitchen','manager','admin'), getOrderCourseStatus);

module.exports = router;
