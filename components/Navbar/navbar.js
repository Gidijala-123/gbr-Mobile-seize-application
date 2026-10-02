$(document).ready(function () {
  $(document).on("keydown", function (e) {
    /* Don't fire when typing in an input */
    if ($(e.target).is("input, textarea, select")) return;

    /* Ctrl+N — New entry (go to Dashboard tab) */
    if (e.ctrlKey && e.key === "n") {
      e.preventDefault();
      $('[data-toggle="tab"][href="#dboard"]').tab("show");
      GBR.toast.info("Keyboard shortcut: New Entry form opened (Ctrl+N)");
    }

    /* Ctrl+F — Focus smart search */
    if (e.ctrlKey && e.key === "f") {
      e.preventDefault();
      $('[data-toggle="tab"][href="#search-edit"]').tab("show");
      setTimeout(function () {
        $("#smartSearch").focus();
      }, 350);
      GBR.toast.info("Keyboard shortcut: Search focused (Ctrl+F)");
    }

    /* Ctrl+L — Total list */
    if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      $('[data-toggle="tab"][href="#totallist"]').tab("show");
    }

    /* Ctrl+D — Toggle dark mode */
    if (e.ctrlKey && e.key === "d") {
      e.preventDefault();
      $("#darkModeToggle").click();
    }
  });

  /* Show keyboard shortcut hint on first visit */
  if (!localStorage.getItem("gbr_shortcuts_shown")) {
    setTimeout(function () {
      GBR.toast.info(
        "💡 Shortcuts: Ctrl+N new entry · Ctrl+F search · Ctrl+D dark mode · Esc close",
      );
      localStorage.setItem("gbr_shortcuts_shown", "1");
    }, 2000);
  }
});

document.addEventListener("DOMContentLoaded", function () {
  var liveClock = document.getElementById("live-clock");
  var liveDate = document.getElementById("live-date");
  if (!liveClock || !liveDate) return;

  function updateLiveClock() {
    var now = new Date();
    var time = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":");

    liveClock.textContent = time;
    liveClock.setAttribute("datetime", now.toISOString());
    liveDate.textContent = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(now);
  }

  updateLiveClock();
  window.setInterval(updateLiveClock, 1000);
});

window.addEventListener("load", function () {
  document.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();
    },
    false,
  );
  document.addEventListener(
    "keydown",
    function (e) {
      // "J" key
      if (e.ctrlKey && e.shiftKey && e.keyCode == 74) {
        alert("not allowed");
        disabledEvent(e);
      }
      // "F12" key
      if (event.keyCode == 123) {
        alert("Too smart!\nBut you are not allowed for this action");
        disabledEvent(e);
      }
    },
    false,
  );
  function disabledEvent(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    } else if (window.event) {
      window.event.cancelBubble = true;
    }
    e.preventDefault();
    return false;
  }
});

document.onkeydown = function (e) {
  if (
    e.ctrlKey &&
    (e.keyCode === 67 ||
      e.keyCode === 86 ||
      e.keyCode === 73 ||
      e.keyCode === 85 ||
      e.keyCode === 117)
  ) {
    alert("Too smart!\nBut you are not allowed for this action");
    return false;
  } else {
    return true;
  }
};
