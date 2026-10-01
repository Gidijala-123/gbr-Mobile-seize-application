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

window.onload = date_time("date_time");
function date_time(id) {
  date = new Date();
  ampm = date.ampm;
  year = date.getFullYear();
  month = date.getMonth();
  months = new Array(
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "Jully",
    "August",
    "September",
    "October",
    "November",
    "December",
  );
  d = date.getDate();
  day = date.getDay();
  days = new Array(
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  );
  h = date.getHours();
  if (h < 10) {
    h = "0" + h;
  }
  m = date.getMinutes();
  if (m < 10) {
    m = "0" + m;
  }
  s = date.getSeconds();
  if (s < 10) {
    s = "0" + s;
  }
  ampm = date.getHours() >= 12 ? "pm" : "am";
  result =
    "" +
    days[day] +
    " " +
    months[month] +
    " " +
    d +
    " " +
    year +
    "<br>" +
    "Time : " +
    h +
    ":" +
    m +
    ":" +
    s +
    "" +
    ampm;
  document.getElementById(id).innerHTML = result;
  setTimeout('date_time("' + id + '");', "1000");
  return true;
}

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
