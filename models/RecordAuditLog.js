const mongoose = require("mongoose");

const recordAuditLogSchema = new mongoose.Schema(
  {
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    field: { type: String, required: true, trim: true, maxlength: 80 },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedByEmail: { type: String, required: true, lowercase: true, trim: true },
    changedAt: { type: Date, default: Date.now },
    actionType: {
      type: String,
      enum: ["CREATE", "UPDATE", "STATUS_CHANGE", "DELETE", "RESTORE"],
      required: true,
    },
    recordRno: { type: String, default: null, trim: true, maxlength: 32 },
  },
  {
    collection: "record_audit_logs",
    strict: true,
    versionKey: false,
  },
);

recordAuditLogSchema.index({ recordId: 1, changedAt: -1 });
recordAuditLogSchema.index({ changedAt: -1 });
recordAuditLogSchema.index({ actionType: 1, changedAt: -1 });
recordAuditLogSchema.pre("save", function setAuditTimestamp() {
  if (!this.changedAt) this.changedAt = new Date();
});
recordAuditLogSchema.virtual("hasChangedValue").get(function hasChangedValue() {
  return this.oldValue !== this.newValue;
});

module.exports =
  mongoose.models.RecordAuditLog ||
  mongoose.model("RecordAuditLog", recordAuditLogSchema);