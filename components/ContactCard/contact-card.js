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
    var visibleStaff = new Set();
    var allStaff = new Set();

    $("#staffDirectoryGrid .staff-profile").each(function () {
      var matches = (this.getAttribute("data-search") || "").indexOf(query) !== -1;
      this.hidden = !matches;
      var employeeKey = this.getAttribute("data-employee-key");
      if (employeeKey) {
        allStaff.add(employeeKey);
        if (matches) visibleStaff.add(employeeKey);
      }
    });

    $("#staffDirectoryStatus").text(
      "Showing " + visibleStaff.size + " of " + allStaff.size + " staff",
    );
    $("#staffDirectoryGrid .staff-category-group").each(function () {
      this.hidden = !this.querySelector(".staff-profile:not([hidden])");
    });
    $("#staffDirectoryEmpty").prop("hidden", visibleStaff.size > 0);
  });
});

$(document).ready(function () {
  var staffByEmployee = new Map();
  var table = $.fn.dataTable && $.fn.dataTable.isDataTable("#example2")
    ? $("#example2").DataTable()
    : null;
  var rows = table
    ? table.rows({ search: "none" }).nodes().toArray()
    : Array.from(document.querySelectorAll("#example2 tbody tr"));
  var grid = document.getElementById("staffDirectoryGrid");

  if (!grid || !rows.length) return;

  function cellText(row, index) {
    return row.cells[index] ? row.cells[index].textContent.trim() : "";
  }

  function normalized(value) {
    return value.trim().toLocaleLowerCase();
  }

  rows.forEach(function (row) {
    var name = cellText(row, 16);
    var employeeId = cellText(row, 18);
    var phone = cellText(row, 17);
    if (!name && !employeeId) return;

    var key = normalized(employeeId || name);
    var member = staffByEmployee.get(key);
    if (!member) {
      member = {
        key: key,
        name: name || "Name not recorded",
        employeeId: employeeId,
        phones: new Set(),
        assignments: new Map(),
      };
      staffByEmployee.set(key, member);
    }
    if (!member.employeeId && employeeId) member.employeeId = employeeId;
    if (phone) member.phones.add(phone);

    var assignment = {
      college: cellText(row, 5),
      branch: cellText(row, 6),
      year: cellText(row, 7),
      section: cellText(row, 8),
    };
    var assignmentKey = [
      assignment.college,
      assignment.branch,
      assignment.year,
      assignment.section,
    ].map(normalized).join("|");
    member.assignments.set(assignmentKey, assignment);
  });

  var staff = Array.from(staffByEmployee.values()).sort(function (left, right) {
    return left.name.localeCompare(right.name);
  });
  var verifiedGenderByName = new Map([
    ["prof. s. padmaja", "female"],
    ["prof. m. sunitha", "female"],
    ["prof. r. kiranmai", "female"],
    ["dr. n. chandrasekhar", "male"],
    ["prof. l. satyanarayana", "male"],
    ["dr. a. venkataramana", "male"],
    ["prof. c. bhaskara", "male"],
    ["dr. v. nagaraju", "male"],
    ["prof. k. srinivasa", "male"],
    ["dr. p. ramakrishna", "male"],
    ["dr. b. sudhakar", "male"],
    ["dr. t. venkateswara", "male"],
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
  staff.forEach(function (member) {
    var gender = verifiedGenderByName.get(normalized(member.name));
    if (gender) {
      member.portrait = portraits[gender][portraitIndexes[gender]++] || null;
    }
    member.initials = member.name
      .replace(/^(dr|prof)\.\s*/i, "")
      .replace(/\./g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map(function (part) { return part[0]; })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  });
  var groups = new Map();

  staff.forEach(function (member) {
    if (!member.assignments.size) {
      member.assignments.set("|||", {
        college: "",
        branch: "",
        year: "",
        section: "",
      });
    }
    member.assignments.forEach(function (assignment, assignmentKey) {
      var group = groups.get(assignmentKey);
      if (!group) {
        group = { assignment: assignment, members: [] };
        groups.set(assignmentKey, group);
      }
      group.members.push(member);
    });
  });

  Array.from(groups.values()).sort(function (left, right) {
    var leftName = [left.assignment.college, left.assignment.branch, left.assignment.year, left.assignment.section].join(" ");
    var rightName = [right.assignment.college, right.assignment.branch, right.assignment.year, right.assignment.section].join(" ");
    return leftName.localeCompare(rightName);
  }).forEach(function (group) {
    var section = document.createElement("section");
    section.className = "staff-category-group";
    var heading = document.createElement("h3");
    var assignment = group.assignment;
    heading.textContent = [
      assignment.college || "College not recorded",
      assignment.branch || "Program not recorded",
      assignment.year ? "Year " + assignment.year : "Year not recorded",
      assignment.section ? "Section " + assignment.section : "Section not recorded",
    ].join(" · ");
    var staffGrid = document.createElement("div");
    staffGrid.className = "staff-directory-grid";

    group.members.sort(function (left, right) {
      return left.name.localeCompare(right.name);
    }).forEach(function (member) {
      var card = document.createElement("article");
      card.className = "staff-profile";
      card.dataset.employeeKey = member.key;
      card.dataset.search = [
        member.name,
        member.employeeId,
        Array.from(member.phones).join(" "),
        heading.textContent,
      ].join(" ").toLocaleLowerCase();

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
      role.textContent = "Staff";
      var name = document.createElement("h3");
      name.textContent = member.name;
      body.append(role, name);

      if (member.employeeId) {
        var id = document.createElement("p");
        id.className = "staff-profile-id";
        var idIcon = document.createElement("i");
        idIcon.className = "fa fa-id-card";
        idIcon.setAttribute("aria-hidden", "true");
        var idText = document.createElement("span");
        idText.textContent = member.employeeId;
        id.append(idIcon, idText);
        body.appendChild(id);
      }

      member.phones.forEach(function (phone) {
        var phoneLine = document.createElement("p");
        phoneLine.className = "staff-profile-phone";
        var phoneIcon = document.createElement("i");
        phoneIcon.className = "fa fa-phone";
        phoneIcon.setAttribute("aria-hidden", "true");
        var phoneLink = document.createElement("a");
        phoneLink.href = "tel:" + phone.replace(/[^+\d]/g, "");
        phoneLink.textContent = phone;
        phoneLine.append(phoneIcon, phoneLink);
        body.appendChild(phoneLine);
      });

      card.append(photo, body);
      staffGrid.appendChild(card);
    });

    section.append(heading, staffGrid);
    grid.appendChild(section);
  });

  var status = document.getElementById("staffDirectoryStatus");
  var total = document.getElementById("staffDirectoryTotal");
  var empty = document.getElementById("staffDirectoryEmpty");
  if (status) status.textContent = "Showing " + staff.length + " staff";
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
