const mongoose = require("mongoose");

const errorReportSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, default: null, lowercase: true, trim: true },
    message: { type: String, required: true, maxlength: 4000 },
    requestId: { type: String, default: null, trim: true, maxlength: 64 },
    time: { type: Date, default: Date.now },
  },
  { collection: "error_reports", strict: true, versionKey: false },
);

errorReportSchema.index({ time: 1 });
errorReportSchema.index({ type: 1 });
errorReportSchema.index({ email: 1, time: -1 });
errorReportSchema.index({ requestId: 1 });
errorReportSchema.pre("save", function setErrorTime() {
  if (!this.time) this.time = new Date();
});

module.exports =
  mongoose.models.ErrorReport ||
  mongoose.model("ErrorReport", errorReportSchema);
