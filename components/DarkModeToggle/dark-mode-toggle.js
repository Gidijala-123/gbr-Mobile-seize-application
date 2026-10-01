(function () {
  var DARK_KEY = "gbr_dark_mode";

  function applyDark(on) {
    if (on) {
      document.body.classList.add("dark-mode");
      $("#darkModeToggle").html('<i class="fa fa-sun-o"></i>');
      $("#darkModeToggle").attr("title", "Switch to light mode");
    } else {
      document.body.classList.remove("dark-mode");
      $("#darkModeToggle").html('<i class="fa fa-moon-o"></i>');
      $("#darkModeToggle").attr("title", "Switch to dark mode");
    }
    localStorage.setItem(DARK_KEY, on ? "1" : "0");
  }

  /* Load persisted preference */
  $(document).ready(function () {
    var saved = localStorage.getItem(DARK_KEY);
    if (saved === "1") applyDark(true);

    $("#darkModeToggle").on("click", function () {
      var isDark = document.body.classList.contains("dark-mode");
      applyDark(!isDark);
      GBR.toast.info(isDark ? "Light mode enabled" : "Dark mode enabled");
    });
  });
})();

