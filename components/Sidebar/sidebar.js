/*---LEFT BAR ACCORDION----*/
$.ajaxPrefilter(function (options, originalOptions, jqXHR) {
  var method = (options.type || options.method || "GET").toUpperCase();
  if (!/^(GET|HEAD|OPTIONS|TRACE)$/.test(method)) {
    var tokenElement = document.querySelector('meta[name="csrf-token"]');
    if (tokenElement && tokenElement.content) {
      jqXHR.setRequestHeader("X-CSRF-Token", tokenElement.content);
    }
  }
});

$(function () {
  $("#nav-accordion").dcAccordion({
    eventType: "click",
    autoClose: true,
    saveState: true,
    disableLink: true,
    speed: "slow",
    showCount: false,
    autoExpand: true,
    //        cookie: 'dcjq-accordion-1',
    classExpand: "dcjq-current-parent",
  });
});

var Script = (function () {
  var $sidebar = $("#sidebar");
  var $backdrop = $("#mobile-sidebar-backdrop");
  var $toggle = $(".sidebar-toggle-box");
  var lastFocusedElement = null;

  function isMobileView() {
    return $(window).width() <= 768;
  }

  function updateMobileSidebarState(isOpen) {
    if (!isMobileView()) {
      $sidebar.removeClass("in");
      $backdrop.removeClass("is-visible");
      $sidebar.attr("aria-hidden", "false");
      $toggle.attr("aria-expanded", "true");
      return;
    }

    $sidebar.toggleClass("in", isOpen);
    $backdrop.toggleClass("is-visible", isOpen);
    $sidebar.attr("aria-hidden", String(!isOpen));
    $toggle.attr("aria-expanded", String(isOpen));

    if (isOpen) {
      lastFocusedElement = document.activeElement;
      var focusable = $sidebar
        .find("a, button, [tabindex]:not([tabindex='-1'])")
        .filter(function () {
          return !$(this).is(":hidden");
        });
      if (focusable.length) {
        focusable.first().focus();
      }
    } else if (
      lastFocusedElement &&
      typeof lastFocusedElement.focus === "function"
    ) {
      lastFocusedElement.focus();
    }
  }

  function closeMobileSidebar() {
    updateMobileSidebarState(false);
  }

  function openMobileSidebar() {
    updateMobileSidebarState(true);
  }

  //    sidebar dropdown menu auto scrolling

  jQuery("#sidebar .sub-menu > a").click(function () {
    var o = $(this).offset();
    diff = 250 - o.top;
    if (diff > 0) $("#sidebar").scrollTo("-=" + Math.abs(diff), 500);
    else $("#sidebar").scrollTo("+=" + Math.abs(diff), 500);
  });

  //    sidebar toggle

  function syncSidebarState() {
    var isMobile = $(window).width() <= 768;
    var isCollapsed = $("#container").hasClass("sidebar-close");

    $("#sidebar > ul").show();
    $("#sidebar").css("margin-left", "0");
    $("#sidebar").css("width", isCollapsed ? "72px" : "230px");
    $("#main-content").css(
      "margin-left",
      isCollapsed ? "72px" : isMobile ? "230px" : "230px",
    );
    $("#sidebar .sidebar-menu li a .nav-text").css({
      display: isCollapsed ? "none" : "inline-block",
      visibility: isCollapsed ? "hidden" : "visible",
      opacity: isCollapsed ? 0 : 1,
      width: isCollapsed ? "0" : "auto",
      overflow: "hidden",
      transition: "all 0.2s ease",
    });

    $("#sidebar .sidebar-brand-text, #sidebar .sidebar-section-label").toggle(
      !isCollapsed,
    );
    $(".sidebar-toggle-box").attr("aria-expanded", String(!isCollapsed));
  }

  $(function () {
    function responsiveView() {
      var isMobile = $(window).width() <= 768;
      $("#container")
        .toggleClass("sidebar-close", isMobile)
        .toggleClass("sidebar-closed", false);
      if (!isMobile) {
        $sidebar.removeClass("in");
        $backdrop.removeClass("is-visible");
        $sidebar.attr("aria-hidden", "false");
        $toggle.attr("aria-expanded", "true");
      }
      syncSidebarState();
    }
    responsiveView();
    $(window).on("load", responsiveView);
    $(window).on("resize", responsiveView);
  });

  $toggle.on("click", function () {
    if (isMobileView()) {
      var isOpen = $sidebar.hasClass("in");
      if (isOpen) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
      return;
    }

    var isCollapsed = $("#container").hasClass("sidebar-close");
    $("#container")
      .toggleClass("sidebar-close", !isCollapsed)
      .removeClass("sidebar-closed");
    syncSidebarState();
  });

  $backdrop.on("click", closeMobileSidebar);

  $(document).on("keydown", function (event) {
    if (!isMobileView() || !$sidebar.hasClass("in")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileSidebar();
      return;
    }

    if (event.key !== "Tab") return;

    var focusable = $sidebar
      .find(
        "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
      )
      .filter(function () {
        return !$(this).is(":hidden");
      });

    if (!focusable.length) {
      event.preventDefault();
      $toggle.focus();
      return;
    }

    var first = focusable.first()[0];
    var last = focusable.last()[0];
    var active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // custom scrollbar
  $("#sidebar").niceScroll({
    styler: "fb",
    cursorcolor: "#4ECDC4",
    cursorwidth: "3",
    cursorborderradius: "10px",
    background: "#404040",
    spacebarenabled: false,
    cursorborder: "",
  });

  $("html").niceScroll({
    styler: "fb",
    cursorcolor: "#4ECDC4",
    cursorwidth: "6",
    cursorborderradius: "10px",
    background: "#404040",
    spacebarenabled: false,
    cursorborder: "",
    zindex: "1000",
  });

  // widget tools

  jQuery(".panel .tools .fa-chevron-down").click(function () {
    var el = jQuery(this).parents(".panel").children(".panel-body");
    if (jQuery(this).hasClass("fa-chevron-down")) {
      jQuery(this).removeClass("fa-chevron-down").addClass("fa-chevron-up");
      el.slideUp(200);
    } else {
      jQuery(this).removeClass("fa-chevron-up").addClass("fa-chevron-down");
      el.slideDown(200);
    }
  });

  jQuery(".panel .tools .fa-times").click(function () {
    jQuery(this).parents(".panel").parent().remove();
  });

  //    tool tips

  $(".tooltips").tooltip();

  //    popovers

  $(".popovers").popover();

  // custom bar chart

  if ($(".custom-bar-chart")) {
    $(".bar").each(function () {
      var i = $(this).find(".value").html();
      $(this).find(".value").html("");
      $(this).find(".value").animate(
        {
          height: i,
        },
        2000,
      );
    });
  }
})();
