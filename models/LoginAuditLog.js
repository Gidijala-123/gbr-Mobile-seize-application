const mongoose = require("mongoose");

const loginAuditLogSchema = new mongoose.Schema(
  {
    email: { type: String, default: null, lowercase: true, trim: true },
    ip: { type: String, required: true, maxlength: 64 },
    userAgent: { type: String, required: true, maxlength: 512 },
    userAgentHash: { type: String, required: true, maxlength: 64 },
    geo: { type: mongoose.Schema.Types.Mixed, default: null },
    success: { type: Boolean, required: true },
    reason: { type: String, default: null, maxlength: 120 },
    timestamp: { type: Date, default: Date.now },
  },
  { collection: "login_audit_logs", strict: true, versionKey: false },
);

loginAuditLogSchema.index({ email: 1, timestamp: -1 });
loginAuditLogSchema.index({ timestamp: -1 });
loginAuditLogSchema.index({ ip: 1, timestamp: -1 });
loginAuditLogSchema.virtual("isSuccess").get(function isSuccess() {
  return this.success;
});
loginAuditLogSchema.pre("save", function setAuditTimestamp() {
  if (!this.timestamp) this.timestamp = new Date();
});

module.exports =
  mongoose.models.LoginAuditLog ||
  mongoose.model("LoginAuditLog", loginAuditLogSchema);