const {
  hashPassword: hashWithIterations,
  safeHashCompare,
  verifyPassword,
} = require("../utils/crypto");

function createAuthService({
  getUserRepository,
  validator,
  isCommonPassword,
  passwordHashIterations,
  passwordHistoryLimit = 5,
}) {
  const plusAddressDomains = new Set([
    "outlook.com",
    "hotmail.com",
    "hotmail.co.uk",
    "live.com",
    "msn.com",
    "yahoo.com",
    "ymail.com",
    "rocketmail.com",
  ]);
  const hashPassword = (password) =>
    hashWithIterations(password, passwordHashIterations);

  function normalizeEmail(email) {
    if (typeof email !== "string") return "";
    const normalized = email.trim().toLowerCase();
    const separator = normalized.lastIndexOf("@");
    if (separator <= 0) return normalized;

    let localPart = normalized.slice(0, separator);
    let domain = normalized.slice(separator + 1);
    if (domain === "gmail.com" || domain === "googlemail.com") {
      localPart = localPart.split("+")[0].replace(/\./g, "");
      domain = "gmail.com";
    } else if (plusAddressDomains.has(domain)) {
      localPart = localPart.split("+")[0];
    }
    return `${localPart}@${domain}`;
  }

  function isEmail(email) {
    return typeof email === "string" && validator.isEmail(email);
  }

  async function getPasswordValidationError(password) {
    if (typeof password !== "string" || password.length < 10 || password.length > 128)
      return "Password must be between 10 and 128 characters.";
    if (await isCommonPassword(password)) return "Choose a less common password.";
    if (
      !validator.isStrongPassword(password, {
        minLength: 10,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
    ) {
      return "Password must contain a number, a symbol, and mixed case letters.";
    }
    return null;
  }

  async function findUserByEmail(email) {
    const canonicalEmail = normalizeEmail(email);
    const users = getUserRepository();
    const canonicalUser = await users.findOne({ emailCanonical: canonicalEmail });
    if (canonicalUser) return canonicalUser;

    const legacyUser = await users.findOne({ email: canonicalEmail });
    if (legacyUser) return legacyUser;

    const legacyUsers = await users.find({});
    return legacyUsers.find((user) => normalizeEmail(user.email) === canonicalEmail) || null;
  }

  async function wasPasswordUsed(password, user) {
    const history = Array.isArray(user.passwordHistory)
      ? user.passwordHistory.slice(-passwordHistoryLimit)
      : [];
    if (typeof user.pwd === "string" && !history.includes(user.pwd))
      history.push(user.pwd);

    for (const hash of new Set(history.slice(-passwordHistoryLimit))) {
      if (await verifyPassword(password, hash)) return true;
    }
    return false;
  }

  function getNextPasswordHistory(user, nextPasswordHash) {
    const history = Array.isArray(user.passwordHistory)
      ? user.passwordHistory.slice(-passwordHistoryLimit)
      : [];
    if (typeof user.pwd === "string" && !history.includes(user.pwd))
      history.push(user.pwd);
    history.push(nextPasswordHash);
    return history.slice(-passwordHistoryLimit);
  }

  function createUser(user) {
    return getUserRepository().insert(user);
  }

  async function authenticate(email, password) {
    const user = await findUserByEmail(email);
    return user && (await verifyPassword(password, user.pwd)) ? user : null;
  }

  function updateUser(filter, updateDoc) {
    return getUserRepository().update(filter, updateDoc);
  }

  async function findUserByVerificationToken(tokenHash) {
    return getUserRepository().findOne({
      emailVerificationTokenHash: tokenHash,
    });
  }

  async function verifyEmailToken(tokenHash, now = Date.now()) {
    const user = await findUserByVerificationToken(tokenHash);
    if (
      !user ||
      !(user.emailVerificationExpiresAt instanceof Date) ||
      user.emailVerificationExpiresAt.getTime() <= now
    ) {
      return { error: "This verification link is invalid or expired.", status: 400 };
    }

    const result = await updateUser(
      { _id: user._id, emailVerificationTokenHash: tokenHash },
      {
        $set: {
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      },
    );
    if (result.matchedCount === 0 || result.ok === 0)
      return { error: "This verification link is invalid or expired.", status: 400 };
    return { user, result };
  }

  function updateTotpSettings(user, settings) {
    return updateUser({ _id: user._id }, { $set: settings });
  }

  async function consumeTotpRecoveryCode(user, recoveryCode) {
    if (typeof recoveryCode !== "string") return false;
    const normalizedCode = recoveryCode.trim().toUpperCase();
    const hashes = user.totpRecoveryCodeHashes || [];
    let matchedIndex = -1;
    for (let index = 0; index < hashes.length; index += 1) {
      if (await verifyPassword(normalizedCode, hashes[index])) {
        matchedIndex = index;
        break;
      }
    }
    if (matchedIndex < 0) return false;

    const remainingCodes = hashes.filter((_hash, index) => index !== matchedIndex);
    const result = await updateUser(
      { _id: user._id, totpRecoveryCodeHashes: hashes },
      { $set: { totpRecoveryCodeHashes: remainingCodes } },
    );
    return result.matchedCount !== 0 && result.ok !== 0;
  }

  async function changePassword(email, currentPassword, nextPassword) {
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(currentPassword, user.pwd)))
      return { error: "Current password is incorrect.", status: 400 };
    if (await wasPasswordUsed(nextPassword, user))
      return {
        error: "Cannot reuse any of your last 5 passwords.",
        status: 400,
      };

    const passwordHash = await hashPassword(nextPassword);
    const passwordHistory = getNextPasswordHistory(user, passwordHash);
    const result = await updateUser(
      { _id: user._id, pwd: user.pwd },
      { $set: { pwd: passwordHash, passwordHistory } },
    );
    if (result.matchedCount === 0 || result.ok === 0)
      return { error: "Password changed. Please try again.", status: 409 };
    return { user, result };
  }

  function setPasswordResetCode(user, otpHash, expiresAt) {
    return updateUser(
      { _id: user._id },
      {
        $set: {
          passwordResetOtpHash: otpHash,
          passwordResetOtpExpiresAt: expiresAt,
        },
      },
    );
  }

  function clearPasswordResetCode(user, otpHash) {
    return updateUser(
      { _id: user._id, passwordResetOtpHash: otpHash },
      {
        $set: {
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
        },
      },
    );
  }

  async function resetPassword(user, nextPassword, otpHash) {
    if (await wasPasswordUsed(nextPassword, user))
      return {
        error: "Cannot reuse any of your last 5 passwords.",
        status: 400,
      };

    const passwordHash = await hashPassword(nextPassword);
    const passwordHistory = getNextPasswordHistory(user, passwordHash);
    const result = await updateUser(
      { _id: user._id, passwordResetOtpHash: otpHash },
      {
        $set: {
          pwd: passwordHash,
          passwordHistory,
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
        },
      },
    );
    if (result.matchedCount === 0 || result.ok === 0)
      return { error: "Invalid or expired reset code.", status: 400 };
    return { user, result };
  }

  return {
    authenticate,
    changePassword,
    clearPasswordResetCode,
    consumeTotpRecoveryCode,
    createUser,
    findUserByEmail,
    findUserByVerificationToken,
    getNextPasswordHistory,
    getPasswordValidationError,
    hashPassword,
    isEmail,
    normalizeEmail,
    resetPassword,
    safeHashCompare,
    setPasswordResetCode,
    updateUser,
    verifyPassword,
    verifyEmailToken,
    updateTotpSettings,
    wasPasswordUsed,
  };
}

module.exports = { createAuthService };