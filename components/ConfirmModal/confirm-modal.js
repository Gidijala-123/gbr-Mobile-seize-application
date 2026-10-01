$(document).ready(function () {
  var _pendingDeleteId = null;
  var _pendingDeleteRno = null;

  /* Open confirm modal */
  $(document).on("click", ".del-btn", function (e) {
    e.stopPropagation();
    _pendingDeleteId = $(this).data("recordId");
    _pendingDeleteRno = $(this).data("rno");
    var name = $(this).data("name") || "this record";
    $("#confirm-message").text(
      'Delete record for "' +
        name +
        '" (RollNo: ' +
        _pendingDeleteRno +
        ")? This action cannot be undone.",
    );
    $("#confirm-modal").fadeIn(200);
  });

  /* Cancel */
  $("#confirm-cancel").on("click", function () {
    $("#confirm-modal").fadeOut(200);
    _pendingDeleteId = null;
    _pendingDeleteRno = null;
  });
  $("#confirm-modal").on("click", function (e) {
    if (e.target === this) {
      $(this).fadeOut(200);
      _pendingDeleteId = null;
      _pendingDeleteRno = null;
    }
  });

  /* Confirm delete */
  $("#confirm-ok").on("click", function () {
    if (!_pendingDeleteId) return;
    var recordId = _pendingDeleteId;
    var rno = _pendingDeleteRno;
    $("#confirm-modal").fadeOut(200);
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
            var actionId = $(this).find("[data-record-id]").first().data("recordId");
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
});

$(document).on("click", ".restore-btn", function () {
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

