$(document).ready(function () {
  function animateCounter($el, target, duration) {
    duration = duration || 1200;
    var start = 0;
    var startTime = null;
    var easeOut = function (t) {
      return 1 - Math.pow(1 - t, 3);
    };

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var current = Math.round(easeOut(progress) * target);
      $el.text(current);
      if (progress < 1) requestAnimationFrame(step);
      else $el.text(target);
    }
    requestAnimationFrame(step);
  }

  /* Run once dashboard is visible */
  function runCounters() {
    $(".pp1").each(function () {
      var $el = $(this);
      var raw = $el.text().trim();
      var target = parseInt(raw, 10);
      if (!isNaN(target) && target > 0) {
        $el.attr("data-target", target);
        animateCounter($el, target);
      }
    });
  }

  /* Trigger on first Dashboard tab show */
  var countersRan = false;
  $('[data-toggle="tab"]').on("shown.bs.tab", function (e) {
    if ($(e.target).attr("href") === "#dboard" && !countersRan) {
      countersRan = true;
      runCounters();
    }
  });
  /* Also run immediately if dashboard is already active */
  if ($("#dboard").hasClass("active")) {
    setTimeout(runCounters, 300);
    countersRan = true;
  }
});

