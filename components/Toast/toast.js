/**
 * GBR Mobile Storage Application
 * Toast utilities and backward-compatible alert handling.
 */

/* ============================================================
   TASK 2: TOAST NOTIFICATION SYSTEM
   Replaces all alert() with beautiful slide-in toasts
   ============================================================ */
window.GBR = window.GBR || {};

GBR.toast = (function () {
  var _container = null;

  function _getContainer() {
    if (!_container) {
      _container = document.getElementById("toast-container");
      if (!_container) {
        _container = document.createElement("div");
        _container.id = "toast-container";
        document.body.appendChild(_container);
      }
    }
    return _container;
  }

  function show(message, type, duration) {
    type = type || "info"; // 'success' | 'error' | 'warning' | 'info'
    duration = duration || 3500;

    var icons = {
      success: "fa-check-circle",
      error: "fa-times-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle",
    };
    var container = _getContainer();

    var toast = document.createElement("div");
    toast.className = "gbr-toast gbr-toast--" + type;
    toast.innerHTML =
      '<i class="fa ' +
      icons[type] +
      ' toast-icon"></i>' +
      '<span class="toast-msg"></span>' +
      '<button type="button" class="toast-close" aria-label="Dismiss notification">&times;</button>';
    toast.querySelector(".toast-msg").textContent = String(message);

    container.appendChild(toast);

    // Animate in
    setTimeout(function () {
      toast.classList.add("gbr-toast--visible");
    }, 10);

    // Auto remove
    setTimeout(function () {
      toast.classList.remove("gbr-toast--visible");
      setTimeout(function () {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 400);
    }, duration);

    return toast;
  }

  document.addEventListener("click", function (event) {
    var closeButton = event.target.closest && event.target.closest(".toast-close");
    if (!closeButton) return;
    var toast = closeButton.closest(".gbr-toast");
    if (toast) toast.remove();
  });

  return {
    show: show,
    success: function (m) {
      show(m, "success");
    },
    error: function (m) {
      show(m, "error", 5000);
    },
    warning: function (m) {
      show(m, "warning", 4500);
    },
    info: function (m) {
      show(m, "info");
    },
  };
})();

/* Override native alert for backward compatibility */
window._nativeAlert = window.alert;
window.alert = function (msg) {
  if (typeof GBR !== "undefined" && GBR.toast) {
    var type = /error|fail|wrong|invalid|not allow/i.test(msg)
      ? "error"
      : /success|register|welcome|changed|returned/i.test(msg)
        ? "success"
        : /warn|check|smart/i.test(msg)
          ? "warning"
          : "info";
    GBR.toast.show(msg, type);
  } else {
    window._nativeAlert(msg);
  }
};


   $(document).ready(function () {
  var databaseError = document.body.getAttribute("data-db-error");
  if (databaseError && window.GBR && GBR.toast) GBR.toast.error(databaseError);
});
