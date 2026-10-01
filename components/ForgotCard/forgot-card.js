var app = angular.module('forgotapp', []);
app.controller('forgotController', function($scope, $http) {
  $scope.step = 'request';
  $scope.a = {};
  $scope.reset = {};

  function errorMessage(response, fallback) {
    return response.data && response.data.error ? response.data.error : (response.data || fallback);
  }

  $scope.forgot = function(a) {
    if (!a || !a.email) {
      alert('Enter your registered email address.');
      return;
    }
    $http({
      method: 'POST',
      url: '/postforgot',
      data: { email: a.email }
    }).then(function success(response) {
      $scope.resetEmail = a.email;
      $scope.step = 'verify';
    }, function error(response) {
      alert(errorMessage(response, 'Unable to send the reset email.'));
    });
  };

  $scope.completeReset = function() {
    if (!/^\d{6}$/.test($scope.reset.otp || '')) {
      alert('Enter the 6-digit reset code.');
      return;
    }
    if (!$scope.reset.password || $scope.reset.password.length < 10 || $scope.reset.password.length > 128) {
      alert('Your password must be between 10 and 128 characters.');
      return;
    }
    if (!/[a-z]/.test($scope.reset.password) || !/[A-Z]/.test($scope.reset.password) || !/\d/.test($scope.reset.password) || !/[^A-Za-z0-9]/.test($scope.reset.password)) {
      alert('Password must contain an uppercase letter, a lowercase letter, a number, and a symbol.');
      return;
    }
    if ($scope.reset.password !== $scope.reset.confirmPassword) {
      alert('The passwords do not match.');
      return;
    }

    $http.post('/postreset', {
      email: $scope.resetEmail,
      otp: $scope.reset.otp,
      pwd: $scope.reset.password
    }).then(function success() {
      alert('Your password has been reset. Please sign in.');
      window.location.href = '/';
    }, function error(response) {
      alert(errorMessage(response, 'Unable to reset your password.'));
    });
  };

  $scope.resendOtp = function() {
    $http.post('/postforgot', { email: $scope.resetEmail }).then(function success() {
      alert('If an account exists, a new reset code has been sent.');
      $scope.reset.otp = '';
    }, function error(response) {
      alert(errorMessage(response, 'Unable to send the reset email.'));
    });
  };

  $scope.useAnotherEmail = function() {
    $scope.step = 'request';
    $scope.reset = {};
    $scope.a.email = '';
  };
});

window.onload = function() {
  document.addEventListener("contextmenu", function(e) {
    e.preventDefault();
  }, false);
  document.addEventListener("keydown", function(e) {
    // "J" key
    if (e.ctrlKey && e.shiftKey && e.keyCode == 74) {
      alert('not allowed');
      disabledEvent(e);
    }
    // "F12" key
    if (e.keyCode == 123) {
      alert('Too smart!\nBut you are not allowed for this action');
      disabledEvent(e);
    }
  }, false);
  function disabledEvent(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    } else if (window.event) {
      window.event.cancelBubble = true;
    }
    e.preventDefault();
    return false;
  }
};

document.onkeydown = function(e) {
  if (e.ctrlKey && (e.keyCode === 67 || e.keyCode === 86 || e.keyCode === 73 || e.keyCode === 85 || e.keyCode === 117)) {
    alert('Too smart!\nBut you are not allowed for this action');
    return false;
  } else {
    return true;
  }
};
