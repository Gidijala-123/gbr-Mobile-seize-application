/*---LEFT BAR ACCORDION----*/
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
    $("#main-content").css("margin-left", isCollapsed ? "72px" : (isMobile ? "230px" : "230px"));
    $("#sidebar .sidebar-menu li a .nav-text").css({
      display: isCollapsed ? "none" : "inline-block",
      visibility: isCollapsed ? "hidden" : "visible",
      opacity: isCollapsed ? 0 : 1,
      width: isCollapsed ? "0" : "auto",
      overflow: "hidden",
      transition: "all 0.2s ease"
    });

    $("#sidebar .sidebar-brand-text, #sidebar .sidebar-section-label").toggle(!isCollapsed);
    $(".sidebar-toggle-box").attr("aria-expanded", String(!isCollapsed));
  }

  $(function () {
    function responsiveView() {
      var isMobile = $(window).width() <= 768;
      $("#container").toggleClass("sidebar-close", isMobile).toggleClass("sidebar-closed", false);
      syncSidebarState();
    }
    responsiveView();
    $(window).on("load", responsiveView);
    $(window).on("resize", responsiveView);
  });

  $(".sidebar-toggle-box").on("click", function () {
    var isCollapsed = $("#container").hasClass("sidebar-close");
    $("#container").toggleClass("sidebar-close", !isCollapsed).removeClass("sidebar-closed");
    syncSidebarState();
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
