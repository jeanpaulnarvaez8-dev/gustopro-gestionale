const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  listCombos, createCombo, updateCombo, deleteCombo,
  addCourse, removeCourse, addCourseItem, removeCourseItem,
} = require('../controllers/combo.controller');

const router = Router();
const mgr = requireRole('admin', 'manager');

router.get('/',                              listCombos);
router.post('/',                       mgr,  createCombo);
router.put('/:id',                     mgr,  updateCombo);
router.delete('/:id',                  mgr,  deleteCombo);
router.post('/:id/courses',            mgr,  addCourse);
router.delete('/courses/:courseId',    mgr,  removeCourse);
router.post('/courses/:courseId/items',mgr,  addCourseItem);
router.delete('/course-items/:itemId', mgr,  removeCourseItem);

module.exports = router;
