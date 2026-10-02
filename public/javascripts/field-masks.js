(function (root) {
  function digitsOnly(value) {
    return String(value == null ? "" : value)
      .replace(/[^\d]/g, "")
      .slice(0, 15);
  }

  function formatPhoneInput(value) {
    const digits = digitsOnly(value).slice(-10);
    if (!digits) return "";
    const visible = digits.length <= 5 ? digits : digits.slice(0, 5) + " " + digits.slice(5);
    return "+91 " + visible;
  }

  function formatImeiInput(value) {
    const digits = digitsOnly(value).slice(0, 15);
    if (!digits) return "";
    const groups = [];
    for (let index = 0; index < digits.length; index += 4) {
      const group = digits.slice(index, index + 4);
      if (group) groups.push(group);
    }
    return groups.join("-").slice(0, 19);
  }

  function formatRollNoInput(value) {
    const cleaned = String(value == null ? "" : value)
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 12)
      .toUpperCase();
    if (!cleaned) return "";
    if (cleaned.length <= 4) return cleaned;
    if (cleaned.length <= 8) return cleaned.slice(0, 4) + "-" + cleaned.slice(4);
    return cleaned.slice(0, 4) + "-" + cleaned.slice(4, 8) + "-" + cleaned.slice(8);
  }

  function normalizeFormElementValue(element) {
    if (!element || !element.name) return undefined;
    const tag = (element.tagName || "").toUpperCase();
    const type = (element.type || "").toLowerCase();

    if (type === "checkbox" || type === "radio") {
      return element.checked ? element.value : "";
    }

    if (tag === "SELECT" && element.multiple) {
      return Array.from(element.selectedOptions || []).map((option) => option.value);
    }

    return element.value == null ? "" : String(element.value);
  }

  function captureIntakeFormState(form) {
    const target = form && form.jquery ? form[0] : form;
    if (!target || !target.elements) return {};

    const snapshot = {};
    Array.from(target.elements).forEach((element) => {
      if (!element || !element.name) return;
      const name = String(element.name);
      const type = (element.type || "").toLowerCase();
      if (["submit", "button", "reset", "file", "hidden"].includes(type)) return;
      const value = normalizeFormElementValue(element);
      if (value !== undefined) snapshot[name] = value;
    });

    return snapshot;
  }

  function restoreIntakeFormState(form, snapshot) {
    const target = form && form.jquery ? form[0] : form;
    if (!target || !target.elements || !snapshot) return false;

    Array.from(target.elements).forEach((element) => {
      if (!element || !element.name) return;
      const type = (element.type || "").toLowerCase();
      if (["submit", "button", "reset", "file", "hidden"].includes(type)) return;

      if (Object.prototype.hasOwnProperty.call(snapshot, element.name)) {
        const value = snapshot[element.name];
        if (type === "checkbox" || type === "radio") {
          element.checked = String(value) === String(element.value);
        } else if ((element.tagName || "").toUpperCase() === "SELECT" && element.multiple) {
          const selected = Array.isArray(value) ? value : [value];
          Array.from(element.options).forEach((option) => {
            option.selected = selected.includes(option.value);
          });
        } else {
          element.value = value;
        }
      }
    });

    return true;
  }

  function captureRecentIntakeValues(form, fieldNames) {
    const target = form && form.jquery ? form[0] : form;
    if (!target || !target.elements || !Array.isArray(fieldNames)) return {};
    const allowed = new Set(fieldNames);
    const values = {};

    Array.from(target.elements).forEach((element) => {
      if (!element || !allowed.has(element.name)) return;
      const value = normalizeFormElementValue(element);
      if (value !== undefined) values[element.name] = String(value).trim();
    });

    return values;
  }

  function restoreRecentIntakeValues(form, values) {
    const target = form && form.jquery ? form[0] : form;
    if (!target || !target.elements || !values) return false;

    Array.from(target.elements).forEach((element) => {
      if (!element || !element.name || !Object.prototype.hasOwnProperty.call(values, element.name)) return;
      const currentValue = String(element.value == null ? "" : element.value).trim();
      const isDefaultSelect =
        (element.tagName || "").toUpperCase() === "SELECT" &&
        element.selectedIndex === 0;
      if (!currentValue || isDefaultSelect) element.value = values[element.name];
    });

    return true;
  }

  const api = {
    digitsOnly,
    formatPhoneInput,
    formatImeiInput,
    formatRollNoInput,
    captureIntakeFormState,
    restoreIntakeFormState,
    captureRecentIntakeValues,
    restoreRecentIntakeValues,
  };

  root.GBRFieldMasks = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
