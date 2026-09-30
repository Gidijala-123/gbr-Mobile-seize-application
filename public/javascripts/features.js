/**
 * GBR Mobile Storage Application
 * features.js — Tasks 2-10: Toast · Delete · Dark Mode · Session Timeout
 *               Smart Search · Form Validation · Keyboard Shortcuts
 *               Animated Counters · Print Single Record
 */

/* ============================================================
   TASK 2: TOAST NOTIFICATION SYSTEM
   Replaces all alert() with beautiful slide-in toasts
   ============================================================ */
window.GBR = window.GBR || {};

GBR.toast = (function () {
  var _container = null;

  function _getContainer() {
    if (!_container) {
      _container = document.getElementById("toast-container");
      if (!_container) {
        _container = document.createElement("div");
        _container.id = "toast-container";
        document.body.appendChild(_container);
      }
    }
    return _container;
  }

  function show(message, type, duration) {
    type = type || "info"; // 'success' | 'error' | 'warning' | 'info'
    duration = duration || 3500;

    var icons = {
      success: "fa-check-circle",
      error: "fa-times-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle",
    };
    var container = _getContainer();

    var toast = document.createElement("div");
    toast.className = "gbr-toast gbr-toast--" + type;
    toast.innerHTML =
      '<i class="fa ' +
      icons[type] +
      ' toast-icon"></i>' +
      '<span class="toast-msg">' +
      message +
      "</span>" +
      '<button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';

    container.appendChild(toast);

    // Animate in
    setTimeout(function () {
      toast.classList.add("gbr-toast--visible");
    }, 10);

    // Auto remove
    setTimeout(function () {
      toast.classList.remove("gbr-toast--visible");
      setTimeout(function () {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 400);
    }, duration);

    return toast;
  }

  return {
    show: show,
    success: function (m) {
      show(m, "success");
    },
    error: function (m) {
      show(m, "error", 5000);
    },
    warning: function (m) {
      show(m, "warning", 4500);
    },
    info: function (m) {
      show(m, "info");
    },
  };
})();

/* Override native alert for backward compatibility */
window._nativeAlert = window.alert;
window.alert = function (msg) {
  if (typeof GBR !== "undefined" && GBR.toast) {
    var type = /error|fail|wrong|invalid|not allow/i.test(msg)
      ? "error"
      : /success|register|welcome|changed|returned/i.test(msg)
        ? "success"
        : /warn|check|smart/i.test(msg)
          ? "warning"
          : "info";
    GBR.toast.show(msg, type);
  } else {
    window._nativeAlert(msg);
  }
};

/* ============================================================
   TASK 3: DELETE RECORD
   ============================================================ */
$(document).ready(function () {
  var _pendingDeleteRno = null;

  /* Open confirm modal */
  $(document).on("click", ".del-btn", function (e) {
    e.stopPropagation();
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
    _pendingDeleteRno = null;
  });
  $("#confirm-modal").on("click", function (e) {
    if (e.target === this) {
      $(this).fadeOut(200);
      _pendingDeleteRno = null;
    }
  });

  /* Confirm delete */
  $("#confirm-ok").on("click", function () {
    if (!_pendingDeleteRno) return;
    var rno = _pendingDeleteRno;
    $("#confirm-modal").fadeOut(200);
    _pendingDeleteRno = null;

    $.ajax({
      method: "POST",
      url: "/delete",
      data: { rno: rno },
      success: function (res) {
        GBR.toast.success(
          'Record for RollNo "' + rno + '" deleted successfully.',
        );
        /* Remove the row from all visible DataTables */
        $("table")
          .find("tr")
          .each(function () {
            var rnoCell = $(this).find("td").eq(3); // RollNo is column index 3
            if (rnoCell.text().trim() === rno) {
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

/* ============================================================
   TASK 4: DARK MODE
   ============================================================ */
(function () {
  var DARK_KEY = "gbr_dark_mode";

  function applyDark(on) {
    if (on) {
      document.body.classList.add("dark-mode");
      $("#darkModeToggle").html('<i class="fa fa-sun-o"></i>');
      $("#darkModeToggle").attr("title", "Switch to light mode");
    } else {
      document.body.classList.remove("dark-mode");
      $("#darkModeToggle").html('<i class="fa fa-moon-o"></i>');
      $("#darkModeToggle").attr("title", "Switch to dark mode");
    }
    localStorage.setItem(DARK_KEY, on ? "1" : "0");
  }

  /* Load persisted preference */
  $(document).ready(function () {
    var saved = localStorage.getItem(DARK_KEY);
    if (saved === "1") applyDark(true);

    $("#darkModeToggle").on("click", function () {
      var isDark = document.body.classList.contains("dark-mode");
      applyDark(!isDark);
      GBR.toast.info(isDark ? "Light mode enabled" : "Dark mode enabled");
    });
  });
})();

/* ============================================================
   TASK 6: SMART REAL-TIME SEARCH ACROSS ALL FIELDS
   ============================================================ */
$(document).ready(function () {
  var $smartInput = $("#smartSearch");
  var $clearBtn = $("#smartSearchClear");
  var $resultArea = $("#smart-results");

  /* Build a flat data store from the #example5 table (all records) */
  function getAllRows() {
    var rows = [];
    $("#example5 tbody tr").each(function () {
      var cells = $(this).find("td");
      rows.push({
        date: cells.eq(0).text(),
        time: cells.eq(1).text(),
        id: cells.eq(2).text(),
        rno: cells.eq(3).text(),
        sname: cells.eq(4).text(),
        clg: cells.eq(5).text(),
        brch: cells.eq(6).text(),
        year: cells.eq(7).text(),
        sec: cells.eq(8).text(),
        spno: cells.eq(9).text(),
        pname: cells.eq(10).text(),
        ppno: cells.eq(11).text(),
        mmodel: cells.eq(12).text(),
        imei: cells.eq(13).text(),
        mclr: cells.eq(14).text(),
        rsn: cells.eq(15).text(),
        ename: cells.eq(16).text(),
        epno: cells.eq(17).text(),
        eid: cells.eq(18).text(),
        _$tr: $(this),
      });
    });
    return rows;
  }

  function highlight(text, query) {
    if (!query) return text;
    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(
      new RegExp("(" + escaped + ")", "gi"),
      '<mark class="hl">$1</mark>',
    );
  }

  $smartInput.on("input", function () {
    var q = $(this).val().trim().toLowerCase();
    $clearBtn.toggle(q.length > 0);

    if (q.length < 1) {
      $("#smart-results-wrapper").addClass("srw-hidden");
      $("#smart-no-results").hide();
      $("#smart-count").text("0 Results");
      return;
    }

    var rows = getAllRows();
    var matches = rows.filter(function (r) {
      return Object.keys(r)
        .filter(function (k) {
          return k !== "_$tr";
        })
        .some(function (k) {
          return r[k].toLowerCase().indexOf(q) > -1;
        });
    });

    var $tbl = $("#smart-results-wrapper");
    var $noRes = $("#smart-no-results");
    var $tbody = $("#smart-results-table tbody").empty();

    if (matches.length === 0) {
      $tbl.addClass("srw-hidden");
      $("#smart-count").text("0 Results");
      $noRes
        .show()
        .html(
          '<i class="fa fa-search"></i> No records found for <strong>"' +
            q +
            '"</strong>',
        );
      return;
    }

    $noRes.hide();
    matches.forEach(function (r) {
      var tr =
        "<tr>" +
        "<td>" +
        highlight(r.rno, q) +
        "</td>" +
        "<td>" +
        highlight(r.sname, q) +
        "</td>" +
        "<td>" +
        highlight(r.clg, q) +
        "</td>" +
        "<td>" +
        highlight(r.brch, q) +
        "</td>" +
        "<td>" +
        highlight(r.mmodel, q) +
        "</td>" +
        "<td>" +
        highlight(r.imei, q) +
        "</td>" +
        "<td>" +
        highlight(r.mclr, q) +
        "</td>" +
        "<td>" +
        highlight(r.ename, q) +
        "</td>" +
        "<td>" +
        r.date +
        "</td>" +
        '<td><button type="button" class="edit" data-rno="' +
        r.rno +
        '">Edit</button></td>' +
        "</tr>";
      $tbody.append(tr);
    });
    $tbl.removeClass("srw-hidden");
    $("#smart-count").text(
      matches.length + (matches.length === 1 ? " Result" : " Results"),
    );
  });

  $clearBtn.on("click", function () {
    $smartInput.val("").trigger("input").focus();
  });
});

/* ============================================================
   TASK 7: FORM VALIDATION WITH LIVE VISUAL FEEDBACK
   ============================================================ */
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
   TASK 8: KEYBOARD SHORTCUTS
   ============================================================ */
$(document).ready(function () {
  $(document).on("keydown", function (e) {
    /* Don't fire when typing in an input */
    if ($(e.target).is("input, textarea, select")) return;

    /* Ctrl+N — New entry (go to Dashboard tab) */
    if (e.ctrlKey && e.key === "n") {
      e.preventDefault();
      $('[data-toggle="tab"][href="#dboard"]').tab("show");
      GBR.toast.info("Keyboard shortcut: New Entry form opened (Ctrl+N)");
    }

    /* Ctrl+F — Focus smart search */
    if (e.ctrlKey && e.key === "f") {
      e.preventDefault();
      $('[data-toggle="tab"][href="#search-edit"]').tab("show");
      setTimeout(function () {
        $("#smartSearch").focus();
      }, 350);
      GBR.toast.info("Keyboard shortcut: Search focused (Ctrl+F)");
    }

    /* Ctrl+L — Total list */
    if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      $('[data-toggle="tab"][href="#totallist"]').tab("show");
    }

    /* Ctrl+D — Toggle dark mode */
    if (e.ctrlKey && e.key === "d") {
      e.preventDefault();
      $("#darkModeToggle").click();
    }
  });

  /* Show keyboard shortcut hint on first visit */
  if (!localStorage.getItem("gbr_shortcuts_shown")) {
    setTimeout(function () {
      GBR.toast.info(
        "💡 Shortcuts: Ctrl+N new entry · Ctrl+F search · Ctrl+D dark mode · Esc close",
      );
      localStorage.setItem("gbr_shortcuts_shown", "1");
    }, 2000);
  }
});

/* ============================================================
   TASK 9: ANIMATED STAT COUNTERS
   ============================================================ */
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

/* ============================================================
   TASK 10: PRINT SINGLE RECORD
   ============================================================ */
$(document).ready(function () {
  /* Print a single row as a formatted report card */
  $(document).on("click", ".print-row-btn", function () {
    var $row = $(this).closest("tr");
    var cells = $row.find("td");
    var headers = $row.closest("table").find("thead th");

    var html =
      "<html><head><title>Record — Mobile Storage Application</title>" +
      "<style>body{font-family:Lato,sans-serif;padding:24px;color:#0f172a;}" +
      "h1{font-size:20px;color:#1e3a8a;margin-bottom:4px;}" +
      "p.sub{color:#64748b;font-size:13px;margin-bottom:20px;}" +
      "table{width:100%;border-collapse:collapse;}" +
      "th{background:#1e293b;color:#f8fafc;padding:10px 12px;text-align:left;font-size:12px;letter-spacing:.05em;text-transform:uppercase;}" +
      "td{padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;}" +
      "tr:nth-child(even) td{background:#f8fafc;}" +
      ".badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;}" +
      ".badge-at{background:#dcfce7;color:#15803d;}" +
      ".badge-ret{background:#fee2e2;color:#dc2626;}" +
      "</style></head><body>" +
      "<h1>📱 Mobile Storage Application</h1>" +
      '<p class="sub">Record Print — Generated: ' +
      new Date().toLocaleString() +
      "</p><table><tbody>";

    cells.each(function (i) {
      var label = headers.eq(i).text().trim();
      var value = $(this).text().trim();
      if (label === "Action") return;
      if (label === "Status") {
        var cls = value === "At_office" ? "badge-at" : "badge-ret";
        value = '<span class="badge ' + cls + '">' + value + "</span>";
      }
      html += "<tr><th>" + label + "</th><td>" + value + "</td></tr>";
    });

    html += "</tbody></table></body></html>";
    var win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function () {
      win.print();
    }, 400);
  });

  /* Add print button to each row when DataTables is drawn */
  function addPrintButtons(tableId) {
    var $dt = $(tableId);
    $dt.on("draw.dt", function () {
      $(this)
        .find("tbody tr")
        .each(function () {
          var $td = $(this).find("td:last-child");
          if (!$td.find(".print-row-btn").length) {
            $td.append(
              ' <button class="print-row-btn" title="Print this record"><i class="fa fa-print"></i></button>',
            );
          }
        });
    });
  }

  addPrintButtons("#example2");
  addPrintButtons("#example3");
  addPrintButtons("#example4");
});

/* ============================================================
   SMART SEARCH TABLE INJECTION (Task 6 continued)
   Injected after #example5 but before the edit form
   ============================================================ */
$(document).ready(function () {
  /* Insert smart search results area after .srcbar if not already there */
  if (!$("#smart-results-table").length) {
    var smartHtml =
      '<div id="smart-results-status" class="smart-results-status" role="status" aria-live="polite"><span id="smart-count" class="smart-count-badge">0 Results</span></div>' +
      '<div id="smart-no-results" style="display:none;" class="smart-no-results"></div>' +
      '<div class="table-responsive srw-hidden" id="smart-results-wrapper" style="margin-top:8px;">' +
      '<table id="smart-results-table" class="table table-striped">' +
      "<thead><tr>" +
      "<th>RollNo</th><th>Student Name</th><th>College</th><th>Branch</th>" +
      "<th>Mobile Model</th><th>IMEI</th><th>Color</th><th>Employee</th><th>Date</th><th>Action</th>" +
      "</tr></thead>" +
      "<tbody></tbody>" +
      "</table>" +
      "</div>";
    $(".smart-search-bar").after(smartHtml);
  }
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

/* ============================================================
   CONTACT TAB — New department card + year button navigation
   ============================================================ */
$(document).ready(function () {
  /* Year buttons trigger the same panels as click.js legacy handlers */
  var btnToPanel = {
    m11: "#m11",
    m12: "#m12",
    m21: "#m21",
    m22: "#m22",
    m31: "#m31",
    m32: "#m32",
    b11: "#b11",
    b12: "#b12",
    b21: "#b21",
    b22: "#b22",
    b31: "#b31",
    b32: "#b32",
    a11: "#a11",
    a21: "#a21",
    a31: "#a31",
  };

  /* Also map to legacy click.js IDs for the hidden dl-menu compatibility */
  var btnToLegacy = {
    m11: "#cntm11",
    m12: "#cntm12",
    m21: "#cntm21",
    m22: "#cntm22",
    m31: "#cntm31",
    m32: "#cntm32",
    b11: "#cntb11",
    b12: "#cntb12",
    b21: "#cntb21",
    b22: "#cntb22",
    b31: "#cntb31",
    b32: "#cntb32",
    a11: "#cnta11",
    a21: "#cnta21",
    a31: "#cnta31",
  };

  $(document).on("click", ".year-btn", function () {
    var target = $(this).data("target");

    /* Hide department selector, show faculty panels */
    $(".contact-dept-grid").hide();
    $(".contact-selector-label").hide();
    $(".faculty-panels-container").show();
    $("#contact-back-btn").show();

    /* Trigger the legacy click.js handler for the matching hidden dl-menu item */
    var legacyId = btnToLegacy[target];
    if (legacyId && $(legacyId).length) {
      $(legacyId).trigger("click");
    } else {
      /* Fallback: directly show the panel */
      $(".main").hide();
      var panelId = btnToPanel[target];
      if (panelId) {
        $(panelId).show();
        if (window.GBR && GBR.toast)
          GBR.toast.info("Showing faculty for " + target.toUpperCase());
      }
    }

    /* Highlight active button */
    $(".year-btn").removeClass("year-btn--active");
    $(this).addClass("year-btn--active");
  });

  /* Back button */
  $(document).on("click", "#contact-back-btn", function () {
    /* Hide all faculty panels */
    $(".asd .dnt").hide();
    /* Show main contact layout */
    $(".contact-dept-grid").show();
    $(".contact-selector-label").show();
    $(".faculty-panels-container").hide();
    $(this).hide();
    $(".year-btn").removeClass("year-btn--active");
    /* Show .main for legacy click.js */
    $(".main").show();
  });

  /* Ensure faculty panels container is hidden on contact tab open */
  $('[data-toggle="tab"][href="#contact"]').on("shown.bs.tab", function () {
    $(".faculty-panels-container").hide();
    $("#contact-back-btn").hide();
    $(".contact-dept-grid").show();
    $(".contact-selector-label").show();
    $(".year-btn").removeClass("year-btn--active");
  });

});

$(document).ready(function () {
  $(document).on("input", "#staffDirectorySearch", function () {
    var query = $(this).val().trim().toLowerCase();
    var visibleCount = 0;
    var totalCount = $("#staffDirectoryGrid .staff-profile").length;

    $("#staffDirectoryGrid .staff-profile").each(function () {
      var matches = (this.getAttribute("data-search") || "").indexOf(query) !== -1;
      this.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    $("#staffDirectoryStatus").text(
      "Showing " + visibleCount + " of " + totalCount + " faculty",
    );
    $("#staffDirectoryEmpty").prop("hidden", visibleCount > 0);
  });
});

$(document).ready(function () {
  var femaleNames = new Set([
    "prof. s. padmaja",
    "prof. m. sunitha",
    "prof. r. kiranmai",
  ]);
  var maleNames = new Set([
    "dr. n. chandrasekhar",
    "prof. l. satyanarayana",
    "dr. a. venkataramana",
    "prof. c. bhaskara",
    "dr. v. nagaraju",
    "prof. k. srinivasa",
    "dr. p. ramakrishna",
    "dr. b. sudhakar",
    "dr. t. venkateswara",
  ]);
  var portraits = {
    female: [
      "/images/faculty-female-01.jpg",
      "/images/faculty-female-02.jpg",
      "/images/faculty-female-03.jpg",
    ],
    male: [
      "/images/faculty-male-01.jpg",
      "/images/faculty-male-02.jpg",
      "/images/faculty-male-03.jpg",
      "/images/faculty-male-04.jpg",
      "/images/faculty-male-05.jpg",
      "/images/faculty-male-06.jpg",
      "/images/faculty-male-07.jpg",
      "/images/faculty-male-08.jpg",
      "/images/faculty-male-09.jpg",
    ],
  };
  var portraitIndexes = { female: 0, male: 0 };
  var staffByEmployee = new Map();
  var rows = document.querySelectorAll("#example2 tbody tr");
  var grid = document.getElementById("staffDirectoryGrid");

  if (!grid || !rows.length) return;

  rows.forEach(function (row) {
    var name = row.cells[16] ? row.cells[16].textContent.trim() : "";
    var employeeId = row.cells[18] ? row.cells[18].textContent.trim() : "";
    if (!name) return;

    var key = employeeId.toLowerCase() || name.toLowerCase();
    if (staffByEmployee.has(key)) return;

    var normalizedName = name.toLowerCase();
    var gender = femaleNames.has(normalizedName)
      ? "female"
      : maleNames.has(normalizedName)
        ? "male"
        : null;
    var portrait = gender
      ? portraits[gender][portraitIndexes[gender]++] || null
      : null;

    var initials = name
      .replace(/^(dr|prof)\.\s*/i, "")
      .replace(/\./g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map(function (part) {
        return part[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();

    staffByEmployee.set(key, {
      name: name,
      employeeId: employeeId,
      portrait: portrait,
      initials: initials,
    });
  });

  var staff = Array.from(staffByEmployee.values()).sort(function (left, right) {
    return left.name.localeCompare(right.name);
  });

  staff.forEach(function (member) {
    var card = document.createElement("article");
    card.className = "staff-profile";
    card.dataset.search = (member.name + " " + member.employeeId).toLowerCase();

    var photo = document.createElement("div");
    photo.className = "staff-profile-photo";

    if (member.portrait) {
      var image = document.createElement("img");
      image.src = member.portrait;
      image.alt = "Representative faculty portrait";
      image.loading = "lazy";
      photo.appendChild(image);

      var photoNote = document.createElement("span");
      photoNote.className = "staff-photo-note";
      photoNote.textContent = "Representative portrait";
      photo.appendChild(photoNote);
    } else {
      var initials = document.createElement("span");
      initials.className = "staff-profile-initials";
      initials.textContent = member.initials;
      photo.appendChild(initials);
    }

    var body = document.createElement("div");
    body.className = "staff-profile-body";

    var role = document.createElement("span");
    role.className = "staff-profile-role";
    role.textContent = "Faculty";

    var heading = document.createElement("h3");
    heading.textContent = member.name;

    var id = document.createElement("p");
    id.className = "staff-profile-id";
    var icon = document.createElement("i");
    icon.className = "fa fa-id-card";
    icon.setAttribute("aria-hidden", "true");
    var idText = document.createElement("span");
    idText.textContent = member.employeeId || "Employee ID unavailable";
    id.append(icon, idText);

    body.append(role, heading, id);
    card.append(photo, body);
    grid.appendChild(card);
  });

  var status = document.getElementById("staffDirectoryStatus");
  var total = document.getElementById("staffDirectoryTotal");
  var empty = document.getElementById("staffDirectoryEmpty");
  if (status) status.textContent = "Showing " + staff.length + " faculty";
  if (total) total.textContent = staff.length;
  if (empty) empty.hidden = staff.length > 0;
});

$(document).ready(function () {
  function showStaffDirectory() {
    $("#contact .contact-selector-section").hide();
    $("#contact .faculty-panels-container").hide();
    $("#contact .staff-directory").prop("hidden", false);
  }

  $(document).on("click", ".dept-directory-open, #contact .year-btn", function () {
    showStaffDirectory();
  });

  $(document).on("click", "#staffDirectoryBack", function () {
    $("#contact .staff-directory").prop("hidden", true);
    $("#contact .contact-selector-section").show();
    $("#contact .contact-dept-grid, #contact .contact-selector-label").show();
    $("#contact .year-btn").removeClass("year-btn--active");
    $("#staffDirectorySearch").val("").trigger("input");
  });

  $('[data-toggle="tab"][href="#contact"]').on("shown.bs.tab", function () {
    $("#contact .staff-directory").prop("hidden", true);
    $("#contact .contact-selector-section").show();
  });
});
