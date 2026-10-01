const mongoose = require("mongoose");

const deviceRecordSchema = new mongoose.Schema(
  {
    Date: { type: String, trim: true, maxlength: 32 },
    Time: { type: String, trim: true, maxlength: 16 },
    sname: { type: String, trim: true, maxlength: 120 },
    spno: { type: String, trim: true, maxlength: 16 },
    rno: { type: String, trim: true, maxlength: 32 },
    clg: { type: String, trim: true, maxlength: 120 },
    brch: { type: String, trim: true, maxlength: 80 },
    year: { type: String, trim: true, maxlength: 12 },
    sec: { type: String, trim: true, maxlength: 16 },
    pname: { type: String, trim: true, maxlength: 120 },
    ppno: { type: String, trim: true, maxlength: 16 },
    ename: { type: String, trim: true, maxlength: 120 },
    epno: { type: String, trim: true, maxlength: 16 },
    eid: { type: String, trim: true, maxlength: 64 },
    rsn: { type: String, trim: true, maxlength: 1000 },
    mmodel: { type: String, trim: true, maxlength: 120 },
    imei: { type: String, trim: true, maxlength: 15 },
    mclr: { type: String, trim: true, maxlength: 60 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null, trim: true, maxlength: 254 },
    createdAt: { type: Date, default: Date.now },
    statusChangedBy: { type: String, default: null, lowercase: true, trim: true, maxlength: 254 },
    statusChangedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["At_office", "Returned"],
      default: "At_office",
    },
  },
  { collection: "student_data", strict: true, versionKey: false },
);

deviceRecordSchema.index({ rno: 1 });
deviceRecordSchema.index(
  { rno: 1, clg: 1, brch: 1, year: 1, sec: 1 },
  { unique: true, name: "student_class_roll_unique" },
);
deviceRecordSchema.index({ status: 1 });
deviceRecordSchema.index({ deletedAt: 1 });
deviceRecordSchema.index({ status: 1, clg: 1 });
deviceRecordSchema.index({ brch: 1, year: 1 });
deviceRecordSchema.index({ createdAt: -1 });
deviceRecordSchema.index({ deletedAt: 1, status: 1 });
deviceRecordSchema.virtual("studentName").get(function studentName() {
  return this.sname || "";
});
deviceRecordSchema.pre("save", function setDefaultStatus() {
  if (!this.status) this.status = "At_office";
});

module.exports =
  mongoose.models.DeviceRecord ||
  mongoose.model("DeviceRecord", deviceRecordSchema);