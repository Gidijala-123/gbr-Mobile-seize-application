const path = require("node:path");
const pug = require("pug");

const DEFAULT_BRANDING = {
  senderName: "GBR Mobile Storage",
  collegeName: "Aditya College of Institutions",
  collegeAddress: "Aditya PG College, Ayodhya Nagar, Kakinada, Andhra Pradesh 533437",
  collegePhone: "0884-2346661",
};

function normalizeConfig(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, "");
}

function normalizeDisplayConfig(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\r\n]+/g, " ").trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

function hiddenPreheader(text) {
  const escaped = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${escaped}</span>`;
}

function createEmailService({ nodemailer }) {
  let transporter = null;
  const renderPasswordResetEmail = pug.compileFile(
    path.join(__dirname, "../views/emails/password-reset-code.pug"),
  );

  function getCredentials() {
    const host = normalizeDisplayConfig(process.env.SMTP_HOST, "");
    return {
      host,
      user: normalizeConfig(
        host ? process.env.SMTP_USER : process.env.GMAIL_USER,
      ),
      password: normalizeConfig(
        host ? process.env.SMTP_PASS : process.env.GMAIL_PASS,
      ),
    };
  }

  function getBranding() {
    return {
      collegeName: normalizeDisplayConfig(
        process.env.COLLEGE_NAME,
        DEFAULT_BRANDING.collegeName,
      ),
      collegeAddress: normalizeDisplayConfig(
        process.env.COLLEGE_ADDRESS,
        DEFAULT_BRANDING.collegeAddress,
      ),
      collegePhone: normalizeDisplayConfig(
        process.env.COLLEGE_PHONE,
        DEFAULT_BRANDING.collegePhone,
      ),
    };
  }

  function isConfigured() {
    const { host, user, password } = getCredentials();
    if (host) return Boolean(user) === Boolean(password);
    return Boolean(user && password);
  }

  function getTransporter(user, password, host) {
    if (!transporter) {
      const rejectUnauthorized =
        String(process.env.SMTP_REJECT_UNAUTHORIZED || "true")
          .trim()
          .toLowerCase() !== "false";
      if (host) {
        const configuredPort = Number(process.env.SMTP_PORT);
        const port = Number.isInteger(configuredPort) && configuredPort > 0
          ? configuredPort
          : 587;
        const secureSetting = String(process.env.SMTP_SECURE || "")
          .trim()
          .toLowerCase();
        const options = {
          host,
          port,
          secure: secureSetting ? secureSetting === "true" : port === 465,
          tls: { rejectUnauthorized },
        };
        if (user && password) options.auth = { user, pass: password };
        transporter = nodemailer.createTransport(options);
      } else {
        transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user, pass: password },
          tls: { rejectUnauthorized },
        });
      }
    }
    return transporter;
  }

  async function send(mailOptions) {
    const { host, user, password } = getCredentials();
    if ((!host && (!user || !password)) || (host && Boolean(user) !== Boolean(password)))
      throw new Error("Mail service is not configured");
    const senderAddress =
      normalizeConfig(process.env.EMAIL_FROM_ADDRESS) ||
      normalizeConfig(process.env.GMAIL_USER) ||
      "noreply@localhost";
    const senderName = normalizeDisplayConfig(
      process.env.EMAIL_FROM_NAME,
      DEFAULT_BRANDING.senderName,
    );
    return getTransporter(user, password, host).sendMail({
      from: { name: senderName, address: senderAddress },
      ...mailOptions,
    });
  }

  function sendSignupNotification({
    existingUser,
    emailDisplay,
    verificationToken,
    publicAppUrl,
  }) {
    if (existingUser) {
      return send({
        to: existingUser.emailDisplay || existingUser.email || emailDisplay,
        subject: "Welcome back to GBR Mobile Storage",
        text: `Welcome back. Sign in to GBR Mobile Storage: ${publicAppUrl}/`,
        html: `${hiddenPreheader("Welcome back to GBR Mobile Storage.")}<p>Welcome back.</p><p><a href="${publicAppUrl}/">Sign in to GBR Mobile Storage</a></p>`,
      });
    }
    const verificationUrl = `${publicAppUrl}/verify-email?token=${verificationToken}`;
    return send({
      to: emailDisplay,
      subject: "Verify your GBR Mobile Storage account",
      text: `Welcome to GBR Mobile Storage. Verify your email within 7 days: ${verificationUrl}`,
      html: `${hiddenPreheader("Verify your GBR Mobile Storage account within 7 days.")}<p>Welcome to GBR Mobile Storage.</p><p><a href="${verificationUrl}">Verify your email address</a></p><p>This link expires in 7 days.</p>`,
    });
  }

  function sendPasswordResetCode(email, otp) {
    return send({
      to: email,
      subject: "Password reset code",
      text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: renderPasswordResetEmail({
        otp,
        preheader: "Your GBR Mobile Storage password reset code expires in 10 minutes.",
        ...getBranding(),
      }),
    });
  }

  function sendNewDeviceAlert({ user, ip, userAgent, location, time }) {
    return send({
      to: user.emailDisplay || user.email,
      subject: "New sign-in to GBR Mobile Storage",
      text: `A successful sign-in to your account was detected from a new device.\n\nTime: ${time}\nLocation: ${location}\nIP address: ${ip}\nDevice: ${userAgent}\n\nIf this was not you, reset your password and contact your administrator.`,
    });
  }

  return {
    isConfigured,
    sendNewDeviceAlert,
    sendPasswordResetCode,
    sendSignupNotification,
  };
}

module.exports = { createEmailService };
