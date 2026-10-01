const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    expires: { type: Date, default: null },
    session: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { collection: "sessions", strict: true, versionKey: false },
);

sessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
sessionSchema.pre("save", function initializeSession() {
  if (!this.session) this.session = {};
});
sessionSchema.virtual("userId").get(function userId() {
  return this.session && this.session.user ? this.session.user.id : null;
});

module.exports = mongoose.models.Session || mongoose.model("Session", sessionSchema);