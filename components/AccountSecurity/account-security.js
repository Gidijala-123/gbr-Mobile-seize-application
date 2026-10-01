$(document).on("click", "#totpSecurityButton", function () {
  $("#totpSecurityStatus").text("Loading security settings...");
  $("#totpSetupPanel, #totpRecoveryPanel, #totpEnabledPanel").hide();
  $("#totpDisabledPanel").hide();

  $.get("/totp/status")
    .done(function (status) {
      if (status.enabled) {
        $("#totpSecurityStatus").text("Two-factor authentication is enabled.");
        $("#totpRecoveryCount").text(
          status.recoveryCodesRemaining + " recovery codes remaining.",
        );
        $("#totpEnabledPanel").show();
      } else {
        $("#totpSecurityStatus").text("Two-factor authentication is not enabled.");
        $("#totpDisabledPanel").show();
      }
    })
    .fail(function () {
      $("#totpSecurityStatus").text("Unable to load security settings.");
    });
});

$("#totp-security-modal").on("hidden.bs.modal", function () {
  $("#totpRecoveryCodes, #totpManualSecret").text("");
  $("#totpSetupCode, #totpDisablePassword, #totpDisableCode").val("");
  $("#totpQrCode").removeAttr("src");
});

$(document).on("click", "#totpStartSetup", function () {
  var button = $(this).prop("disabled", true);
  $.post("/totp/setup")
    .done(function (result) {
      $("#totpQrCode").attr("src", result.qrCode);
      $("#totpManualSecret").text(result.secret);
      $("#totpSetupCode").val("");
      $("#totpDisabledPanel, #totpEnabledPanel").hide();
      $("#totpSetupPanel").show();
      $("#totpSecurityStatus").text("Scan and verify your authenticator app.");
    })
    .fail(function (response) {
      var message = response.responseJSON && response.responseJSON.error;
      $("#totpSecurityStatus").text(message || "Unable to start authenticator setup.");
    })
    .always(function () {
      button.prop("disabled", false);
    });
});

$(document).on("click", "#totpConfirmSetup", function () {
  $.post("/totp/confirm", { code: $("#totpSetupCode").val().trim() })
    .done(function (result) {
      $("#totpRecoveryCodes").text(result.recoveryCodes.join("\n"));
      $("#totpSetupPanel, #totpDisabledPanel").hide();
      $("#totpRecoveryPanel").show();
      $("#totpSecurityStatus").text("Two-factor authentication is enabled.");
    })
    .fail(function (response) {
      var message = response.responseJSON && response.responseJSON.error;
      $("#totpSecurityStatus").text(message || "Unable to verify the authenticator code.");
    });
});

$(document).on("click", "#totpRecoveryDone", function () {
  $("#totp-security-modal").modal("hide");
});

$(document).on("click", "#totpDisable", function () {
  $.post("/totp/disable", {
    password: $("#totpDisablePassword").val(),
    code: $("#totpDisableCode").val().trim(),
  }).done(function (result) {
      if (result.csrfToken) $("meta[name='csrf-token']").attr("content", result.csrfToken);
      $("#totpDisablePassword, #totpDisableCode").val("");
      $("#totp-security-modal").modal("hide");
      if (window.GBR && GBR.toast) GBR.toast.success("Two-factor authentication disabled.");
    }).fail(function (response) {
      var message = response.responseJSON && response.responseJSON.error;
      $("#totpSecurityStatus").text(message || "Unable to disable two-factor authentication.");
    });
});
