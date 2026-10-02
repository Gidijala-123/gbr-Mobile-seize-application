function calculatePasswordStrength(password) {
  const value = typeof password === "string" ? password : "";
  const hasLowercase = /[a-z]/.test(value);
  const hasUppercase = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const meetCount = [hasLowercase, hasUppercase, hasNumber, hasSymbol].filter(Boolean).length;
  const meetsPolicy = value.length >= 10 && hasLowercase && hasUppercase && hasNumber && hasSymbol;

  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 12) score += 1;
  if (hasLowercase) score += 1;
  if (hasUppercase) score += 1;
  if (hasNumber) score += 1;
  if (hasSymbol) score += 1;

  let label = "Weak";
  let percent = 0;

  if (meetsPolicy) {
    label = "Strong";
    percent = 100;
  } else if (value.length >= 10 && meetCount >= 2) {
    label = "Fair";
    percent = 25;
  } else if (value.length >= 10 && meetCount >= 1) {
    label = "Fair";
    percent = 15;
  } else {
    label = "Weak";
    percent = value ? Math.min(10, Math.max(5, value.length * 2)) : 0;
  }

  return {
    score: Math.max(0, Math.min(6, score)),
    label,
    percent,
    meetsPolicy,
  };
}

module.exports = {
  calculatePasswordStrength,
};
