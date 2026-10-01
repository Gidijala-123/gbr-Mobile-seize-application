const mongoose = require("mongoose");

const visitorSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Unknown", trim: true, maxlength: 120 },
    email: { type: String, default: null, lowercase: true, trim: true },
    time: { type: Date, default: Date.now },
  },
  { collection: "visitors_of_page", strict: true, versionKey: false },
);

visitorSchema.index({ email: 1, time: -1 });
visitorSchema.index({ time: -1 });
visitorSchema.index({ name: 1 });
visitorSchema.virtual("displayName").get(function displayName() {
  return this.name || "Unknown";
});
visitorSchema.pre("save", function normalizeVisitor() {
  if (this.email) this.email = this.email.trim().toLowerCase();
  if (!this.time) this.time = new Date();
});

module.exports = mongoose.models.Visitor || mongoose.model("Visitor", visitorSchema);