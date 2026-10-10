const express = require('express');
const router = express.Router();

const { auth, requireAuth } = require('../middleware');

const {
  getPihole,
  updatePihole,
  setPiholeBlocking,
} = require('../controllers/pihole/getPihole');

// auth (not requireAuth) only decides how much error detail to return.
router.route('/').get(auth, getPihole);

// Protected: skips the cache, so public access would let anyone make Flame hit
// Pi-hole on every request.
router.route('/update').get(auth, requireAuth, updatePihole);

// Protected: changes DNS blocking for the whole network.
router.route('/:id/blocking').post(auth, requireAuth, setPiholeBlocking);

module.exports = router;
