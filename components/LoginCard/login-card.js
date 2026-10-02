// ── Animated particle canvas ──────────────────────────────────────
(function () {
  var cv = document.getElementById('bg-canvas');
  var cx = cv.getContext('2d');
  var pts = [];
  function rs() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  rs(); window.addEventListener('resize', rs);
  for (var i = 0; i < 70; i++) {
    pts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height,
      r: Math.random() * 1.6 + 0.3, dx: (Math.random() - 0.5) * 0.35,
      dy: (Math.random() - 0.5) * 0.35, o: Math.random() * 0.45 + 0.12 });
  }
  function draw() {
    cx.clearRect(0, 0, cv.width, cv.height);
    pts.forEach(function (p) {
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(167,243,208,' + p.o + ')'; cx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > cv.width) p.dx *= -1;
      if (p.y < 0 || p.y > cv.height) p.dy *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── Overlay panel toggle ──────────────────────────────────────────
var wr = document.getElementById('authWrapper');
document.getElementById('signUpBtn').addEventListener('click', function () {
  wr.classList.add('right-panel-active');
});
document.getElementById('signInBtn').addEventListener('click', function () {
  wr.classList.remove('right-panel-active');
});
var msl = document.getElementById('mobileSignupLink');
var mll = document.getElementById('mobileLoginLink');
if (msl) msl.addEventListener('click', function () { wr.classList.add('right-panel-active'); });
if (mll) mll.addEventListener('click', function () { wr.classList.remove('right-panel-active'); });

// ── Password toggle (eye icon) ────────────────────────────────────
$('.toggle-password').on('click', function () {
  var inp = $($(this).attr('toggle'));
  var visible = inp.attr('type') === 'password';
  inp.attr('type', visible ? 'text' : 'password');
  $(this).find('.fa').toggleClass('fa-eye fa-eye-slash');
  $(this).attr('aria-label', visible ? 'Hide password' : 'Show password');
  $(this).attr('aria-pressed', String(visible));
});

function calculatePasswordStrength(password) {
  var value = typeof password === 'string' ? password : '';
  var hasLowercase = /[a-z]/.test(value);
  var hasUppercase = /[A-Z]/.test(value);
  var hasNumber = /\d/.test(value);
  var hasSymbol = /[^A-Za-z0-9]/.test(value);
  var meetsPolicy = value.length >= 10 && hasLowercase && hasUppercase && hasNumber && hasSymbol;
  var score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 12) score += 1;
  if (hasLowercase) score += 1;
  if (hasUppercase) score += 1;
  if (hasNumber) score += 1;
  if (hasSymbol) score += 1;

  var label = 'Weak';
  var percent = 0;
  var meetCount = [hasLowercase, hasUppercase, hasNumber, hasSymbol].filter(Boolean).length;

  if (meetsPolicy) {
    label = 'Strong';
    percent = 100;
  } else if (value.length >= 10 && meetCount >= 2) {
    label = 'Fair';
    percent = 25;
  } else if (value.length >= 10 && meetCount >= 1) {
    label = 'Fair';
    percent = 15;
  } else {
    label = 'Weak';
    percent = value ? Math.min(10, Math.max(5, value.length * 2)) : 0;
  }

  return {
    score: Math.max(0, Math.min(6, score)),
    label: label,
    percent: percent,
    meetsPolicy: meetsPolicy
  };
}

function updatePasswordStrengthMeter() {
  var fill = document.getElementById('password-strength-fill');
  var label = document.getElementById('password-strength-label');
  var input = document.getElementById('password1');
  var submitBtn = document.getElementById('signupSubmitBtn');
  if (!fill || !label || !input) return;

  var strength = calculatePasswordStrength(input.value);
  var color = strength.label === 'Strong' ? '#10b981' : strength.label === 'Good' ? '#3b82f6' : strength.label === 'Fair' ? '#f59e0b' : '#ef4444';
  fill.style.width = strength.percent + '%';
  fill.style.background = 'linear-gradient(90deg, ' + color + ' 0%, ' + color + ' 100%)';
  label.textContent = 'Password strength: ' + strength.label;

  if (submitBtn) {
    var hasMinLength = input.value.length >= 10 && input.value.length <= 128;
    var passwordOkay = strength.meetsPolicy && hasMinLength;
    submitBtn.disabled = !passwordOkay;
  }
}

// ── Password match indicator ──────────────────────────────────────
function updatePasswordMessage() {
  var msg = document.getElementById('message');
  if (!msg) return;
  var p1 = document.getElementById('password1');
  var p2 = document.getElementById('password2');
  var v1 = p1 ? p1.value : '', v2 = p2 ? p2.value : '';
  updatePasswordStrengthMeter();
  if (!v1 && !v2) { msg.innerHTML = ''; msg.className = 'match-msg'; return; }
  var meetsPolicy = v1.length >= 10 && v1.length <= 128 &&
    /[a-z]/.test(v1) && /[A-Z]/.test(v1) && /\d/.test(v1) && /[^A-Za-z0-9]/.test(v1);
  if (v1 === v2 && meetsPolicy) {
    msg.className = 'match-msg match';
    msg.textContent = 'Passwords match';
  } else if (v1 === v2 && v1) {
    msg.className = 'match-msg no-match';
    msg.textContent = 'Use uppercase, lowercase, a number, and a symbol';
  } else {
    msg.className = 'match-msg no-match';
    msg.textContent = v1.length < 10 ? 'Minimum 10 characters required' : 'Passwords do not match';
  }
}
function check() { updatePasswordMessage(); }
var ip1 = document.getElementById('password1'), ip2 = document.getElementById('password2');
if (ip1) ip1.addEventListener('input', updatePasswordMessage);
if (ip2) ip2.addEventListener('input', updatePasswordMessage);
if (ip1) updatePasswordStrengthMeter();

var loginForm = document.getElementById('login-form');
var signupForm = document.getElementById('signup-form');
var loginError = document.getElementById('login-error-msg');
var loginSubmit = document.getElementById('login-submit');
var loginStep = 'password';
var loginUsingRecovery = false;
var loginLoading = false;

function showLoginMessage(message) {
  if (!loginError) return;
  loginError.textContent = message || '';
  loginError.hidden = !message;
}

function setLoginState(state) {
  var defaultState = document.getElementById('login-btn-default');
  var loadingState = document.getElementById('login-btn-loading');
  var successState = document.getElementById('login-btn-success');
  if (defaultState) defaultState.hidden = state !== 'default';
  if (loadingState) loadingState.hidden = state !== 'loading';
  if (successState) successState.hidden = state !== 'success';
  if (loginSubmit) loginSubmit.disabled = state === 'loading' || state === 'success';
}

function finishSignIn() {
  loginLoading = false;
  setLoginState('success');
  window.setTimeout(function () { window.location.href = '/home'; }, 700);
}

function setTotpStep() {
  loginStep = 'totp';
  document.querySelectorAll('[data-login-primary]').forEach(function (element) {
    element.hidden = true;
    element.querySelectorAll('input, button').forEach(function (control) {
      control.disabled = true;
    });
  });
  var codeGroup = document.getElementById('totp-login-group');
  var recoveryToggle = document.getElementById('toggle-recovery');
  var codeInput = document.getElementById('totpLoginCode');
  if (codeGroup) codeGroup.hidden = false;
  if (recoveryToggle) recoveryToggle.hidden = false;
  if (codeInput) {
    codeInput.disabled = false;
    codeInput.focus();
  }
  showLoginMessage('Enter the code from your authenticator app.');
}

if (signupForm) signupForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  if (!signupForm.reportValidity()) return;
  var email = document.getElementById('signupname');
  var password = document.getElementById('password1');
  var confirmation = document.getElementById('password2');
  if (!email || !password || !confirmation || password.value !== confirmation.value) {
    alert('Please enter a valid email and matching passwords.');
    return;
  }
  var strength = calculatePasswordStrength(password.value);
  if (!strength.meetsPolicy || password.value.length > 128) {
    alert('Password must contain an uppercase letter, a lowercase letter, a number, and a symbol.');
    return;
  }
  var submit = document.getElementById('signupSubmitBtn');
  if (submit) submit.disabled = true;
  try {
    await window.authRequest('/postsignup', { email: email.value, pwd: password.value });
    signupForm.reset();
    updatePasswordMessage();
    alert('Registration submitted. Check your email for the verification link.');
  } catch (error) {
    alert(error.message || 'Unable to create your account.');
  } finally {
    if (submit) submit.disabled = false;
  }
});

if (loginForm) loginForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  if (loginLoading) return;
  loginLoading = true;
  setLoginState('loading');
  showLoginMessage('');
  var wakeTimer = window.setTimeout(function () { showLoginMessage('Waking up server...'); }, 4000);
  var longTimer = window.setTimeout(function () { showLoginMessage('Almost there...'); }, 12000);
  try {
    var response;
    if (loginStep === 'totp') {
      var code = document.getElementById('totpLoginCode').value.trim();
      if (!code) throw new Error('Enter your verification code.');
      response = await window.authRequest('/postlogin/totp', loginUsingRecovery
        ? { recoveryCode: code }
        : { code: code });
      finishSignIn();
      return;
    }

    var email = document.getElementById('loginname');
    var password = document.getElementById('password3');
    if (!loginForm.reportValidity()) {
      loginLoading = false;
      setLoginState('default');
      return;
    }
    response = await window.authRequest('/postlogin', { email: email.value, pwd: password.value });
    if (response.status === 202 && response.data && response.data.requiresTotp) {
      var tokenMeta = document.querySelector('meta[name="csrf-token"]');
      if (tokenMeta && response.data.csrfToken) tokenMeta.content = response.data.csrfToken;
      loginLoading = false;
      setLoginState('default');
      setTotpStep();
      return;
    }
    finishSignIn();
  } catch (error) {
    loginLoading = false;
    setLoginState('default');
    showLoginMessage(error.message || 'Unable to sign in. Please try again.');
    var passwordInput = document.getElementById('password3');
    if (passwordInput && loginStep === 'password') passwordInput.value = '';
  } finally {
    window.clearTimeout(wakeTimer);
    window.clearTimeout(longTimer);
  }
});

var recoveryToggle = document.getElementById('toggle-recovery');
var totpCodeInput = document.getElementById('totpLoginCode');
if (totpCodeInput) totpCodeInput.disabled = true;
if (recoveryToggle) recoveryToggle.addEventListener('click', function () {
  loginUsingRecovery = !loginUsingRecovery;
  var codeInput = document.getElementById('totpLoginCode');
  if (codeInput) {
    codeInput.value = '';
    codeInput.name = loginUsingRecovery ? 'recoveryCode' : 'code';
    codeInput.placeholder = loginUsingRecovery ? 'Recovery code' : '6-digit authenticator code';
    codeInput.maxLength = loginUsingRecovery ? 32 : 16;
    codeInput.focus();
  }
  recoveryToggle.textContent = loginUsingRecovery ? 'Use an authenticator code' : 'Use a recovery code';
});
