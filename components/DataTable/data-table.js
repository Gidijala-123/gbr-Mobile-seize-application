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


$(document).ready(function () {
$('#example2').dataTable({
  dom: 'Bfrtip',
  pageLength: 8,
  buttons: [
      {
          extend: 'copy',
          title: 'Report'
      },
      {
          extend: 'csvHtml5',
          title: 'Report'
      },
      {
          extend: 'excelHtml5',
          title: 'Report'
      },
      {
          extend: 'pdfHtml5',
          title: 'Report'
      },
      {
          extend: 'print',
          title: 'Report'
      }
  ]
});
});
$(document).ready(function () {
$('#example3').dataTable({
  dom: 'Bfrtip',
  pageLength: 8,
  buttons: [
      {
          extend: 'copy',
          title: 'Report'
      },
      {
          extend: 'csvHtml5',
          title: 'Report'
      },
      {
          extend: 'excelHtml5',
          title: 'Report'
      },
      {
          extend: 'pdfHtml5',
          title: 'Report'
      },
      {
          extend: 'print',
          title: 'Report'
      }
  ]
});
});
$(document).ready(function () {
$('#example4').dataTable({
  dom: 'Bfrtip',
  pageLength: 8,
  buttons: [
      {
          extend: 'copy',
          title: 'Report'
      },
      {
          extend: 'csvHtml5',
          title: 'Report'
      },
      {
          extend: 'excelHtml5',
          title: 'Report'
      },
      {
          extend: 'pdfHtml5',
          title: 'Report'
      },
      {
          extend: 'print',
          title: 'Report'
      }
  ]
});
});
$(document).ready(function () {
  $('#auditTable').dataTable({
    dom: 'Bfrtip',
    pageLength: 8,
    buttons: [
      { extend: 'copy', title: 'Record Activity' },
      { extend: 'csvHtml5', title: 'Record Activity' },
      { extend: 'excelHtml5', title: 'Record Activity' },
      { extend: 'pdfHtml5', title: 'Record Activity' },
      { extend: 'print', title: 'Record Activity' }
    ]
  });
});
     //these 2 script links must be placed at bottom only, else fails to work
