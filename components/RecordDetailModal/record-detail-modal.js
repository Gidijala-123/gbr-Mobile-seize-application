$(document).ready(function () {
  var lastFocusedTrigger = null;

  function closeRecordDetailModal() {
    var $modal = $("#record-detail-modal");
    if (!$modal.length) return;

    $modal.fadeOut(180, function () {
      if (
        lastFocusedTrigger &&
        typeof lastFocusedTrigger.focus === "function"
      ) {
        lastFocusedTrigger.focus();
      }
      lastFocusedTrigger = null;
    });
  }

  function getRowEntries($row) {
    var $table = $row.closest("table");
    if (!$table.length) return [];

    var headers = $table
      .find("thead th")
      .toArray()
      .map(function (th) {
        return $(th).text().trim();
      });

    var cells = $row.find("td").toArray();
    var entries = [];
    headers.forEach(function (label, index) {
      if (!label || label.toLowerCase() === "action") return;
      var value = cells[index] ? $(cells[index]).text().trim() : "";
      entries.push({
        label: label,
        value: value || "—",
      });
    });

    return entries;
  }

  function updateHistoryList(selector, items) {
    var $list = $(selector);
    if (!$list.length) return;
    $list.empty();

    if (!items.length) {
      $list.append("<li>No information available.</li>");
      return;
    }

    items.forEach(function (item) {
      var $item = $("<li></li>");
      if (item.label && item.value) {
        $item.html(
          "<strong>" +
            item.label +
            ":</strong> " +
            item.value,
        );
      } else {
        $item.text(item.value || item.label || "No information available.");
      }
      $list.append($item);
    });
  }

  function buildStatusHistory($row) {
    var entries = [];
    var rowEntries = getRowEntries($row);
    var statusEntry = rowEntries.find(function (entry) {
      return entry.label && entry.label.toLowerCase() === "status";
    });

    if (statusEntry) {
      entries.push({
        label: "Current status",
        value: statusEntry.value,
      });
    }

    entries.push({
      label: "Status audit",
      value: "Timeline updated from the active record lifecycle.",
    });

    var dateEntry = rowEntries.find(function (entry) {
      return entry.label && entry.label.toLowerCase() === "date";
    });
    if (dateEntry) {
      entries.push({
        label: "Last seen",
        value: dateEntry.value,
      });
    }

    return entries;
  }

  function buildReturnHistory($row) {
    var entries = [];
    var rowEntries = getRowEntries($row);
    var returnMeta = [
      "returnedAt",
      "returnedBy",
      "returnSignature",
      "returnNotes",
    ].find(function (field) {
      var $meta = $row.filter('[data-' + field + ']');
      return $meta.length > 0;
    });

    var rowValues = {};
    rowEntries.forEach(function (entry) {
      rowValues[entry.label.toLowerCase()] = entry.value;
    });

    if (rowValues.returnedat || rowValues.returnedby || rowValues.returnnotes) {
      if (rowValues.returnedat) {
        entries.push({ label: "Returned at", value: rowValues.returnedat });
      }
      if (rowValues.returnedby) {
        entries.push({ label: "Returned by", value: rowValues.returnedby });
      }
      if (rowValues.returnnotes) {
        entries.push({ label: "Notes", value: rowValues.returnnotes });
      }
    } else {
      entries.push({
        label: "Return record",
        value: "No return history recorded for this device.",
      });
    }

    if (!entries.length) {
      entries.push({
        label: "Return record",
        value: "Pending review.",
      });
    }

    return entries;
  }

  function parseDevicePhotoList(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue.filter(Boolean).map(String);
    }

    if (typeof rawValue !== "string") return [];
    var trimmed = rawValue.trim();
    if (!trimmed) return [];

    try {
      var parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map(String);
      }
      if (typeof parsed === "string" && parsed.trim()) {
        return [parsed.trim()];
      }
    } catch (error) {
      // Fall back to a simple comma-separated parse for pre-JSON values.
    }

    return trimmed
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean)
      .filter(function (part) {
        return /^(data:image\/[a-zA-Z0-9.+-]+;base64,|https?:\/\/|\/uploads\/|\/images\/|\/components\/)/i.test(part);
      });
  }

  function updateDevicePhotoGallery($row) {
    var $gallery = $("#record-detail-photo-gallery");
    if (!$gallery.length) return;

    var rawPhotos = $row.attr("data-device-photos") || ($row.data("devicePhotos") || "");
    var photos = parseDevicePhotoList(rawPhotos);

    $gallery.empty();

    if (!photos.length) {
      $gallery.append('<div class="record-detail-photo-empty">No device photos stored for this record.</div>');
      return;
    }

    photos.slice(0, 6).forEach(function (photoSrc) {
      var $figure = $('<figure class="record-detail-photo-item"></figure>');
      var $img = $('<img alt="Device photo preview" />');
      $img.attr("src", photoSrc);
      $figure.append($img);
      $gallery.append($figure);
    });
  }

  function openRecordDetailModal($row) {
    var $modal = $("#record-detail-modal");
    var $list = $("#record-detail-list");
    if (!$modal.length || !$list.length || !$row || !$row.length) return;

    lastFocusedTrigger = document.activeElement;
    var detailEntries = getRowEntries($row);
    $list.empty();

    detailEntries.forEach(function (entry) {
      var item = document.createElement("div");
      item.className = "record-detail-item";
      var label = document.createElement("dt");
      var value = document.createElement("dd");
      label.textContent = entry.label;
      value.textContent = entry.value;
      item.appendChild(label);
      item.appendChild(value);
      $list[0].appendChild(item);
    });

    updateHistoryList("#record-detail-status-history", buildStatusHistory($row));
    updateHistoryList("#record-detail-return-history", buildReturnHistory($row));
    updateDevicePhotoGallery($row);

    var recordId = $row.find("td").eq(2).text().trim() || "—";
    var rollNumber = $row.find("td").eq(3).text().trim() || "—";
    $("#record-detail-id").text(recordId);
    $("#record-detail-subtitle").text(rollNumber);
    $modal.fadeIn(180);
    $("#record-detail-close").trigger("focus");
  }

  $(document).on("click", ".dataTable tbody tr", function (event) {
    if (
      $(event.target).closest(
        "button, a, input, select, textarea, label, .row-details-toggle, .del-btn, .return-btn",
      ).length
    ) {
      return;
    }

    if (!$(this).closest("table").length) return;
    openRecordDetailModal($(this));
  });

  $("#record-detail-close, #record-detail-dismiss").on(
    "click",
    closeRecordDetailModal,
  );

  $("#record-detail-modal").on("click", function (event) {
    if (event.target === this) closeRecordDetailModal();
  });

  $(document).on("keydown", function (event) {
    if (!$("#record-detail-modal").is(":visible")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeRecordDetailModal();
      return;
    }

    if (event.key !== "Tab") return;

    var focusable = $("#record-detail-modal")
      .find(
        "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )
      .filter(":visible");

    if (!focusable.length) {
      event.preventDefault();
      $("#record-detail-close").trigger("focus");
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
