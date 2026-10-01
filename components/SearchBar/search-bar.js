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
        '<td><button type="button" class="edit" data-record-id="' +
        r.id +
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

