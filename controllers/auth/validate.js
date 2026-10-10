const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const verifyToken = require('../../utils/verifyToken');

// @desc      Verify token
// @route     POST /api/auth/verify
// @access    Public
const validate = asyncWrapper(async (req, res, next) => {
  try {
    verifyToken(req.body.token);

    res.status(200).json({
      success: true,
      data: { token: { isValid: true } },
    });
  } catch (err) {
    return next(new ErrorResponse('Invalid or expired token', 401));
  }
});

module.exports = validate;
