$(document).ready(function () {
  var $modal = $("#return-workflow-modal");
  var $form = $("#return-workflow-form");
  var $canvas = $("#return-signature-pad");
  var $textInput = $("#return-signature-text");
  var $signatureHidden = $("#return-signature");
  var $status = $("#return-workflow-status");
  var recordedSignature = null;
  var lastFocusedButton = null;

  function setCsrfToken() {
    var $csrf = $('meta[name="csrf-token"]');
    var value = $csrf.length ? $csrf.attr("content") : "";
    $("#return-csrf").val(value);
  }

  function showStatus(message, isError) {
    if (!$status.length) return;
    $status.text(message || "");
    $status.removeClass("error success");
    if (message) {
      $status.addClass(isError ? "error" : "success");
    }
  }

  function closeReturnWorkflow() {
    if (!$modal.length) return;
    $modal.fadeOut(180, function () {
      if (lastFocusedButton && typeof lastFocusedButton.focus === "function") {
        lastFocusedButton.focus();
      }
      lastFocusedButton = null;
    });
    $form[0].reset();
    showStatus("");
    clearSignaturePad();
    setCsrfToken();
  }

  function getCanvasContext() {
    var canvas = $canvas[0];
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function clearSignaturePad() {
    var canvas = $canvas[0];
    if (!canvas) return;
    var ctx = getCanvasContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $signatureHidden.val("");
    recordedSignature = null;
    $("#return-signature-placeholder").show();
  }

  function ensureCanvasReady() {
    var canvas = $canvas[0];
    if (!canvas) return;
    var ctx = getCanvasContext();
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    $("#return-signature-placeholder").hide();
  }

  function startDrawing(event) {
    var canvas = $canvas[0];
    if (!canvas) return;
    var ctx = getCanvasContext();
    if (!ctx) return;
    ensureCanvasReady();
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    recordedSignature = true;
    $textInput.val("");
    $("#return-signature-mode-canvas").prop("checked", true);
    $signatureHidden.val(canvas.toDataURL("image/png"));
  }

  function continueDrawing(event) {
    if (!recordedSignature) return;
    var canvas = $canvas[0];
    var ctx = getCanvasContext();
    if (!canvas || !ctx) return;
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
    $signatureHidden.val(canvas.toDataURL("image/png"));
  }

  function stopDrawing() {
    recordedSignature = false;
  }

  function fillReturnModal($row) {
    var recordId = $row.find("td").eq(2).text().trim();
    var rollNumber = $row.find("td").eq(3).text().trim();
    var studentName = $row.data("studentName") || $row.find("td").eq(4).text().trim();
    var returnedBy = studentName || "";
    $("#return-record-id").val(recordId);
    $("#return-workflow-record-id").text(recordId || "—");
    $("#return-workflow-roll-number").text(rollNumber || "—");
    $("#return-returned-by").val(returnedBy);
    $("#return-relation").val("Parent");
    $("#return-returned-at").val(new Date().toISOString().slice(0, 16));
    $("#return-return-notes").val("");
    $("#return-signature-text").val("");
    clearSignaturePad();
    showStatus("Ready to confirm the return acknowledgement.", false);
  }

  function openReturnWorkflow(event) {
    var $button = $(this);
    var $row = $button.closest("tr");
    if (!$row.length) return;
    lastFocusedButton = this;
    fillReturnModal($row);
    $modal.fadeIn(180, function () {
      $("#return-returned-by").trigger("focus");
    });
  }

  $(document).on("click", ".return-btn", openReturnWorkflow);

  $("#return-workflow-close").on("click", closeReturnWorkflow);
  $("#return-workflow-modal").on("click", function (event) {
    if (event.target === this) closeReturnWorkflow();
  });

  $("#return-signature-pad").on("pointerdown", function (event) {
    event.preventDefault();
    $("#return-signature-mode-canvas").prop("checked", true);
    $("#return-signature-text").val("");
    startDrawing(event);
  });

  $("#return-signature-pad").on("pointermove", function (event) {
    if (!recordedSignature) return;
    event.preventDefault();
    continueDrawing(event);
  });

  $(document).on("pointerup pointerleave", function () {
    stopDrawing();
  });

  $("#return-signature-clear").on("click", function () {
    clearSignaturePad();
    $("#return-signature-text").val("");
    $("#return-signature-mode-text").prop("checked", false);
    $("#return-signature-mode-canvas").prop("checked", true);
  });

  $("input[name='signature-mode']").on("change", function () {
    var mode = $(this).val();
    var $canvasWrap = $(".return-signature-canvas-wrap");
    var $textWrap = $(".return-signature-input-wrap");
    if (mode === "canvas") {
      $canvasWrap.addClass("active");
      $textWrap.removeClass("active");
      $textInput.val("");
      $("#return-signature-placeholder").show();
    } else {
      $canvasWrap.removeClass("active");
      $textWrap.addClass("active");
      clearSignaturePad();
      $("#return-signature-text").trigger("focus");
    }
  });

  $("#return-signature-text").on("input", function () {
    var value = $(this).val().trim();
    $("#return-signature-mode-text").prop("checked", true);
    if (value) {
      clearSignaturePad();
      $signatureHidden.val("");
      $("#return-signature-mode-canvas").prop("checked", false);
    }
  });

  $form.on("submit", function (event) {
    var returnedBy = $("#return-returned-by").val().trim();
    var returnRelation = $("#return-relation").val();
    var returnedAt = $("#return-returned-at").val();
    var signatureValue = $("#return-signature").val();
    var typedValue = $("#return-signature-text").val().trim();

    if (!returnedBy || !returnRelation || !returnedAt) {
      event.preventDefault();
      showStatus("Please complete the return details before submitting.", true);
      return;
    }

    if (!signatureValue && !typedValue) {
      event.preventDefault();
      showStatus("Please add a signature or type the acknowledgement name.", true);
      return;
    }

    if (!signatureValue && typedValue) {
      $("#return-signature").val(typedValue);
    }

    setCsrfToken();
    showStatus("Saving the return acknowledgement…", false);
  });

  $(document).on("keydown", function (event) {
    if (!$modal.is(":visible")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeReturnWorkflow();
      return;
    }
    if (event.key !== "Tab") return;

    var focusable = $modal
      .find("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")
      .filter(":visible");

    if (!focusable.length) {
      event.preventDefault();
      $("#return-workflow-close").trigger("focus");
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

  setCsrfToken();
  clearSignaturePad();
});
