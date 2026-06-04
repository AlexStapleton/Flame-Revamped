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
const supportedExts = ['.jpg', '.jpeg', '.png', '.svg', '.ico'];

const fileFilter = (req, file, cb) => {
  // Require BOTH a supported MIME type and a supported extension. The MIME type
  // is client-controlled (spoofable), so the extension check is defense-in-depth
  // on top of the /uploads sandbox (nosniff + restrictive CSP) in api.js.
  const mimeOk = supportedTypes.includes(file.mimetype.split('/')[1]);
  const extOk = supportedExts.includes(
    path.extname(file.originalname).toLowerCase()
  );
  cb(null, mimeOk && extOk);
};

const upload = multer({
  storage,
  fileFilter,
  // Cap upload size/count so an authenticated user can't exhaust disk.
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

module.exports = upload.single('icon');
