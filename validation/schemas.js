const Joi = require("joi");

const email = Joi.string().trim().email().required();
const password = Joi.string().min(10).max(128).required();
const rollNumber = Joi.string().trim().alphanum().max(32).required();
const recordId = Joi.string().hex().length(24).required();
const optionalText = (max) => Joi.string().trim().max(max).allow("");
const requiredText = (max) => Joi.string().trim().min(1).max(max).required();
const phone = Joi.string()
  .trim()
  .pattern(/^\+?[1-9]\d{9,14}$/)
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
const createDeviceSchema = Joi.object({
  ...deviceRecordFields,
  status: Joi.string().valid("At_office", "Returned"),
});
const updateDeviceSchema = Joi.object({
  ...deviceRecordFields,
  _id: recordId,
  status: Joi.string().valid("At_office", "Returned"),
});
const recordIdSchema = Joi.object({ _id: recordId });
const returnDeviceSchema = recordIdSchema;
const deleteSchema = recordIdSchema;

module.exports = {
  changePasswordSchema,
  createDeviceSchema,
  deleteSchema,
  emailSchema,
  loginSchema,
  recordIdSchema,
  resetSchema,
  returnDeviceSchema,
  signupSchema,
  updateDeviceSchema,
};