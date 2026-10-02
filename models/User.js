const mongoose = require("mongoose");

const preferenceSchema = new mongoose.Schema(
  {
    darkMode: { type: Boolean, default: false },
    lang: { type: String, default: "en", trim: true, maxlength: 16 },
  },
  { _id: false, strict: true },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    emailCanonical: { type: String, lowercase: true, trim: true },
    emailDisplay: { type: String, trim: true },
    pwd: { type: String, required: true },
    passwordHistory: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    emailVerified: { type: Boolean, default: true },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    passwordResetOtpHash: { type: String, default: null },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    totpEnabled: { type: Boolean, default: false },
    totpSecretEncrypted: { type: String, default: null },
    totpRecoveryCodeHashes: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    lastLoginUserAgent: { type: String, default: null },
    lastLoginUserAgentHash: { type: String, default: null },
    lastLoginGeo: { type: mongoose.Schema.Types.Mixed, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null, trim: true, maxlength: 254 },
    role: { type: String, default: "staff", trim: true, maxlength: 32 },
    fullName: { type: String, default: "", trim: true, maxlength: 120 },
    designation: { type: String, default: "", trim: true, maxlength: 80 },
    phoneNumber: { type: String, default: "", trim: true, maxlength: 32 },
    avatarUrl: { type: String, default: "", trim: true, maxlength: 512 },
    preferences: { type: preferenceSchema, default: () => ({}) },
  },
  {
    collection: "registration_coll",
    strict: true,
    versionKey: false,
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ emailVerified: 1, createdAt: -1 });
userSchema.index({ emailCanonical: 1 }, { unique: true, sparse: true });
userSchema.index(
  { emailVerificationTokenHash: 1 },
  { unique: true, sparse: true },
);
userSchema.virtual("displayEmail").get(function displayEmail() {
  return this.emailDisplay || this.email;
});
userSchema.pre("save", function normalizeEmail() {
  if (this.email) this.email = this.email.trim().toLowerCase();
  if (!this.emailCanonical && this.email)
    this.emailCanonical = this.email.trim().toLowerCase();
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
