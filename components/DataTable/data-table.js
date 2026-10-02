function initLoadingSkeletons() {
  function setSkeletonVisibility(visible) {
    var skeletons = $(".dashboard-loading-skeleton, .table-loading-skeleton");
    if (visible) {
      skeletons.removeClass("is-hidden");
      return;
    }
    skeletons.addClass("is-hidden");
  }

  setSkeletonVisibility(true);
  $(window).on("load", function () {
    setSkeletonVisibility(false);
  });
  $(document).on(
    "draw.dt processing.dt",
    function (event, settings, processing) {
      if (event.type === "draw" || processing === false) {
        setSkeletonVisibility(false);
        return;
      }
      if (processing === true) {
        setSkeletonVisibility(true);
      }
    },
  );
  setTimeout(function () {
    setSkeletonVisibility(false);
  }, 450);
}

$(document).ready(function () {
  initLoadingSkeletons();

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

$(document).on("click", ".row-details-toggle", function (event) {
  event.preventDefault();
  event.stopPropagation();
  var button = this;
  var tableElement = $(button).closest("table")[0];
  if (!tableElement || !$.fn.dataTable.isDataTable(tableElement)) return;

  var table = $(tableElement).DataTable();
  var row = table.row($(button).closest("tr"));
  if (row.child.isShown()) {
    row.child.hide();
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Expand record details");
    button.title = "Expand record details";
    $(button).find(".fa").removeClass("fa-minus").addClass("fa-plus");
    return;
  }

  var rowNode = row.node();
  var headers = table.columns().header().toArray();
  var details = document.createElement("dl");
  details.className = "dt-child-details";
  Array.from(rowNode.cells).forEach(function (cell, index) {
    var label = headers[index] ? headers[index].textContent.trim() : "";
    if (!label || label.toLowerCase() === "action") return;
    var item = document.createElement("div");
    var term = document.createElement("dt");
    var value = document.createElement("dd");
    term.textContent = label;
    value.textContent = cell.textContent.trim() || "-";
    item.append(term, value);
    details.appendChild(item);
  });

  row.child($(details)).show();
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-label", "Collapse record details");
  button.title = "Collapse record details";
  $(button).find(".fa").removeClass("fa-plus").addClass("fa-minus");
});

$(document).on("keydown", ".dataTables_wrapper tbody", function (event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if ($(event.target).is("input, textarea, select, [contenteditable='true']"))
    return;

  var tableElement = $(this).closest("table")[0];
  if (!tableElement || !$.fn.dataTable.isDataTable(tableElement)) return;
  var table = $(tableElement).DataTable();
  var rows = table.rows({ page: "current" }).nodes().toArray();
  var currentRow = $(event.target).closest("tr")[0];
  var currentIndex = rows.indexOf(currentRow);
  if (currentIndex === -1) return;

  var nextIndex =
    event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= rows.length) return;
  var firstCell = rows[nextIndex].cells[0];
  if (!firstCell) return;
  event.preventDefault();
  firstCell.tabIndex = -1;
  firstCell.focus();
});

function resetTableStateButton() {
  return {
    text: "Reset table",
    className: "dt-button--reset-state",
    action: function (event, table) {
      table.state.clear();
      table.search("").columns().search("");
      table.order([]).page("first").draw();
    },
  };
}

function columnVisibilityButton() {
  return {
    text: "Columns",
    className: "dt-button--columns",
    action: function (event, table) {
      event.stopPropagation();
      var button = $(event.currentTarget);
      var container = $(table.table().container());
      var menu = container.find(".column-visibility-menu");
      if (menu.length) {
        button.attr("aria-expanded", "false");
        menu.toggle();
        return;
      }

      menu = $(
        '<div class="column-visibility-menu" role="group" aria-label="Toggle table columns"></div>',
      );
      table.columns().every(function (index) {
        var column = this;
        var title = $(column.header()).text().trim() || "Column " + (index + 1);
        var option = $('<label class="column-visibility-option"></label>');
        var checkbox = $('<input type="checkbox">').prop(
          "checked",
          column.visible(),
        );
        checkbox.on("change", function () {
          column.visible(this.checked, false);
          table.columns.adjust().draw(false);
        });
        option.append(checkbox, $("<span></span>").text(title));
        menu.append(option);
      });
      container.css("position", "relative").append(menu);
      menu.data("menu-trigger", button);
      button.attr("aria-expanded", "true");
    },
  };
}

function savedViewsButton() {
  return {
    text: "Views",
    className: "dt-button--saved-views",
    action: function (event, table) {
      event.stopPropagation();
      var button = $(event.currentTarget);
      var tableId = table.table().node().id;
      var storageKey = "gbr_saved_views_" + tableId;
      var container = $(table.table().container());
      var existingMenu = container.find(".saved-views-menu");
      if (existingMenu.length) {
        button.attr("aria-expanded", "false");
        existingMenu.toggle();
        return;
      }

      var menu = document.createElement("div");
      menu.className = "saved-views-menu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", "Saved table views");

      var form = document.createElement("form");
      form.className = "saved-view-form";
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.maxLength = 48;
      nameInput.required = true;
      nameInput.placeholder = "Name this view";
      nameInput.setAttribute("aria-label", "Saved view name");
      var saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.textContent = "Save current";
      form.append(nameInput, saveButton);

      var status = document.createElement("p");
      status.className = "saved-views-status";
      status.setAttribute("role", "status");
      var list = document.createElement("div");
      list.className = "saved-views-list";
      menu.append(form, status, list);

      function readViews() {
        try {
          var stored = JSON.parse(
            window.localStorage.getItem(storageKey) || "[]",
          );
          return Array.isArray(stored) ? stored : [];
        } catch (error) {
          return [];
        }
      }

      function writeViews(views) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(views));
          return true;
        } catch (error) {
          status.textContent = "Saved views are unavailable in this browser.";
          return false;
        }
      }

      function applyView(state) {
        var savedSearch = (state.search && state.search.search) || "";
        table.search(savedSearch);
        table.columns().every(function (index) {
          var savedColumn = state.columns && state.columns[index];
          if (!savedColumn) return;
          var columnSearch =
            (savedColumn.search && savedColumn.search.search) || "";
          this.search(columnSearch);
          if (typeof savedColumn.visible === "boolean") {
            this.visible(savedColumn.visible, false);
          }
        });
        table.order(Array.isArray(state.order) ? state.order : []);
        var pageLength = Number(state.length);
        if (Number.isFinite(pageLength) && pageLength > 0) {
          table.page.len(pageLength);
        }
        var activePageLength = table.page.len();
        var start = Number(state.start) || 0;
        table.page(Math.floor(start / activePageLength)).draw();
      }

      function renderViews() {
        list.replaceChildren();
        var views = readViews();
        if (!views.length) {
          status.textContent = "No saved views yet.";
          return;
        }
        status.textContent = "Saved in this browser";
        views.forEach(function (view, index) {
          var row = document.createElement("div");
          row.className = "saved-view-row";
          var loadButton = document.createElement("button");
          loadButton.type = "button";
          loadButton.className = "saved-view-load";
          loadButton.textContent = view.name;
          loadButton.addEventListener("click", function () {
            applyView(view.state || {});
            menu.remove();
          });
          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "saved-view-delete";
          deleteButton.textContent = "Delete";
          deleteButton.setAttribute(
            "aria-label",
            "Delete saved view " + view.name,
          );
          deleteButton.addEventListener("click", function () {
            var updatedViews = readViews();
            updatedViews.splice(index, 1);
            if (writeViews(updatedViews)) renderViews();
          });
          row.append(loadButton, deleteButton);
          list.appendChild(row);
        });
      }

      form.addEventListener("submit", function (submitEvent) {
        submitEvent.preventDefault();
        var name = nameInput.value.trim();
        if (!name) return;
        var views = readViews().filter(function (view) {
          return (
            String(view.name).toLocaleLowerCase() !== name.toLocaleLowerCase()
          );
        });
        views.unshift({
          name: name,
          state: JSON.parse(JSON.stringify(table.state())),
        });
        if (writeViews(views.slice(0, 10))) {
          nameInput.value = "";
          renderViews();
        }
      });

      renderViews();
      container.css("position", "relative").append(menu);
      menu.data("menu-trigger", button);
      button.attr("aria-expanded", "true");
      nameInput.focus();
    },
  };
}

function exportTemplatesButton() {
  return {
    text: "Templates",
    className: "dt-button--export-templates",
    action: function (event, table) {
      event.stopPropagation();
      var button = $(event.currentTarget);
      var tableId = table.table().node().id;
      var storageKey = "gbr_export_templates_" + tableId;
      var container = $(table.table().container());
      var existingMenu = container.find(".export-templates-menu");
      if (existingMenu.length) {
        button.attr("aria-expanded", "false");
        existingMenu.toggle();
        return;
      }

      var menu = document.createElement("div");
      menu.className = "export-templates-menu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", "Saved export templates");

      var form = document.createElement("form");
      form.className = "export-template-form";
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.maxLength = 48;
      nameInput.placeholder = "Name this export";
      nameInput.setAttribute("aria-label", "Saved export template name");
      var saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.textContent = "Save template";
      form.append(nameInput, saveButton);

      var status = document.createElement("p");
      status.className = "saved-views-status";
      status.setAttribute("role", "status");
      var list = document.createElement("div");
      list.className = "saved-views-list";
      menu.append(form, status, list);

      function readTemplates() {
        try {
          var stored = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
          return Array.isArray(stored) ? stored : [];
        } catch (error) {
          return [];
        }
      }

      function writeTemplates(templates) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(templates));
          return true;
        } catch (error) {
          status.textContent = "Export templates are unavailable in this browser.";
          return false;
        }
      }

      function exportTemplate(template) {
        var headers = table.columns().header().toArray();
        var visibleIndexes = Array.isArray(template.state && template.state.visibleIndexes)
          ? template.state.visibleIndexes
          : table.columns(":visible").indexes().toArray();
        var csvRows = [];
        csvRows.push(
          visibleIndexes
            .map(function (index) {
              return '"' + $(headers[index]).text().trim().replace(/"/g, '""') + '"';
            })
            .join(","),
        );

        table.rows({ search: "applied", page: "all" }).data().toArray().forEach(function (row) {
          csvRows.push(
            visibleIndexes
              .map(function (index) {
                var value = row[index];
                if (value == null) return '""';
                return '"' + String(value).replace(/"/g, '""') + '"';
              })
              .join(","),
          );
        });

        var blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = (template.name || "gbr-export") + ".csv";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        menu.remove();
      }

      function renderTemplates() {
        list.replaceChildren();
        var templates = readTemplates();
        if (!templates.length) {
          status.textContent = "No saved export templates yet.";
          return;
        }

        status.textContent = "Saved in this browser";
        templates.forEach(function (template, index) {
          var row = document.createElement("div");
          row.className = "export-template-row";

          var loadButton = document.createElement("button");
          loadButton.type = "button";
          loadButton.textContent = template.name;
          loadButton.addEventListener("click", function () {
            exportTemplate(template);
          });

          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.textContent = "Delete";
          deleteButton.addEventListener("click", function () {
            var updated = readTemplates();
            updated.splice(index, 1);
            if (writeTemplates(updated)) renderTemplates();
          });

          row.append(loadButton, deleteButton);
          list.appendChild(row);
        });
      }

      form.addEventListener("submit", function (submitEvent) {
        submitEvent.preventDefault();
        var name = nameInput.value.trim();
        if (!name) return;

        var templates = readTemplates().filter(function (template) {
          return String(template.name).toLocaleLowerCase() !== name.toLocaleLowerCase();
        });

        templates.unshift({
          name: name,
          state: {
            visibleIndexes: table.columns(":visible").indexes().toArray(),
          },
        });

        if (writeTemplates(templates.slice(0, 10))) {
          nameInput.value = "";
          renderTemplates();
        }
      });

      renderTemplates();
      container.css("position", "relative").append(menu);
      menu.data("menu-trigger", button);
      button.attr("aria-expanded", "true");
      nameInput.focus();
    },
  };
}

function configureTableEmptyState(selector) {
  var $table = $(selector);
  if (!$table.length) return;

  var panel = document.createElement("section");
  panel.className = "table-empty-state";
  panel.hidden = true;
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  var icon = document.createElement("i");
  icon.className = "fa fa-inbox";
  icon.setAttribute("aria-hidden", "true");
  var heading = document.createElement("h3");
  var message = document.createElement("p");
  var action = document.createElement("button");
  action.type = "button";
  panel.append(icon, heading, message, action);
  $table.after(panel);

  function refresh() {
    var table = $table.DataTable();
    var visibleRows = table.rows({ search: "applied" }).count();
    var totalRows = table.rows().count();
    var empty = visibleRows === 0;
    panel.hidden = !empty;
    $table.toggle(!empty);
    icon.className = "fa " + (totalRows ? "fa-search" : "fa-inbox");
    heading.textContent = totalRows ? "No matching records" : "No records yet";
    message.textContent = totalRows
      ? "Try a different search or clear the active filters."
      : "Start by adding the first device intake.";
    action.textContent = totalRows ? "Clear filters" : "Add first record";
    action.onclick = function () {
      if (totalRows) {
        table.search("").columns().search("").draw();
        return;
      }
      $('a[data-toggle="tab"][href="#dboard"]').tab("show");
      window.setTimeout(function () {
        var firstField = document.getElementById("dat2");
        if (firstField) firstField.focus();
      }, 0);
    };
  }

  $table.on("draw.dt", refresh);
  refresh();
}

function closeTableMenus(triggerButton) {
  $(".column-visibility-menu, .saved-views-menu, .export-templates-menu").each(function () {
    var menu = $(this);
    var opener = menu.data("menu-trigger");
    menu.remove();
    if (triggerButton && triggerButton.length) {
      triggerButton.attr("aria-expanded", "false");
      triggerButton.focus();
    } else if (opener && opener.length && opener.is(":visible")) {
      opener.attr("aria-expanded", "false");
      opener.focus();
    }
  });
}

$(document).on("ready", function () {
  $(".dt-button--columns, .dt-button--saved-views, .dt-button--export-templates").attr("aria-expanded", "false");
});

$(document).on("click.columnVisibility", function (event) {
  if (
    !$(event.target).closest(
      ".column-visibility-menu, .dt-button--columns, .saved-views-menu, .dt-button--saved-views, .export-templates-menu, .dt-button--export-templates",
    ).length
  ) {
    closeTableMenus();
  }
});

$(document).on("keydown", function (event) {
  if (event.key !== "Escape") return;

  var visibleMenus = $(
    ".column-visibility-menu, .saved-views-menu, .export-templates-menu",
  );
  if (!visibleMenus.length) return;

  closeTableMenus();
});

$(document).ready(function () {
  $("#example2").dataTable({
    dom: "Bfrtip",
    pageLength: 8,
    stateSave: true,
    stateDuration: 0,
    responsive: true,
    autoWidth: false,
    scrollX: true,
    buttons: [
      {
        extend: "copy",
        title: "Report",
      },
      {
        extend: "csvHtml5",
        title: "Report",
      },
      {
        extend: "excelHtml5",
        title: "Report",
      },
      {
        extend: "pdfHtml5",
        title: "Report",
      },
      {
        extend: "print",
        title: "Report",
      },
      columnVisibilityButton(),
      savedViewsButton(),
      exportTemplatesButton(),
      resetTableStateButton(),
    ],
  });
  configureTableEmptyState("#example2");
});
$(document).ready(function () {
  $("#example3").dataTable({
    dom: "Bfrtip",
    pageLength: 8,
    stateSave: true,
    stateDuration: 0,
    responsive: true,
    autoWidth: false,
    scrollX: true,
    buttons: [
      {
        extend: "copy",
        title: "Report",
      },
      {
        extend: "csvHtml5",
        title: "Report",
      },
      {
        extend: "excelHtml5",
        title: "Report",
      },
      {
        extend: "pdfHtml5",
        title: "Report",
      },
      {
        extend: "print",
        title: "Report",
      },
      columnVisibilityButton(),
      savedViewsButton(),
      exportTemplatesButton(),
      resetTableStateButton(),
    ],
  });
  configureTableEmptyState("#example3");
});
$(document).ready(function () {
  $("#example4").dataTable({
    dom: "Bfrtip",
    pageLength: 8,
    stateSave: true,
    stateDuration: 0,
    responsive: true,
    autoWidth: false,
    scrollX: true,
    buttons: [
      {
        extend: "copy",
        title: "Report",
      },
      {
        extend: "csvHtml5",
        title: "Report",
      },
      {
        extend: "excelHtml5",
        title: "Report",
      },
      {
        extend: "pdfHtml5",
        title: "Report",
      },
      {
        extend: "print",
        title: "Report",
      },
      columnVisibilityButton(),
      savedViewsButton(),
      exportTemplatesButton(),
      resetTableStateButton(),
    ],
  });
  configureTableEmptyState("#example4");
});
$(document).ready(function () {
  $("#auditTable").dataTable({
    dom: "Bfrtip",
    pageLength: 8,
    stateSave: true,
    stateDuration: 0,
    responsive: true,
    autoWidth: false,
    scrollX: true,
    buttons: [
      { extend: "copy", title: "Record Activity" },
      { extend: "csvHtml5", title: "Record Activity" },
      { extend: "excelHtml5", title: "Record Activity" },
      { extend: "pdfHtml5", title: "Record Activity" },
      { extend: "print", title: "Record Activity" },
      columnVisibilityButton(),
      savedViewsButton(),
      exportTemplatesButton(),
      resetTableStateButton(),
    ],
  });
  configureTableEmptyState("#auditTable");
});
$(document).ready(function () {
  $("#recycleBinTable").dataTable({
    dom: "Bfrtip",
    pageLength: 8,
    stateSave: true,
    stateDuration: 0,
    responsive: true,
    autoWidth: false,
    scrollX: true,
    order: [[0, "desc"]],
    buttons: [
      columnVisibilityButton(),
      savedViewsButton(),
      exportTemplatesButton(),
      resetTableStateButton(),
    ],
  });
  configureTableEmptyState("#recycleBinTable");
});
//these 2 script links must be placed at bottom only, else fails to work
