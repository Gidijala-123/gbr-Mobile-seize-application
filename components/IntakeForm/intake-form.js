$(document).ready(function () {
  /* Dashboard entry form */
  var $form = $('form[action="/hh"]');

  function setFieldState($input, isValid, msg) {
    var $wrap = $input.closest(".field-icon-wrap");
    var $target = $wrap.length ? $wrap : $input; // place hint after wrapper, not inside it
    // Remove any existing hints after the target
    $target.siblings(".field-hint").remove();
    $input
      .toggleClass("field-valid", isValid)
      .toggleClass("field-invalid", !isValid);
    if (!isValid && msg) {
      $target.after(
        '<span class="field-hint field-hint--error"><i class="fa fa-exclamation-circle"></i> ' +
          msg +
          "</span>",
      );
    } else if (isValid) {
      $target.after(
        '<span class="field-hint field-hint--ok"><i class="fa fa-check-circle"></i></span>',
      );
    }
  }

  function validatePhone(val) {
    return /^\d{10}$/.test(val.trim());
  }
  function validateIMEI(val) {
    return /^\d{15}$/.test(val.trim());
  }
  function validateYear(val) {
    return (
      /^[1-6]$/.test(val.trim()) ||
      /^[1-6]st|nd|rd|th$/i.test(val.trim()) ||
      val.trim().length > 0
    );
  }

  /* Live validation per field */
  $form.on("input change", "input, select, textarea", function () {
    var $el = $(this);
    var val = $el.val().trim();
    var name = $el.attr("name");
    var required = $el.attr("required") !== undefined;

    if (required && val === "") {
      setFieldState($el, false, "This field is required");
      return;
    }
    if (name === "spno" || name === "ppno" || name === "epno") {
      if (val && !validatePhone(val)) {
        setFieldState($el, false, "Enter a valid 10-digit number");
        return;
      }
    }
    if (name === "imei") {
      if (val && !validateIMEI(val)) {
        setFieldState($el, false, "IMEI must be exactly 15 digits");
        return;
      }
    }
    if (val !== "") setFieldState($el, true, "");
  });

  /* Block invalid submit */
  $form.on("submit", function (e) {
    var allValid = true;
    $(this)
      .find("[required]")
      .each(function () {
        if ($(this).val().trim() === "") {
          setFieldState($(this), false, "Required");
          allValid = false;
        }
      });
    if (!allValid) {
      e.preventDefault();
      GBR.toast.error("Please fill in all required fields before submitting.");
      /* Scroll to first invalid field */
      var $first = $(this).find(".field-invalid").first();
      if ($first.length)
        $("html, body").animate({ scrollTop: $first.offset().top - 120 }, 400);
    }
  });
});

/* ============================================================
   FORM ICON INJECTION
     Wraps dashboard form inputs with icon containers
   ============================================================ */
$(document).ready(function () {
  /* Map field id → Font Awesome icon class */
  var FIELD_ICONS = {
    dat2: "fa-calendar",
    tim2: "fa-clock-o",
    snm2: "fa-user",
    pnm2: "fa-users",
    enm2: "fa-id-badge",
    clg2: "fa-university",
    brc2: "fa-code-fork",
    yr2: "fa-graduation-cap",
    sec2: "fa-th-large",
    spn2: "fa-phone",
    ppn2: "fa-phone-square",
    epn2: "fa-mobile",
    rno2: "fa-id-card",
    gid2: "fa-barcode",
    eid2: "fa-tag",
    mdl2: "fa-mobile",
    mcl2: "fa-paint-brush",
    ime2: "fa-hashtag",
    rsn2: "fa-comment",
  };

  function wrapWithIcon($input, iconClass) {
    if ($input.closest(".field-icon-wrap").length) return;
    $input.wrap('<div class="field-icon-wrap"></div>');
    $input.before('<i class="fa ' + iconClass + ' field-icon"></i>');
  }

  /* Wrap dashboard form inputs. */
  Object.keys(FIELD_ICONS).forEach(function (id) {
    var $el = $("#" + id);
    if ($el.length && $el.is("input, select")) {
      wrapWithIcon($el, FIELD_ICONS[id]);
    }
  });
});

