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

  $(function () {
    function responsiveView() {
      var isMobile = $(window).width() <= 768;
      // On mobile: start collapsed (icons only), on desktop: start expanded
      $("#container").toggleClass("sidebar-close", isMobile).toggleClass("sidebar-closed", false);
      $("#sidebar > ul").show();
      $("#sidebar").css("margin-left", "0");
      $("#main-content").css("margin-left", isMobile ? "58px" : "210px");
      $(".sidebar-toggle-box").attr("aria-expanded", String(!isMobile));
    }
    responsiveView();
    $(window).on("load", responsiveView);
    $(window).on("resize", responsiveView);
  });

  $(".sidebar-toggle-box").on("click", function () {
    var isCollapsed = $("#container").hasClass("sidebar-close");
    var isMobile = $(window).width() <= 768;
    
    // Toggle the collapsed state - when isCollapsed is true, we want to expand (remove sidebar-close)
    // When isCollapsed is false, we want to collapse (add sidebar-close)
    $("#container").toggleClass("sidebar-close", !isCollapsed).removeClass("sidebar-closed");
    
    // Always show the sidebar ul (we want icons visible in collapsed state)
    $("#sidebar > ul").show();
    $("#sidebar").css("margin-left", "0");
    
    // Adjust main content margin based on new state
    if (!isCollapsed) {
      // We're collapsing it now - show only icons (58px width)
      $("#main-content").css("margin-left", "58px");
    } else {
      // We're expanding it now - show full sidebar
      $("#main-content").css("margin-left", isMobile ? "58px" : "210px");
    }
    
    $(this).attr("aria-expanded", String(isCollapsed));
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
