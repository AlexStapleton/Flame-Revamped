const express = require('express');
const router = express.Router();

const { auth, requireAuth } = require('../middleware');
const { exportData, importData } = require('../controllers/backup');

router.route('/export').get(auth, requireAuth, exportData);
router.route('/import').post(auth, requireAuth, importData);

module.exports = router;
