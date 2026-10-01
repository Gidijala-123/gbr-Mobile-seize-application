function positiveIntegerSetting(environment, name, fallback, maximum) {
  const rawValue = environment[name];
  if (rawValue === undefined || rawValue === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new RangeError(
      `${name} must be an integer between 1 and ${maximum}.`,
    );
  return value;
}

function getBodyParserLimits(environment = process.env) {
  return {
    jsonLimitMb: positiveIntegerSetting(environment, "JSON_LIMIT_MB", 1, 100),
    formLimitMb: positiveIntegerSetting(environment, "FORM_LIMIT_MB", 5, 100),
    parameterLimit: positiveIntegerSetting(
      environment,
      "PARAMETER_LIMIT",
      1000,
      10000,
    ),
  };
}

function createBodyParsers(express, environment = process.env) {
  const limits = getBodyParserLimits(environment);
  return {
    limits,
    json: express.json({ limit: `${limits.jsonLimitMb}mb` }),
    urlencoded: express.urlencoded({
      extended: false,
      limit: `${limits.formLimitMb}mb`,
      parameterLimit: limits.parameterLimit,
    }),
  };
}

module.exports = { createBodyParsers, getBodyParserLimits };
