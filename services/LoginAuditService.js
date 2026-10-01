const crypto = require("node:crypto");

function createLoginAuditService({
  getUserRepository,
  getAuditRepository,
  getAuditContext,
  emailService,
  recordError,
  logger = console,
}) {
  async function recordLoginAudit(user, req, success, reason, emailOverride) {
    try {
      const email = user ? user.email : emailOverride;
      const { ip, userAgent, geo } = getAuditContext(req);
      const userAgentHash = crypto
        .createHash("sha256")
        .update(userAgent)
        .digest("hex");
      let newDevice = false;

      if (success && user) {
        const previousLoginAt = user.lastLoginAt
          ? new Date(user.lastLoginAt).getTime()
          : 0;
        const previousGeo = user.lastLoginGeo || null;
        newDevice = Boolean(
          previousLoginAt &&
            (user.lastLoginIp !== ip ||
              user.lastLoginUserAgentHash !== userAgentHash ||
              (geo && previousGeo && geo.city !== previousGeo.city)),
        );
        await getUserRepository().update(
          { _id: user._id },
          {
            $set: {
              lastLoginAt: new Date(),
              lastLoginIp: ip,
              lastLoginUserAgent: userAgent,
              lastLoginUserAgentHash: userAgentHash,
              lastLoginGeo: geo,
            },
          },
        );
      }

      await getAuditRepository().insert({
        email: email || null,
        ip,
        userAgent,
        userAgentHash,
        geo,
        success,
        reason: success ? null : reason,
        timestamp: new Date(),
      });

      if (newDevice && user && emailService.isConfigured()) {
        const location = geo
          ? [geo.city, geo.region, geo.country].filter(Boolean).join(", ")
          : "Location unavailable";
        try {
          await emailService.sendNewDeviceAlert({
            user,
            ip,
            userAgent,
            location,
            time: new Date().toISOString(),
          });
        } catch (err) {
          await recordError("new-device-alert", user.email, err);
        }
      }
    } catch (err) {
      logger.error("Unable to record login audit:", err.message);
    }
  }

  return { recordLoginAudit };
}

module.exports = { createLoginAuditService };