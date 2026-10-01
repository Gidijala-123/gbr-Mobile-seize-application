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

$(function() {
$( '#dl-menu' ).dlmenu({
animationClasses :
{
 classin : 'dl-animate-in-3', classout : 'dl-animate-out-3'
}
});
});

//should be placed here only to run seconds in real time(dont save in click.js)
