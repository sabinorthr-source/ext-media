(function (root) {
  "use strict";
  function safeCell(value) {
    let text = String(value ?? "");
    // Excel/LibreOffice can evaluate formula-like cells even when CSV fields are quoted.
    // Prefix an apostrophe when the first non-whitespace/control character is dangerous.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function row(values) { return values.map(safeCell).join(","); }
  root.ExtMediaCsv = Object.freeze({ safeCell, row });
  if (typeof module !== "undefined" && module.exports) module.exports = root.ExtMediaCsv;
})(globalThis);
