const { isDeepStrictEqual } = require("node:util");

function applyMongoUpdate(document, updateDocument) {
  if (!updateDocument || typeof updateDocument !== "object" || Array.isArray(updateDocument))
    throw new TypeError("Mongo update must be an object.");

  const updated = { ...document };
  for (const [operator, fields] of Object.entries(updateDocument)) {
    if (!operator.startsWith("$") || !fields || typeof fields !== "object")
      throw new TypeError(`Unsupported Mongo update operator: ${operator}`);

    for (const [field, value] of Object.entries(fields)) {
      if (operator === "$set") {
        updated[field] = value;
      } else if (operator === "$inc") {
        const current = updated[field] === undefined ? 0 : updated[field];
        if (typeof current !== "number" || typeof value !== "number")
          throw new TypeError(`$inc requires numeric values for ${field}.`);
        updated[field] = current + value;
      } else if (operator === "$push" || operator === "$addToSet") {
        const current = updated[field] === undefined ? [] : updated[field];
        if (!Array.isArray(current))
          throw new TypeError(`${operator} requires an array field: ${field}.`);
        const values =
          value && typeof value === "object" && !Array.isArray(value) && "$each" in value
            ? value.$each
            : [value];
        if (!Array.isArray(values))
          throw new TypeError(`${operator} $each requires an array for ${field}.`);
        updated[field] =
          operator === "$push"
            ? [...current, ...values]
            : values.reduce(
                (result, entry) =>
                  result.some((existing) => isDeepStrictEqual(existing, entry))
                    ? result
                    : [...result, entry],
                [...current],
              );
      } else {
        throw new TypeError(`Unsupported Mongo update operator: ${operator}`);
      }
    }
  }

  return updated;
}

module.exports = { applyMongoUpdate };