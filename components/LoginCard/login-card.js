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
  $(this).toggleClass('fa-eye fa-eye-slash');
  var inp = $($(this).attr('toggle'));
  inp.attr('type', inp.attr('type') === 'password' ? 'text' : 'password');
});

// ── Password match indicator ──────────────────────────────────────
function updatePasswordMessage() {
  var msg = document.getElementById('message');
  if (!msg) return;
  var p1 = document.getElementById('password1');
  var p2 = document.getElementById('password2');
  var v1 = p1 ? p1.value : '', v2 = p2 ? p2.value : '';
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

var app = angular.module('loginapp', []);

app.controller('signupController', function ($scope, $http) {
  $scope.signup = function (reg) {
    if (!reg || !reg.email || !reg.pwd || reg.pwd !== reg.pwd2) {
      alert('Please enter a valid email and matching passwords.');
      return;
    }
    if (reg.pwd.length < 10 || reg.pwd.length > 128 || !/[a-z]/.test(reg.pwd) || !/[A-Z]/.test(reg.pwd) || !/\d/.test(reg.pwd) || !/[^A-Za-z0-9]/.test(reg.pwd)) {
      alert('Password must contain an uppercase letter, a lowercase letter, a number, and a symbol.');
      return;
    }
    $http({ method: 'POST', url: '/postsignup', data: { email: reg.email, pwd: reg.pwd }
    }).then(function () {
      $scope.reg = {};
      alert("Registered successfully! \uD83E\uDD97");
    }, function (res) { alert(res.data || 'Unable to create your account.'); });
  };
});

app.controller('loginController', function ($scope, $http, $window) {
  $scope.loginLoading = false;
  $scope.loginStatus = '';
  $scope.loginMsg = '';
  $scope.loginStep = 'password';
  $scope.loginUsingRecovery = false;

  function finishSignIn() {
    $scope.loginLoading = false;
    $scope.loginStatus = 'success';
    setTimeout(function () { $window.location.href = '/home'; }, 700);
  }

  $scope.verifyTotp = function () {
    if ($scope.loginLoading || !$scope.loginCode) return;
    $scope.loginLoading = true;
    $scope.loginStatus = 'loading';
    $scope.loginMsg = '';
    var payload = $scope.loginUsingRecovery
      ? { recoveryCode: $scope.loginCode }
      : { code: $scope.loginCode };

    $http.post('/postlogin/totp', payload, { timeout: 60000 }).then(function () {
      finishSignIn();
    }, function (res) {
      $scope.loginLoading = false;
      $scope.loginStatus = 'error';
      $scope.loginMsg = res.data || 'Invalid verification code. Please try again.';
    });
  };

  $scope.login = function (log) {
    if ($scope.loginLoading || $scope.loginStatus === 'success') return;
    if ($scope.loginStep === 'totp') {
      $scope.verifyTotp();
      return;
    }

    if (!log || !log.email || !log.pwd) {
      $scope.loginStatus = 'error';
      $scope.loginMsg = 'Please enter your email and password.';
      return;
    }

    $scope.loginLoading = true;
    $scope.loginStatus = 'loading';
    $scope.loginMsg = '';

    var wakeTimer = setTimeout(function () {
      $scope.$apply(function () { $scope.loginMsg = 'Waking up server\u2026'; });
    }, 4000);

    var longTimer = setTimeout(function () {
      $scope.$apply(function () { $scope.loginMsg = 'Almost there\u2026'; });
    }, 12000);

    $http({
      method: 'POST',
      url: '/postlogin',
      data: { uname: log.uname, email: log.email, pwd: log.pwd },
      timeout: 60000
    }).then(function (response) {
      clearTimeout(wakeTimer);
      clearTimeout(longTimer);
      if (response.status === 202 && response.data.requiresTotp) {
        if (response.data.csrfToken) {
          var tokenMeta = document.querySelector('meta[name="csrf-token"]');
          if (tokenMeta) tokenMeta.content = response.data.csrfToken;
        }
        $scope.loginStep = 'totp';
        $scope.loginCode = '';
        $scope.loginLoading = false;
        $scope.loginStatus = '';
        $scope.loginMsg = 'Enter the code from your authenticator app.';
        return;
      }
      finishSignIn();
    }, function (res) {
      clearTimeout(wakeTimer);
      clearTimeout(longTimer);
      $scope.loginLoading = false;
      $scope.loginStatus = 'error';
      $scope.loginMsg = res.data || 'Invalid credentials. Please try again.';
      if ($scope.log) $scope.log.pwd = '';
    });
  };
});
