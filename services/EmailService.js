function normalizeConfig(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, "");
}

function createEmailService({ nodemailer }) {
  let transporter = null;

  function getCredentials() {
    return {
      user: normalizeConfig(process.env.GMAIL_USER),
      password: normalizeConfig(process.env.GMAIL_PASS),
    };
  }

  function isConfigured() {
    const { user, password } = getCredentials();
    return Boolean(user && password);
  }

  function getTransporter(user, password) {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass: password },
      });
    }
    return transporter;
  }

  async function send(mailOptions) {
    const { user, password } = getCredentials();
    if (!user || !password) throw new Error("Mail service is not configured");
    return getTransporter(user, password).sendMail({
      from: user,
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
        html: `<p>Welcome back.</p><p><a href="${publicAppUrl}/">Sign in to GBR Mobile Storage</a></p>`,
      });
    }
    const verificationUrl = `${publicAppUrl}/verify-email?token=${verificationToken}`;
    return send({
      to: emailDisplay,
      subject: "Verify your GBR Mobile Storage account",
      text: `Welcome to GBR Mobile Storage. Verify your email within 7 days: ${verificationUrl}`,
      html: `<p>Welcome to GBR Mobile Storage.</p><p><a href="${verificationUrl}">Verify your email address</a></p><p>This link expires in 7 days.</p>`,
    });
  }

  function sendPasswordResetCode(email, otp) {
    return send({
      to: email,
      subject: "Password reset code",
      text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: `<p>Your password reset code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`,
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
