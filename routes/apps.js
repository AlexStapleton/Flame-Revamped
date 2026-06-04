const express = require('express');
const router = express.Router();

// middleware
const { auth, requireAuth, upload } = require('../middleware');

const {
  createApp,
  getAllApps,
  getSingleApp,
  updateApp,
  deleteApp,
  reorderApps,
  syncApps,
} = require('../controllers/apps');

router
  .route('/')
  .post(auth, requireAuth, upload, createApp)
  .get(auth, getAllApps);

router
  .route('/:id')
  .get(auth, getSingleApp)
  .put(auth, requireAuth, upload, updateApp)
  .delete(auth, requireAuth, deleteApp);

router.route('/0/reorder').put(auth, requireAuth, reorderApps);

// On-demand Docker/Kubernetes sync. Sync no longer happens on the public GET
// (it ran writes + an external call on every page load); it runs on a schedule
// and via this authenticated endpoint instead.
router.route('/sync').post(auth, requireAuth, syncApps);

module.exports = router;
