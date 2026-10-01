function validateRequest(schema) {
  return function requestValidation(req, res, next) {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      convert: true,
      stripUnknown: false,
    });
    if (error) {
      return res.status(422).json({
        errors: error.details.map((detail) => ({
          field: detail.path.length ? detail.path.join(".") : "body",
          message: detail.message,
        })),
      });
    }

    req.body = value;
    return next();
  };
}

module.exports = { validateRequest };