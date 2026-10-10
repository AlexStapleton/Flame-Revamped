const verifyToken = require('../utils/verifyToken');

const auth = (req, res, next) => {
  const authHeader = req.header('Authorization-Flame');
  let token;
  let tokenIsValid = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (token) {
    try {
      verifyToken(token);
      tokenIsValid = true;
    } catch (err) {
      tokenIsValid = false;
    }
  }

  req.isAuthenticated = tokenIsValid;

  next();
};

module.exports = auth;
