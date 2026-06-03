const fs = require('fs');
const path = require('path');
const multer = require('multer');

if (!fs.existsSync('data/uploads')) {
  fs.mkdirSync('data/uploads', { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './data/uploads');
  },
  filename: (req, file, cb) => {
    // basename() strips any path components so a crafted originalname like
    // "../../server.js" can't escape the uploads directory (path traversal).
    const safeName = path.basename(file.originalname);
    cb(null, Date.now() + '--' + safeName);
  },
});

const supportedTypes = ['jpg', 'jpeg', 'png', 'svg', 'svg+xml', 'x-icon'];

const fileFilter = (req, file, cb) => {
  if (supportedTypes.includes(file.mimetype.split('/')[1])) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload.single('icon');
