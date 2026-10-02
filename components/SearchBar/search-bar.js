$(document).ready(function () {
  function getTableRows(tableSelector) {
    var table = $(tableSelector);
    if (!table.length) return [];
    return table.find("tbody tr").toArray();
  }

  function buildFilterOptions() {
    var optionMap = {
      college: new Set(),
      branch: new Set(),
      year: new Set(),
      section: new Set(),
    };

    getTableRows("#example2, #example3, #example4, #example5").forEach(function (row) {
      var cells = $(row).find("td");
      var payload = {
        college: cells.eq(5).text().trim(),
        branch: cells.eq(6).text().trim(),
        year: cells.eq(7).text().trim(),
        section: cells.eq(8).text().trim(),
      };

      Object.keys(payload).forEach(function (key) {
        var value = payload[key];
        if (value) {
          optionMap[key].add(value);
        }
      });
    });

    [
      ["#filter-college", "college"],
      ["#filter-branch", "branch"],
      ["#filter-year", "year"],
      ["#filter-section", "section"],
    ].forEach(function ([selector, key]) {
      var $select = $(selector);
      var currentValue = $select.val();
      $select.find("option[value!='']").remove();
      Array.from(optionMap[key]).sort().forEach(function (value) {
        $('<option></option>').val(value).text(value).appendTo($select);
      });
      if (currentValue) {
        $select.val(currentValue);
      }
    });
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function matchesAdvancedFilters(row) {
    var $row = $(row);
    var cells = $row.find("td");
    var record = {
      date: cells.eq(0).text().trim(),
      status: cells.eq(18).text().trim(),
      college: cells.eq(5).text().trim(),
      branch: cells.eq(6).text().trim(),
      year: cells.eq(7).text().trim(),
      section: cells.eq(8).text().trim(),
      student: cells.eq(4).text().trim(),
      employee: cells.eq(16).text().trim(),
    };

    var statusFilter = $('input[name="status-filter"]:checked').val() || "";
    var collegeFilter = $("#filter-college").val() || "";
    var branchFilter = $("#filter-branch").val() || "";
    var yearFilter = $("#filter-year").val() || "";
    var sectionFilter = $("#filter-section").val() || "";
    var fromDate = $("#filter-date-from").val();
    var toDate = $("#filter-date-to").val();
    var studentFilter = normalizeText($("#filter-student").val());
    var employeeFilter = normalizeText($("#filter-employee").val());

    if (statusFilter && record.status !== statusFilter) return false;
    if (collegeFilter && record.college !== collegeFilter) return false;
    if (branchFilter && record.branch !== branchFilter) return false;
    if (yearFilter && record.year !== yearFilter) return false;
    if (sectionFilter && record.section !== sectionFilter) return false;
    if (fromDate && record.date && record.date < fromDate) return false;
    if (toDate && record.date && record.date > toDate) return false;
    if (studentFilter && normalizeText(record.student).indexOf(studentFilter) === -1) return false;
    if (employeeFilter && normalizeText(record.employee).indexOf(employeeFilter) === -1) return false;

    return true;
  }

  function applyAdvancedFilters() {
    $("#example2, #example3, #example4, #example5").each(function () {
      var $table = $(this);
      var rows = $table.find("tbody tr").toArray();
      rows.forEach(function (row) {
        $(row).toggle(matchesAdvancedFilters(row));
      });
    });
  }

  function clearAdvancedFilters() {
    $("#filter-college, #filter-branch, #filter-year, #filter-section").val("");
    $("#filter-date-from, #filter-date-to, #filter-student, #filter-employee").val("");
    $(".date-range-btn").removeClass("is-active");
    $("input[name='status-filter']").prop("checked", false);
    $("#status-all").prop("checked", true);
    $("#example2, #example3, #example4, #example5").find("tbody tr").show();
  }

  function setDateRange(range) {
    var now = new Date();
    var start = new Date(now.getTime());
    var end = new Date(now.getTime());

    if (range === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (range === "week") {
      var day = now.getDay();
      var diff = (day === 0 ? -6 : 1 - day);
      start.setDate(now.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (range === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (range === "30d") {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      $("#filter-date-from, #filter-date-to").val("");
      $(".date-range-btn").removeClass("is-active");
      return;
    }

    $("#filter-date-from").val(formatDateInput(start));
    $("#filter-date-to").val(formatDateInput(end));
    $(".date-range-btn").removeClass("is-active");
    $(".date-range-btn[data-range='" + range + "']").addClass("is-active");
    applyAdvancedFilters();
  }

  function formatDateInput(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  $(".date-range-btn").on("click", function () {
    var range = $(this).data("range");
    if (range === "clear") {
      $("#filter-date-from, #filter-date-to").val("");
      $(".date-range-btn").removeClass("is-active");
      return;
    }
    setDateRange(range);
  });

  $("#apply-advanced-filters").on("click", function () {
    applyAdvancedFilters();
  });

  $("#clear-advanced-filters").on("click", function () {
    clearAdvancedFilters();
  });

  $("#advanced-filter-toggle").on("click", function () {
    var $panel = $("#advanced-filter-panel");
    var expanded = $(this).attr("aria-expanded") === "true";
    $(this).attr("aria-expanded", String(!expanded));
    $(this).find("span").text(expanded ? "Show" : "Hide");
    $panel.toggleClass("is-collapsed", expanded);
    $panel.find(".advanced-filter-body").slideToggle(expanded);
  });

  buildFilterOptions();

  var $smartInput = $("#smartSearch");
  var $clearBtn = $("#smartSearchClear");

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

  function appendHighlightedText(parent, value, query) {
    var text = String(value == null ? "" : value);
    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var matcher = new RegExp(escaped, "gi");
    var cursor = 0;
    var match;

    while ((match = matcher.exec(text))) {
      parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      var mark = document.createElement("mark");
      mark.className = "hl";
      mark.textContent = match[0];
      parent.appendChild(mark);
      cursor = matcher.lastIndex;
    }
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function highlightedCell(value, query) {
    var cell = document.createElement("td");
    appendHighlightedText(cell, value, query);
    return cell;
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
        .empty();
      var noResultsIcon = document.createElement("i");
      noResultsIcon.className = "fa fa-search";
      noResultsIcon.setAttribute("aria-hidden", "true");
      var noResultsText = document.createTextNode(" No records found for ");
      var noResultsQuery = document.createElement("strong");
      noResultsQuery.textContent = '"' + $("#smartSearch").val().trim() + '"';
      $noRes[0].append(noResultsIcon, noResultsText, noResultsQuery);
      return;
    }

    $noRes.hide();
    matches.forEach(function (r) {
      var row = document.createElement("tr");
      [r.rno, r.sname, r.clg, r.brch, r.mmodel, r.imei, r.mclr, r.ename]
        .forEach(function (value) {
          row.appendChild(highlightedCell(value, q));
        });
      var dateCell = document.createElement("td");
      dateCell.textContent = r.date;
      row.appendChild(dateCell);
      var actionCell = document.createElement("td");
      var editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit";
      editButton.dataset.recordId = r.id;
      editButton.textContent = "Edit";
      actionCell.appendChild(editButton);
      row.appendChild(actionCell);
      $tbody[0].appendChild(row);
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

