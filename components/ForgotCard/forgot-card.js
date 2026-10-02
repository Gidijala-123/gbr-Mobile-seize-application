var requestForm = document.getElementById('reset-request-form');
  var verifyForm = document.getElementById('reset-verify-form');
  var resetEmail = '';

  if (requestForm) requestForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!requestForm.reportValidity()) return;
    var email = document.getElementById('forgot-email');
    try {
      await window.authRequest('/postforgot', { email: email.value });
      resetEmail = email.value;
      document.getElementById('reset-email').value = resetEmail;
      requestForm.hidden = true;
      verifyForm.hidden = false;
      document.getElementById('reset-otp').focus();
    } catch (error) {
      alert(error.message || 'Unable to send the reset email.');
    }
  });

  if (verifyForm) verifyForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!verifyForm.reportValidity()) return;
    var otp = document.getElementById('reset-otp').value.trim();
    var password = document.getElementById('reset-password').value;
    var confirmation = document.getElementById('reset-confirm-password').value;
    if (!/^\d{6}$/.test(otp)) {
      alert('Enter the 6-digit reset code.');
      return;
    }
    if (password.length < 10 || password.length > 128) {
      alert('Your password must be between 10 and 128 characters.');
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      alert('Password must contain an uppercase letter, a lowercase letter, a number, and a symbol.');
      return;
    }
    if (password !== confirmation) {
      alert('The passwords do not match.');
      return;
    }
    try {
      await window.authRequest('/postreset', { email: resetEmail, otp: otp, pwd: password });
      alert('Your password has been reset. Please sign in.');
      window.location.href = '/';
    } catch (error) {
      alert(error.message || 'Unable to reset your password.');
    }
  });

  var resendButton = document.getElementById('resend-reset-otp');
  if (resendButton) resendButton.addEventListener('click', async function () {
    try {
      await window.authRequest('/postforgot', { email: resetEmail });
      alert('If an account exists, a new reset code has been sent.');
      document.getElementById('reset-otp').value = '';
    } catch (error) {
      alert(error.message || 'Unable to send the reset email.');
    }
  });

  var anotherEmailButton = document.getElementById('use-another-email');
  if (anotherEmailButton) anotherEmailButton.addEventListener('click', function () {
    verifyForm.reset();
    verifyForm.hidden = true;
    requestForm.hidden = false;
    resetEmail = '';
    document.getElementById('forgot-email').value = '';
    document.getElementById('forgot-email').focus();
  });
