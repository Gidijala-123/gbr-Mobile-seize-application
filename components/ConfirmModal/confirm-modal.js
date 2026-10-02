$(document).ready(function () {
  var _pendingDeleteId = null;
  var _pendingDeleteRno = null;
  var pendingConfirmation = null;
  var returnFocusElement = null;

  function resetModalContent() {
    $("#confirm-title").text("Confirm Action");
    $("#confirm-cancel").html('<i class="fa fa-times" aria-hidden="true"></i> Cancel');
    $("#confirm-ok").html('<i class="fa fa-trash" aria-hidden="true"></i> Delete');
  }

  function closeConfirmModal() {
    $("#confirm-modal").fadeOut(200, function () {
      if (returnFocusElement && typeof returnFocusElement.focus === "function") {
        returnFocusElement.focus();
      }
      returnFocusElement = null;
    });
    resetModalContent();
  }

  function settleConfirmation(confirmed) {
    if (!pendingConfirmation) return false;
    var resolve = pendingConfirmation;
    pendingConfirmation = null;
    closeConfirmModal();
    resolve(confirmed);
    return true;
  }

  window.GBRConfirm = function (options) {
    var settings = options || {};
    return new Promise(function (resolve) {
      pendingConfirmation = resolve;
      returnFocusElement = document.activeElement;
      $("#confirm-title").text(settings.title || "Confirm Action");
      $("#confirm-message").text(settings.message || "Are you sure you want to continue?");
      $("#confirm-cancel").text(settings.cancelText || "Cancel");
      $("#confirm-ok").text(settings.confirmText || "Continue");
      $("#confirm-modal").fadeIn(200);
      $("#confirm-ok").trigger("focus");
    });
  };

  function openDeleteConfirm(e) {
    var $btn = $(this);
    e.stopPropagation();
    returnFocusElement = this;
    _pendingDeleteId = $btn.data("recordId");
    _pendingDeleteRno = $btn.data("rno");
    var name = $btn.data("name") || "this record";
    $("#confirm-message").text(
      'Delete record for "' +
        name +
        '" (RollNo: ' +
        _pendingDeleteRno +
        ")? This action cannot be undone.",
    );
    $("#confirm-modal").fadeIn(200);
      $("#confirm-ok").trigger("focus");
  }

  /* Open confirm modal */
  $(document).on(
    "click",
    ".del-btn, [data-action='delete']",
    openDeleteConfirm,
  );

  /* Cancel */
  $("#confirm-cancel").on("click", function () {
    if (settleConfirmation(false)) return;
    closeConfirmModal();
    _pendingDeleteId = null;
    _pendingDeleteRno = null;
  });
  $("#confirm-modal").on("click", function (e) {
    if (e.target === this) {
      if (settleConfirmation(false)) return;
      closeConfirmModal();
      _pendingDeleteId = null;
      _pendingDeleteRno = null;
    }
  });

  /* Confirm delete */
  $("#confirm-ok").on("click", function () {
    if (settleConfirmation(true)) return;
    if (!_pendingDeleteId) return;
    var recordId = _pendingDeleteId;
    var rno = _pendingDeleteRno;
    closeConfirmModal();
    _pendingDeleteId = null;
    _pendingDeleteRno = null;

    $.ajax({
      method: "POST",
      url: "/delete",
      data: { _id: recordId },
      success: function (res) {
        GBR.toast.success(
          'Record for RollNo "' + rno + '" deleted successfully.',
        );
        /* Remove the row from all visible DataTables */
        $("table")
          .find("tr")
          .each(function () {
            var idCell = $(this).find("td").eq(2);
            var actionId = $(this)
              .find("[data-record-id]")
              .first()
              .data("recordId");
            if (idCell.text().trim() === recordId || actionId === recordId) {
              $(this).fadeOut(300, function () {
                $(this).remove();
              });
            }
          });
        /* Reload page after short delay to refresh counts */
        setTimeout(function () {
          location.reload();
        }, 1500);
      },
      error: function (xhr) {
        GBR.toast.error(
          "Failed to delete: " +
            (xhr.responseJSON ? xhr.responseJSON.error : "Server error"),
        );
      },
    });
  });

  $(document).on("keydown", function (event) {
    if (!$("#confirm-modal").is(":visible")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (!settleConfirmation(false)) {
        closeConfirmModal();
        _pendingDeleteId = null;
        _pendingDeleteRno = null;
      }
      return;
    }
    if (event.key !== "Tab") return;

    var focusable = $("#confirm-modal")
      .find("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")
      .filter(":visible");
    if (!focusable.length) {
      event.preventDefault();
      $("#confirm-modal").trigger("focus");
      return;
    }
    var first = focusable.first()[0];
    var last = focusable.last()[0];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
});

$(document).on("click", ".restore-btn, [data-action='restore']", function () {
  var recordId = $(this).data("recordId");
  if (!recordId) return;

  $.ajax({
    method: "POST",
    url: "/restore/" + encodeURIComponent(recordId),
    success: function () {
      GBR.toast.success("Record restored.");
      window.location.reload();
    },
    error: function (xhr) {
      GBR.toast.error(
        xhr.responseJSON ? xhr.responseJSON.error : "Unable to restore record.",
      );
    },
  });
});
