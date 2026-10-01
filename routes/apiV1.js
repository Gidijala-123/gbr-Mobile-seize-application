const express = require("express");
const crypto = require("node:crypto");
const { normalizeError } = require("../middleware/errorHandler");
const {
  changePasswordSchema,
  createDeviceSchema,
  emailSchema,
  loginSchema,
  recordIdSchema,
  resetSchema,
  signupSchema,
  updateDeviceSchema,
} = require("../validation/schemas");

function createApiV1Router(dependencies) {
  const router = express.Router();
  const {
    authService,
    deviceService,
    ensureDbReady,
    normalizeStudentRecord,
    sanitizePlainText,
    emailService,
    getPublicAppUrl,
    signupRateLimit,
    loginLockoutGuard,
    loginRateLimit,
    forgotRateLimit,
    totpChallengeRateLimit,
    consumePasswordResetRateLimit,
    clearPasswordResetRateLimit,
    passwordResetRequestLimit,
    passwordResetVerifyLimit,
    passwordResetOtpTtlMs,
    totpChallengeTtlMs,
    hasSessionUser,
    regenerateSession,
    establishUserSession,
    createClientFingerprint,
    fingerprintsMatch,
    verifyTotpToken,
    decryptTotpSecret,
    recordLoginAudit,
    recordError,
  } = dependencies;

  function success(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
  }

  function failure(res, status, message, extra = {}) {
    return res.status(status).json({
      success: false,
      error: message,
      ...(res.getHeader("X-Request-Id")
        ? { requestId: res.getHeader("X-Request-Id") }
        : {}),
      ...extra,
    });
  }

  function validate(schema, value, res) {
    const result = schema.validate(value, {
      abortEarly: false,
      convert: true,
      stripUnknown: false,
    });
    if (!result.error) return result.value;
    failure(res, 422, "Request validation failed.", {
      errors: result.error.details.map((detail) => ({
        field: detail.path.length ? detail.path.join(".") : "body",
        message: detail.message,
      })),
    });
    return null;
  }

  function asyncRoute(handler) {
    return (req, res, next) =>
      Promise.resolve(handler(req, res, next)).catch(next);
  }

  function requireApiUser(req, res, next) {
    if (!hasSessionUser(req))
      return failure(res, 401, "Authentication required.");
    return next();
  }

  function publicUser(user) {
    return {
      id: String(user.id || user._id),
      email: user.emailDisplay || user.email,
      fullName: user.fullName || "",
      role: user.role || "staff",
      emailVerified: Boolean(user.emailVerified),
      createdAt: user.createdAt || null,
      preferences: {
        darkMode: Boolean(user.preferences && user.preferences.darkMode),
        lang: (user.preferences && user.preferences.lang) || "en",
      },
    };
  }

  function publicRecord(record) {
    const fields = [
      "Date",
      "Time",
      "sname",
      "spno",
      "rno",
      "clg",
      "brch",
      "year",
      "sec",
      "pname",
      "ppno",
      "ename",
      "epno",
      "eid",
      "rsn",
      "mmodel",
      "imei",
      "mclr",
      "status",
      "createdAt",
    ];
    const result = { _id: String(record._id) };
    for (const field of fields) {
      if (record[field] !== undefined) result[field] = record[field];
    }
    return result;
  }

  function validateRecordId(id, res) {
    const result = recordIdSchema.validate({ _id: id });
    if (!result.error) return result.value._id;
    failure(res, 422, "Request validation failed.", {
      errors: [{ field: "id", message: result.error.details[0].message }],
    });
    return null;
  }

  router.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (payload) => {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        if (typeof payload.success === "boolean") return json(payload);
        if (res.statusCode >= 400) return json({ success: false, ...payload });
        return json({ success: true, data: payload });
      }
      return json(payload);
    };
    next();
  });

  router.post(
    "/auth/signup",
    signupRateLimit,
    asyncRoute(async (req, res) => {
      const body = validate(signupSchema, req.body, res);
      if (!body) return;
      const emailDisplay = body.email.trim();
      const emailCanonical = authService.normalizeEmail(emailDisplay);
      const passwordError = await authService.getPasswordValidationError(
        body.pwd,
      );
      if (!authService.isEmail(emailDisplay) || passwordError)
        return failure(
          res,
          400,
          passwordError || "Enter a valid email address and password.",
        );

      await ensureDbReady();
      let existingUser = await authService.findUserByEmail(emailCanonical);
      let verificationToken = null;
      if (!existingUser) {
        verificationToken = crypto.randomBytes(32).toString("hex");
        const createdAt = new Date();
        const passwordHash = await authService.hashPassword(body.pwd);
        const user = {
          email: emailCanonical,
          emailCanonical,
          emailDisplay,
          pwd: passwordHash,
          passwordHistory: [passwordHash],
          emailVerified: false,
          emailVerificationTokenHash: crypto
            .createHash("sha256")
            .update(verificationToken)
            .digest("hex"),
          emailVerificationExpiresAt: new Date(
            createdAt.getTime() + 7 * 24 * 60 * 60 * 1000,
          ),
          createdAt,
        };
        try {
          await authService.createUser(user);
        } catch (error) {
          if (error.code === 11000 || /duplicate/i.test(error.message)) {
            existingUser = await authService.findUserByEmail(emailCanonical);
          } else {
            throw error;
          }
        }
      }

      if (emailService.isConfigured()) {
        try {
          await emailService.sendSignupNotification({
            existingUser,
            emailDisplay,
            verificationToken,
            publicAppUrl: getPublicAppUrl(),
          });
        } catch (error) {
          await recordError(
            "api-v1-signup-notification",
            emailCanonical,
            error,
          );
        }
      }

      return success(res, {
        message:
          "If this address can be registered, verification instructions will be sent.",
      });
    }),
  );

  router.post(
    "/auth/login",
    loginLockoutGuard,
    loginRateLimit,
    asyncRoute(async (req, res) => {
      const body = validate(loginSchema, req.body, res);
      if (!body) return;
      const email = authService.normalizeEmail(body.email);
      if (!authService.isEmail(email))
        return failure(res, 400, "Enter a valid email address.");

      await ensureDbReady();
      const user = await authService.authenticate(email, body.pwd);
      if (!user) {
        await recordLoginAudit(null, req, false, "invalid-credentials", email);
        return failure(res, 401, "Invalid login credentials.");
      }

      const visitorName =
        sanitizePlainText(body.uname).slice(0, 120) || email.split("@")[0];
      if (user.totpEnabled) {
        await regenerateSession(req);
        req.session.pendingTotpUser = {
          id: user._id,
          email: user.email,
          visitorName,
          clientFingerprint: createClientFingerprint(req),
          expiresAt: Date.now() + totpChallengeTtlMs,
        };
        return success(
          res,
          {
            requiresTotp: true,
            csrfToken: dependencies.refreshCsrfToken(req, res) || null,
          },
          202,
        );
      }

      await establishUserSession(req, user, visitorName);
      await recordLoginAudit(user, req, true, null);
      return success(res, {
        user: publicUser(req.session.user),
        csrfToken: dependencies.refreshCsrfToken(req, res) || null,
      });
    }),
  );

  router.post(
    "/auth/login/totp",
    totpChallengeRateLimit,
    asyncRoute(async (req, res) => {
      const pending = req.session && req.session.pendingTotpUser;
      if (!pending || pending.expiresAt <= Date.now())
        return failure(
          res,
          401,
          "The two-factor sign-in challenge has expired.",
        );
      if (
        !fingerprintsMatch(
          pending.clientFingerprint,
          createClientFingerprint(req),
        )
      )
        return failure(
          res,
          401,
          "The two-factor sign-in challenge has expired.",
        );
      const code = req.body && req.body.code;
      const recoveryCode = req.body && req.body.recoveryCode;
      if (
        (typeof code !== "string" || !/^\d{6}$/.test(code)) &&
        typeof recoveryCode !== "string"
      ) {
        return failure(
          res,
          422,
          "Enter a valid authenticator or recovery code.",
        );
      }

      await ensureDbReady();
      const user = await authService.findUserByEmail(pending.email);
      if (!user || !user.totpEnabled || String(user._id) !== String(pending.id))
        return failure(res, 401, "Invalid authenticator code.");
      const validTotp =
        typeof code === "string" &&
        (await verifyTotpToken(
          decryptTotpSecret(user.totpSecretEncrypted),
          code,
        ));
      const validRecoveryCode = !validTotp
        ? await authService.consumeTotpRecoveryCode(user, recoveryCode || code)
        : false;
      if (!validTotp && !validRecoveryCode) {
        await recordLoginAudit(user, req, false, "invalid-totp", pending.email);
        return failure(res, 401, "Invalid authenticator code.");
      }

      await establishUserSession(req, user, pending.visitorName);
      await recordLoginAudit(user, req, true, null);
      return success(res, {
        user: publicUser(req.session.user),
        csrfToken: dependencies.refreshCsrfToken(req, res) || null,
      });
    }),
  );

  router.get(
    "/auth/totp",
    requireApiUser,
    asyncRoute(async (req, res) => {
      await ensureDbReady();
      const user = await authService.findUserByEmail(req.session.user.email);
      if (!user) return failure(res, 404, "Account not found.");
      return success(res, { enabled: Boolean(user.totpEnabled) });
    }),
  );

  router.post(
    "/auth/totp/setup",
    requireApiUser,
    asyncRoute(async (req, res) => {
      await ensureDbReady();
      dependencies.getTotpEncryptionKey();
      const user = await authService.findUserByEmail(req.session.user.email);
      if (!user) return failure(res, 404, "Account not found.");
      if (user.totpEnabled)
        return failure(
          res,
          409,
          "Two-factor authentication is already enabled.",
        );
      const secret = dependencies.generateTotpSecret();
      const uri = dependencies.generateTotpUri({
        issuer: "GBR Mobile Storage",
        label: user.emailDisplay || user.email,
        secret,
      });
      req.session.pendingTotpSecret = secret;
      req.session.pendingTotpExpiresAt = Date.now() + totpChallengeTtlMs;
      return success(res, {
        secret,
        qrCode: await dependencies.qrCode.toDataURL(uri),
      });
    }),
  );

  router.post(
    "/auth/totp/confirm",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const secret = req.session.pendingTotpSecret;
      if (!secret || req.session.pendingTotpExpiresAt <= Date.now())
        return failure(res, 400, "Setup expired. Start again.");
      const code = req.body && req.body.code;
      if (!(await verifyTotpToken(secret, code)))
        return failure(res, 400, "Enter a valid authenticator code.");

      await ensureDbReady();
      const user = await authService.findUserByEmail(req.session.user.email);
      if (!user) return failure(res, 404, "Account not found.");
      if (user.totpEnabled)
        return failure(
          res,
          409,
          "Two-factor authentication is already enabled.",
        );

      const recoveryCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(8).toString("hex").toUpperCase(),
      );
      const result = await authService.updateTotpSettings(user, {
        totpEnabled: true,
        totpSecretEncrypted: dependencies.encryptTotpSecret(secret),
        totpRecoveryCodeHashes: await Promise.all(
          recoveryCodes.map(authService.hashPassword),
        ),
      });
      if (!result.matchedCount || result.ok === 0)
        return failure(res, 500, "Unable to save two-factor settings.");

      delete req.session.pendingTotpSecret;
      delete req.session.pendingTotpExpiresAt;
      return success(res, { enabled: true, recoveryCodes });
    }),
  );

  router.post(
    "/auth/totp/disable",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const password = req.body && req.body.password;
      const code = req.body && req.body.code;
      if (typeof password !== "string" || typeof code !== "string")
        return failure(res, 400, "Enter your password and authenticator code.");

      await ensureDbReady();
      const user = await authService.findUserByEmail(req.session.user.email);
      if (
        !user ||
        !user.totpEnabled ||
        !(await authService.verifyPassword(password, user.pwd))
      )
        return failure(res, 400, "Invalid password or authenticator code.");
      const secret = dependencies.decryptTotpSecret(user.totpSecretEncrypted);
      const validTotp = await verifyTotpToken(secret, code.trim());
      const validRecoveryCode = validTotp
        ? false
        : await authService.consumeTotpRecoveryCode(user, code);
      if (!validTotp && !validRecoveryCode)
        return failure(res, 400, "Invalid password or authenticator code.");

      const result = await authService.updateTotpSettings(user, {
        totpEnabled: false,
        totpSecretEncrypted: null,
        totpRecoveryCodeHashes: [],
      });
      if (!result.matchedCount || result.ok === 0)
        return failure(
          res,
          500,
          "Unable to disable two-factor authentication.",
        );
      await regenerateSession(req);
      req.session.clientFingerprint = createClientFingerprint(req);
      req.session.user = dependencies.buildSessionUser(
        user,
        user.fullName || user.emailDisplay || user.email,
      );
      return success(res, {
        enabled: false,
        csrfToken: dependencies.refreshCsrfToken(req, res) || null,
      });
    }),
  );

  router.post(
    "/auth/verify-email",
    asyncRoute(async (req, res) => {
      const token = req.body && req.body.token;
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token))
        return failure(
          res,
          400,
          "This verification token is invalid or expired.",
        );
      await ensureDbReady();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const result = await authService.verifyEmailToken(tokenHash);
      if (result.error) return failure(res, result.status, result.error);
      return success(res, { verified: true });
    }),
  );

  router.post(
    "/auth/password-reset/requests",
    forgotRateLimit,
    asyncRoute(async (req, res) => {
      const body = validate(emailSchema, req.body, res);
      if (!body) return;
      const email = authService.normalizeEmail(body.email);
      if (!authService.isEmail(email))
        return failure(res, 400, "Enter a valid email address.");
      const retryAfter = consumePasswordResetRateLimit(
        email,
        "request",
        passwordResetRequestLimit,
      );
      if (retryAfter)
        return failure(
          res,
          429,
          "Too many reset requests. Please try again later.",
          {
            retryAfter,
          },
        );

      await ensureDbReady();
      const user = await authService.findUserByEmail(email);
      if (user && emailService.isConfigured()) {
        const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
        const otpHash = await authService.hashPassword(otp);
        const expiresAt = new Date(Date.now() + passwordResetOtpTtlMs);
        const result = await authService.setPasswordResetCode(
          user,
          otpHash,
          expiresAt,
        );
        if (result.matchedCount && result.ok !== 0) {
          try {
            await emailService.sendPasswordResetCode(
              user.emailDisplay || user.email,
              otp,
            );
          } catch (error) {
            await authService.clearPasswordResetCode(user, otpHash);
            throw error;
          }
        }
      }
      return success(res, {
        message:
          "If the account exists, password reset instructions will be sent.",
      });
    }),
  );

  router.post(
    "/auth/password-reset/confirm",
    asyncRoute(async (req, res) => {
      const body = validate(resetSchema, req.body, res);
      if (!body) return;
      const email = authService.normalizeEmail(body.email);
      const passwordError = await authService.getPasswordValidationError(
        body.pwd,
      );
      if (passwordError) return failure(res, 400, passwordError);
      const retryAfter = consumePasswordResetRateLimit(
        email,
        "verify",
        passwordResetVerifyLimit,
      );
      if (retryAfter)
        return failure(
          res,
          429,
          "Too many code attempts. Please request a new code later.",
          {
            retryAfter,
          },
        );

      await ensureDbReady();
      const user = await authService.findUserByEmail(email);
      const expiresAt = user && user.passwordResetOtpExpiresAt;
      if (
        !user ||
        typeof user.passwordResetOtpHash !== "string" ||
        !(expiresAt instanceof Date) ||
        expiresAt.getTime() <= Date.now() ||
        !(await authService.verifyPassword(body.otp, user.passwordResetOtpHash))
      ) {
        return failure(res, 400, "Invalid or expired reset code.");
      }

      const result = await authService.resetPassword(
        user,
        body.pwd,
        user.passwordResetOtpHash,
      );
      if (result.error) return failure(res, result.status, result.error);
      await regenerateSession(req);
      clearPasswordResetRateLimit(email, "verify");
      return success(res, { passwordChanged: true });
    }),
  );

  router.put(
    "/auth/password",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const body = validate(changePasswordSchema, req.body, res);
      if (!body) return;
      const result = await authService.changePassword(
        req.session.user.email,
        body.currentPwd,
        body.pwd,
      );
      if (result.error) return failure(res, result.status, result.error);
      return success(res, { passwordChanged: true });
    }),
  );

  router.post(
    "/auth/logout",
    asyncRoute(async (req, res) => {
      if (!req.session) return success(res, { loggedOut: true });
      await new Promise((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
      res.clearCookie("session", {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });
      return success(res, { loggedOut: true });
    }),
  );

  router.get(
    "/users/me",
    requireApiUser,
    asyncRoute(async (req, res) => {
      await ensureDbReady();
      const user = await authService.findUserByEmail(req.session.user.email);
      if (!user) return failure(res, 404, "Account not found.");
      return success(res, publicUser(user));
    }),
  );

  router.patch(
    "/users/me",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const fullName = req.body && req.body.fullName;
      if (typeof fullName !== "string" || fullName.trim().length > 120)
        return failure(
          res,
          422,
          "fullName must be text no longer than 120 characters.",
          {
            errors: [
              {
                field: "fullName",
                message: "Enter a name of at most 120 characters.",
              },
            ],
          },
        );
      await ensureDbReady();
      const user = await authService.findUserByEmail(req.session.user.email);
      if (!user) return failure(res, 404, "Account not found.");
      const normalizedName = sanitizePlainText(fullName).slice(0, 120);
      const result = await authService.updateUser(
        { _id: user._id },
        { $set: { fullName: normalizedName } },
      );
      if (!result.matchedCount || result.ok === 0)
        return failure(res, 409, "The account could not be updated.");
      req.session.user.fullName = normalizedName;
      return success(res, publicUser({ ...user, fullName: normalizedName }));
    }),
  );

  router.get(
    "/records/deleted",
    requireApiUser,
    asyncRoute(async (req, res) => {
      await ensureDbReady();
      const data = await deviceService.listDeleted(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      );
      return success(res, { records: data });
    }),
  );

  router.get(
    "/records",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const page = Number(req.query.page === undefined ? 1 : req.query.page);
      const pageSize = Number(
        req.query.pageSize === undefined ? 25 : req.query.pageSize,
      );
      if (!Number.isInteger(page) || page < 1)
        return failure(res, 422, "page must be a positive integer.");
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
        return failure(
          res,
          422,
          "pageSize must be an integer between 1 and 100.",
        );
      const status = req.query.status;
      if (status !== undefined && !["At_office", "Returned"].includes(status))
        return failure(res, 422, "status must be At_office or Returned.");
      const search = req.query.search || "";
      if (typeof search !== "string" || search.length > 128)
        return failure(
          res,
          422,
          "search must be text no longer than 128 characters.",
        );
      const sortDirection = req.query.sortDirection === "desc" ? "desc" : "asc";
      await ensureDbReady();
      const result = await deviceService.listDataTablePage({
        draw: 0,
        start: (page - 1) * pageSize,
        length: pageSize,
        search,
        status,
        sortField: req.query.sortBy,
        sortDirection,
      });
      return success(res, {
        records: result.data.map(publicRecord),
        pagination: {
          page,
          pageSize,
          total: result.recordsFiltered,
          totalRecords: result.recordsTotal,
          totalPages: Math.ceil(result.recordsFiltered / pageSize),
        },
      });
    }),
  );

  router.post(
    "/records",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const body = validate(createDeviceSchema, req.body, res);
      if (!body) return;
      await ensureDbReady();
      const record = normalizeStudentRecord(body, body.status || "At_office");
      const created = await deviceService.create(
        record,
        req.session.user.email,
      );
      return success(res, { record: publicRecord(created) }, 201);
    }),
  );

  router.get(
    "/records/:id/audit",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const id = validateRecordId(req.params.id, res);
      if (!id) return;
      await ensureDbReady();
      const data = await deviceService.listRecentAuditLogs(250, id);
      return success(res, { events: data });
    }),
  );

  router.get(
    "/records/:id",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const id = validateRecordId(req.params.id, res);
      if (!id) return;
      await ensureDbReady();
      const records = await deviceService.findById(id);
      if (!records.length) return failure(res, 404, "Record not found.");
      return success(res, { record: publicRecord(records[0]) });
    }),
  );

  router.put(
    "/records/:id",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const id = validateRecordId(req.params.id, res);
      if (!id) return;
      if (req.body && req.body._id && req.body._id !== id)
        return failure(res, 422, "The body _id must match the record URL.");
      const body = validate(updateDeviceSchema, { ...req.body, _id: id }, res);
      if (!body) return;
      await ensureDbReady();
      const existing = await deviceService.findById(id);
      if (!existing.length) return failure(res, 404, "Record not found.");
      const record = normalizeStudentRecord(
        body,
        body.status || existing[0].status,
      );
      const result = await deviceService.updateById(
        id,
        record,
        req.session.user.email,
      );
      if (!result.matchedCount) return failure(res, 404, "Record not found.");
      const updated = await deviceService.findById(id);
      return success(res, { record: publicRecord(updated[0]) });
    }),
  );

  router.post(
    "/records/:id/return",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const id = validateRecordId(req.params.id, res);
      if (!id) return;
      await ensureDbReady();
      const result = await deviceService.markReturned(
        id,
        req.session.user.email,
      );
      if (!result.matchedCount) return failure(res, 404, "Record not found.");
      const records = await deviceService.findById(id);
      return success(res, { record: publicRecord(records[0]) });
    }),
  );

  router.post(
    "/records/:id/restore",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const id = validateRecordId(req.params.id, res);
      if (!id) return;
      await ensureDbReady();
      const result = await deviceService.restoreById(
        id,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        req.session.user.email,
      );
      if (!result.matchedCount)
        return failure(res, 404, "Deleted record not found or expired.");
      return success(res, { id, restored: true });
    }),
  );

  router.delete(
    "/records/:id",
    requireApiUser,
    asyncRoute(async (req, res) => {
      const id = validateRecordId(req.params.id, res);
      if (!id) return;
      await ensureDbReady();
      const result = await deviceService.deleteById(id, req.session.user.email);
      if (!result.matchedCount) return failure(res, 404, "Record not found.");
      return success(res, { id, deleted: true });
    }),
  );

  router.use((req, res) => failure(res, 404, "API endpoint not found."));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error && error.field)
      return failure(res, 422, error.message, {
        errors: [{ field: error.field, message: error.message }],
      });
    const details = normalizeError(error, req.app && req.app.get("env"));
    if (details.statusCode >= 500) {
      console.error("Versioned API request failed:", error);
      void Promise.resolve()
        .then(() =>
          recordError(
            "api-v1",
            hasSessionUser(req) ? req.session.user.email : null,
            error,
          ),
        )
        .catch((loggingError) =>
          console.error("Unable to record v1 API error:", loggingError),
        );
    }
    return failure(res, details.statusCode, details.message, {
      ...(details.field ? { field: details.field } : {}),
    });
  });

  return router;
}

module.exports = { createApiV1Router };
