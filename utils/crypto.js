const crypto = require("node:crypto");
const { promisify } = require("node:util");

const pbkdf2 = promisify(crypto.pbkdf2);
const DEFAULT_PASSWORD_HASH_ITERATIONS = 60000;

async function hashPassword(
  password,
  iterations = DEFAULT_PASSWORD_HASH_ITERATIONS,
) {
  if (typeof password !== "string")
    throw new TypeError("Password must be a string.");
  if (!Number.isInteger(iterations) || iterations <= 0)
    throw new RangeError(
      "Password hash iterations must be a positive integer.",
    );

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await pbkdf2(password, salt, iterations, 64, "sha512");
  return `pbkdf2$${iterations}$${salt}$${derivedKey.toString("hex")}`;
}

function safeHashCompare(expectedHex, actualBuffer) {
  if (
    typeof expectedHex !== "string" ||
    !/^(?:[a-f0-9]{2})+$/i.test(expectedHex) ||
    !Buffer.isBuffer(actualBuffer)
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHex, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  try {
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (error) {
    return false;
  }
}

async function verifyPassword(password, storedPassword) {
  if (
    typeof password !== "string" ||
    typeof storedPassword !== "string" ||
    !storedPassword.startsWith("pbkdf2$")
  ) {
    return false;
  }

  const [, iterationsRaw, salt, expected] = storedPassword.split("$");
  if (!iterationsRaw || !salt || !expected) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const actual = await pbkdf2(password, salt, iterations, 64, "sha512");
  return safeHashCompare(expected, actual);
}

module.exports = {
  DEFAULT_PASSWORD_HASH_ITERATIONS,
  hashPassword,
  safeHashCompare,
  verifyPassword,
};
