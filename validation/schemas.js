const Joi = require("joi");

const VALID_DEVICE_STATUSES = Object.freeze([
  "At_office",
  "Returned",
  "On_hold",
  "Transferred_out",
  "Confiscated_permanently",
  "Pending_disposal",
]);

const normalizeDeviceStatus = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const mapped = {
    "at office": "At_office",
    "at_office": "At_office",
    "returned": "Returned",
    "on hold": "On_hold",
    "on_hold": "On_hold",
    "transferred out": "Transferred_out",
    "transferred_out": "Transferred_out",
    "confiscated permanently": "Confiscated_permanently",
    "confiscated_permanently": "Confiscated_permanently",
    "pending disposal": "Pending_disposal",
    "pending_disposal": "Pending_disposal",
  };
  return mapped[trimmed.toLowerCase()] || trimmed;
};

const email = Joi.string().trim().email().required();
const password = Joi.string().min(10).max(128).required();
const rollNumber = Joi.string().trim().alphanum().max(32).required();
const recordId = Joi.string().hex().length(24).required();
const optionalText = (max) => Joi.string().trim().max(max).allow("");
const requiredText = (max) => Joi.string().trim().min(1).max(max).required();
const phone = Joi.string()
  .trim()
  .pattern(/^[+()\d\s-]{10,20}$/)
  .allow("");

const deviceRecordFields = {
  Date: optionalText(32),
  Time: optionalText(16),
  sname: requiredText(120),
  spno: phone,
  rno: rollNumber,
  clg: requiredText(120),
  brch: requiredText(80),
  year: requiredText(12),
  sec: requiredText(16),
  pname: optionalText(120),
  ppno: phone,
  ename: optionalText(120),
  epno: phone,
  eid: optionalText(64),
  rsn: optionalText(1000),
  devicePhotos: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim().max(2048)).max(3),
      Joi.string().trim().max(4096),
    )
    .optional(),
  mmodel: requiredText(120),
  imei: Joi.string().trim().pattern(/^\d{15}$/).required(),
  mclr: optionalText(60),
};

const signupSchema = Joi.object({ email, pwd: password });
const loginSchema = Joi.object({
  email,
  pwd: Joi.string().min(1).required(),
  uname: optionalText(120),
});
const emailSchema = Joi.object({ email });
const resetSchema = Joi.object({
  email,
  otp: Joi.string().pattern(/^\d{6}$/).required(),
  pwd: password,
});
const changePasswordSchema = Joi.object({
  currentPwd: Joi.string().min(1).required(),
  pwd: password,
});
const statusValue = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const normalized = normalizeDeviceStatus(value);
    if (!VALID_DEVICE_STATUSES.includes(normalized)) {
      return helpers.message(
        `status must be one of: ${VALID_DEVICE_STATUSES.join(", ")}.`,
      );
    }
    return normalized;
  }, "valid device status");

const createDeviceSchema = Joi.object({
  ...deviceRecordFields,
  status: statusValue.optional(),
});
const updateDeviceSchema = Joi.object({
  ...deviceRecordFields,
  _id: recordId,
  __v: Joi.number().integer().min(0),
  status: statusValue.optional(),
});
const recordIdSchema = Joi.object({ _id: recordId });
const returnDeviceSchema = Joi.object({
  _id: recordId,
  returnedBy: Joi.string().trim().min(1).max(120).required(),
  returnRelation: Joi.string().trim().min(1).max(60).required(),
  returnedAt: Joi.date().iso().required(),
  returnNotes: Joi.string().trim().max(1000).allow(""),
  returnSignature: Joi.string().trim().max(1048576).allow(""),
  returnSignatureText: Joi.string().trim().max(120).allow(""),
}).custom((value, helpers) => {
  if (!value.returnSignature && !value.returnSignatureText) {
    return helpers.message(
      "A signature or typed acknowledgement name is required.",
    );
  }
  return value;
}, "signature required");
const deleteSchema = recordIdSchema;

module.exports = {
  VALID_DEVICE_STATUSES,
  changePasswordSchema,
  createDeviceSchema,
  deleteSchema,
  emailSchema,
  loginSchema,
  normalizeDeviceStatus,
  recordIdSchema,
  resetSchema,
  returnDeviceSchema,
  signupSchema,
  updateDeviceSchema,
};