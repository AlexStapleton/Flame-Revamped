const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// CHANGELOG.md only changes on deploy, so read it once. A failed read throws
// before the assignment, so it is never cached.
let cachedChangelog = null;

router.get('/', async (req, res) => {
  try {
    if (cachedChangelog === null) {
      // Construct the path to CHANGELOG.md in the project's root directory
      const changelogPath = path.join(__dirname, '../CHANGELOG.md');
      cachedChangelog = fs.readFileSync(changelogPath, 'utf8');
    }
    res.type('text/plain').send(cachedChangelog);
  } catch (error) {
    console.error('Error reading changelog:', error);
    res.status(500).send('Error reading changelog file');
  }
});

module.exports = router;
