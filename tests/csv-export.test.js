const test = require("node:test");
const assert = require("node:assert/strict");
const csv = require("../shared/csv-export.js");

test("escapa comillas y comas en campos CSV", () => {
  assert.equal(csv.safeCell('texto, con "comillas"'), '"texto, con ""comillas"""');
});

test("neutraliza fórmulas de hoja de cálculo incluso tras espacios", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "  =HYPERLINK(\"https://evil.test\")", "\t=1+1"]) {
    assert.ok(csv.safeCell(value).startsWith("\"'"), `Debe neutralizar ${JSON.stringify(value)}`);
  }
});

test("conserva valores ordinarios y booleanos", () => {
  assert.equal(csv.safeCell("PeruTops"), '"PeruTops"');
  assert.equal(csv.safeCell(false), '"false"');
});
