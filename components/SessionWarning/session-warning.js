(function () {
  var warning = document.getElementById("session-warning");
  if (!warning) return;

  var countdown = document.getElementById("session-countdown");
  var extendButton = document.getElementById("session-extend");
  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var warningThresholdMs = 5 * 60 * 1000;
  var expiresAt = Number(
    document.body.getAttribute("data-session-expires-at") ||
      Date.now() + (Number(document.body.getAttribute("data-session-ttl-ms")) || 8 * 60 * 60 * 1000),
  );

  function formatRemaining(ms) {
    var totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function setWarningVisible(isVisible) {
    if (!warning) return;
    warning.hidden = !isVisible;
    warning.setAttribute("aria-hidden", String(!isVisible));
  }

  function updateWarning() {
    var remainingMs = Math.max(0, expiresAt - Date.now());
    if (countdown) {
      countdown.textContent = formatRemaining(remainingMs);
    }
    if (remainingMs <= warningThresholdMs) {
      setWarningVisible(true);
    } else {
      setWarningVisible(false);
    }
    if (remainingMs <= 0) {
      window.location.href = "/logout";
    }
  }

  function extendSession() {
    var headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (tokenMeta && tokenMeta.content) {
      headers["X-CSRF-Token"] = tokenMeta.content;
    }

    fetch("/session/extend", {
      method: "POST",
      credentials: "same-origin",
      headers: headers,
      body: JSON.stringify({}),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Unable to extend the current session.");
        }
        return response.json();
      })
      .then(function (payload) {
        if (payload && payload.ok && payload.expiresAt) {
          expiresAt = Number(payload.expiresAt);
          setWarningVisible(false);
          updateWarning();
        }
      })
      .catch(function () {
        if (countdown) {
          countdown.textContent = "00:00";
        }
      });
  }

  if (extendButton) {
    extendButton.addEventListener("click", extendSession);
  }

  updateWarning();
  window.setInterval(updateWarning, 1000);
})();
