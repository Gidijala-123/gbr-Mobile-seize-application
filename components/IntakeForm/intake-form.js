$(document).ready(function () {
  var $wizard = $('#intake-wizard');
  if ($wizard.length) {
    var $panels = $wizard.find('.intake-step-panel');
    var $steps = $('#intake-step-indicator').find('.intake-step');
    var currentStep = 0;

    function showStep(index) {
      currentStep = Math.min(Math.max(index, 0), $panels.length - 1);
      $panels.removeClass('is-active').hide();
      $($panels[currentStep]).show().addClass('is-active');
      $steps.removeClass('is-active is-complete');
      $steps.each(function (stepIndex) {
        if (stepIndex < currentStep) {
          $(this).addClass('is-complete');
        } else if (stepIndex === currentStep) {
          $(this).addClass('is-active');
        }
      });
      $('#intake-prev-step').toggle(currentStep > 0);
      $('#intake-next-step').toggle(currentStep < $panels.length - 1);
      $('#intake-submit-button').toggle(currentStep === $panels.length - 1);
    }

    function validateCurrentStep() {
      var $currentPanel = $($panels[currentStep]);
      var $required = $currentPanel.find('[required]:visible');
      var $firstInvalid = null;
      var valid = true;

      $required.each(function () {
        var $field = $(this);
        if ($field.val() === null || String($field.val()).trim() === '') {
          valid = false;
          if (!$firstInvalid) {
            $firstInvalid = $field;
          }
        }
      });

      if (!valid) {
        GBR.toast.error('Please complete the current step before continuing.');
        if ($firstInvalid && $firstInvalid.length) {
          $firstInvalid.focus();
        }
        return false;
      }

      return true;
    }

    $('#intake-step-indicator').on('click', '.intake-step', function () {
      var targetIndex = Number($(this).data('stepIndex'));
      if (targetIndex > currentStep && !validateCurrentStep()) return;
      showStep(targetIndex);
    });

    $('#intake-next-step').on('click', function () {
      if (!validateCurrentStep()) return;
      showStep(currentStep + 1);
    });

    $('#intake-prev-step').on('click', function () {
      showStep(currentStep - 1);
    });

    showStep(0);
  }

  /* Dashboard entry form */
  var $form = $('form[action="/hh"]');
  var DRAFT_KEY = "gbr_intake_form_recent";
  var RECENT_VALUES_KEY = "gbr_intake_defaults_recent";
  var RECENT_VALUE_FIELDS = ["clg", "brch", "year", "sec", "ename", "eid"];

  function getRecentValues() {
    try {
      var raw = localStorage.getItem(RECENT_VALUES_KEY);
      var values = raw ? JSON.parse(raw) : {};
      return values && typeof values === "object" && !Array.isArray(values) ? values : {};
    } catch (error) {
      return {};
    }
  }

  function getLocalDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function hasUserValue(element) {
    if (
      (element.tagName || "").toUpperCase() === "SELECT" &&
      element.selectedIndex === 0
    ) {
      return false;
    }
    var value = $(element).val();
    return value !== null && String(value).trim() !== "";
  }

  function hasDraftValue(element, recentValues) {
    if (!hasUserValue(element)) return false;
    if (RECENT_VALUE_FIELDS.indexOf(element.name) === -1) return true;
    return String($(element).val()).trim() !== String(recentValues[element.name] || "");
  }

  function saveLocalDraft() {
    if (!window.GBRFieldMasks || !window.GBRFieldMasks.captureIntakeFormState) return;
    var state = window.GBRFieldMasks.captureIntakeFormState($form);
    var recentValues = getRecentValues();
    var hasValues = $form
      .find("input, select, textarea")
      .toArray()
      .some(function (element) { return hasDraftValue(element, recentValues); });
    if (!hasValues) return;

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch (error) {
      // localStorage can be unavailable in private browsing or blocked cookies.
    }
  }

  function saveRecentValues() {
    if (!window.GBRFieldMasks || !window.GBRFieldMasks.captureRecentIntakeValues) return;
    var values = window.GBRFieldMasks.captureRecentIntakeValues($form, RECENT_VALUE_FIELDS);
    if (!Object.keys(values).some(function (name) { return values[name] !== ""; })) return;
    try {
      localStorage.setItem(RECENT_VALUES_KEY, JSON.stringify(values));
    } catch (error) {
      return;
    }
  }

  function restoreRecentValues() {
    if (!window.GBRFieldMasks || !window.GBRFieldMasks.restoreRecentIntakeValues) return;
    window.GBRFieldMasks.restoreRecentIntakeValues($form, getRecentValues());
  }

  function isFormDirty() {
    var recentValues = getRecentValues();
    return $form
      .find("input, select, textarea")
      .toArray()
      .some(function (element) { return hasDraftValue(element, recentValues); });
  }

  function confirmAction(title, message, confirmText) {
    if (typeof window.GBRConfirm !== "function") return Promise.resolve(false);
    return window.GBRConfirm({
      title: title,
      message: message,
      confirmText: confirmText,
      cancelText: "Cancel",
    });
  }

  function restoreRecentDraft() {
    if (!window.GBRFieldMasks || !window.GBRFieldMasks.restoreIntakeFormState) return false;
    var draft = getLocalDraft();
    if (!draft) return false;
    var isEmpty = $form
      .find("input, select, textarea")
      .toArray()
      .every(function (element) { return !hasUserValue(element); });
    if (!isEmpty) return false;
    window.GBRFieldMasks.restoreIntakeFormState($form, draft);
    return true;
  }

  function resetIntakeForm(confirmBeforeClear) {
    if (confirmBeforeClear && isFormDirty()) {
      confirmAction(
        "Reset intake form",
        "Clear the current form? The saved draft remains available with Undo.",
        "Reset form",
      ).then(function (confirmed) {
        if (confirmed) resetIntakeForm(false);
      });
      return false;
    }

    $form[0].reset();
    restoreRecentValues();
    $form.find(".field-hint").remove();
    $form.find("input, select, textarea").removeClass("field-valid field-invalid");
    saveLocalDraft();
    return true;
  }

  $form.on("input change", function (event) {
    saveLocalDraft();
    if (RECENT_VALUE_FIELDS.indexOf(event.target.name) !== -1) saveRecentValues();
  });
  window.setInterval(saveLocalDraft, 10000);

  $(document).on("keydown", function (event) {
    if (event.key !== "Escape") return;
    var active = document.activeElement;
    if (!active || !$form[0].contains(active)) return;
    event.preventDefault();
    resetIntakeForm(true);
  });

  $("#reset-intake-form").on("click", function () {
    resetIntakeForm(true);
  });

  $("#undo-intake-form").on("click", function () {
    var draft = getLocalDraft();
    if (!draft) {
      GBR.toast.info("There is no recent intake draft to restore.");
      return;
    }

    if (window.GBRFieldMasks && window.GBRFieldMasks.restoreIntakeFormState) {
      window.GBRFieldMasks.restoreIntakeFormState($form, draft);
      GBR.toast.success("Your last intake draft has been restored.");
    }
  });

  function discardSavedDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      GBR.toast.error("Draft storage is unavailable in this browser.");
      return;
    }
    $form[0].reset();
    restoreRecentValues();
    $form.find(".field-hint").remove();
    $form.find("input, select, textarea").removeClass("field-valid field-invalid");
    GBR.toast.success("Saved draft discarded.");
  }

  $("#discard-intake-draft").on("click", function () {
    if (!getLocalDraft()) {
      GBR.toast.info("There is no saved draft to discard.");
      return;
    }
    if (!isFormDirty()) {
      discardSavedDraft();
      return;
    }
    confirmAction(
      "Discard saved draft",
      "Permanently discard this saved intake draft? Remembered class and staff values will remain.",
      "Discard draft",
    ).then(function (confirmed) {
      if (confirmed) discardSavedDraft();
    });
  });

  if (!restoreRecentDraft()) restoreRecentValues();

  function refreshDevicePhotoPreview(images) {
    var $preview = $('#device-photo-preview');
    $preview.empty();
    if (!images.length) {
      $preview.append('<span class="device-photo-empty">No photos selected yet.</span>');
      return;
    }

    images.forEach(function (imageSrc) {
      $preview.append(
        '<div class="device-photo-thumb"><img src="' + imageSrc + '" alt="Device photo preview" /></div>'
      );
    });
  }

  function syncDevicePhotoInput() {
    var input = $('#device-photo-input')[0];
    var $hidden = $('#device-photos-input');
    if (!input || !input.files || !input.files.length) {
      $hidden.val('');
      refreshDevicePhotoPreview([]);
      return;
    }

    var files = Array.prototype.slice.call(input.files).slice(0, 3);
    var readers = files.map(function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('Image read failed')); };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers)
      .then(function (images) {
        $hidden.val(JSON.stringify(images));
        refreshDevicePhotoPreview(images);
      })
      .catch(function () {
        $hidden.val('');
        refreshDevicePhotoPreview([]);
        GBR.toast.error('One or more selected images could not be loaded.');
      });
  }

  $('#device-photo-input').on('change', function () {
    syncDevicePhotoInput();
  });

  refreshDevicePhotoPreview([]);

  function applyMasks() {
    var masks = window.GBRFieldMasks || {};
    var phoneFields = ["spno", "ppno", "epno"];
    var imeiField = "imei";
    var rollField = "rno";

    phoneFields.forEach(function (fieldName) {
      var $field = $form.find('[name="' + fieldName + '"]');
      if (!$field.length || !$field[0]) return;
      $field.on("input", function () {
        var value = masks.formatPhoneInput ? masks.formatPhoneInput(this.value) : this.value;
        this.value = value;
      });
    });

    var $imeiField = $form.find('[name="' + imeiField + '"]');
    if ($imeiField.length) {
      $imeiField.on("input", function () {
        var value = masks.formatImeiInput ? masks.formatImeiInput(this.value) : this.value;
        this.value = value;
      });
    }

    var $rollField = $form.find('[name="' + rollField + '"]');
    if ($rollField.length) {
      $rollField.on("input", function () {
        var value = masks.formatRollNoInput ? masks.formatRollNoInput(this.value) : this.value;
        this.value = value;
      });
    }
  }

  function syncReasonSelection() {
    var $preset = $form.find('#reason-preset');
    var $custom = $form.find('#reason-custom');
    var $reason = $form.find('#rsn2');
    var selectedPreset = $preset.val() || "";
    var customText = ($custom.val() || "").trim();

    if (!selectedPreset) {
      $custom.closest('.reason-custom-wrap').hide();
      return;
    }

    if (selectedPreset === "Other (specify)") {
      $custom.closest('.reason-custom-wrap').show();
      if (customText) {
        $reason.val(customText);
      }
      return;
    }

    $custom.closest('.reason-custom-wrap').hide();
    $reason.val(customText ? selectedPreset + ' — ' + customText : selectedPreset);
  }

  var $reasonPreset = $form.find('#reason-preset');
  var $reasonCustom = $form.find('#reason-custom');

  if ($reasonPreset.length) {
    $reasonPreset.on('change', function () {
      syncReasonSelection();
    });
  }

  if ($reasonCustom.length) {
    $reasonCustom.on('input', function () {
      syncReasonSelection();
    });
  }

  $form.on('submit', function () {
    syncReasonSelection();
  });

  applyMasks();

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
        '<span class="field-hint field-hint--error" role="alert"><i class="fa fa-exclamation-circle" aria-hidden="true"></i> ' +
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
      return;
    }
    saveRecentValues();
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

