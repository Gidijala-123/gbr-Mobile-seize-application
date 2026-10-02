(function () {
  var DARK_KEY = "gbr_dark_mode";
  var body = document.body;
  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var lightThemeMeta = document.getElementById("theme-color-light");
  var darkThemeMeta = document.getElementById("theme-color-dark");

  function applyThemeColor(on) {
    if (lightThemeMeta) lightThemeMeta.media = on ? "not all" : "all";
    if (darkThemeMeta) darkThemeMeta.media = on ? "all" : "not all";
  }

  function applyDark(on) {
    if (!body) return;
    if (on) {
      body.classList.add("dark-mode");
      $("#darkModeToggle").html('<i class="fa fa-sun-o"></i>');
      $("#darkModeToggle").attr("title", "Switch to light mode");
    } else {
      body.classList.remove("dark-mode");
      $("#darkModeToggle").html('<i class="fa fa-moon-o"></i>');
      $("#darkModeToggle").attr("title", "Switch to dark mode");
    }
    applyThemeColor(on);
    localStorage.setItem(DARK_KEY, on ? "1" : "0");
  }

  function persistPreference(isDark) {
    if (!body || !document.body.getAttribute("data-user-authenticated")) return;
    var headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (tokenMeta && tokenMeta.content) {
      headers["X-CSRF-Token"] = tokenMeta.content;
    }

    fetch("/user/preferences", {
      method: "POST",
      credentials: "same-origin",
      headers: headers,
      body: JSON.stringify({ darkMode: isDark }),
    }).catch(function () {
      return;
    });
  }

  /* Load persisted preference */
  $(document).ready(function () {
    var saved = localStorage.getItem(DARK_KEY);
    applyDark(saved === null ? body.classList.contains("dark-mode") : saved === "1");

    $("#darkModeToggle").on("click", function () {
      var isDark = body.classList.contains("dark-mode");
      var nextDark = !isDark;
      applyDark(nextDark);
      persistPreference(nextDark);
      if (window.GBR && GBR.toast) {
        GBR.toast.info(nextDark ? "Dark mode enabled" : "Light mode enabled");
      }
    });
  });
})();

