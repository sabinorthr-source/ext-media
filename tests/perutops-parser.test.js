const test = require("node:test");
const assert = require("node:assert/strict");
require("../shared/perutops-parser.js");
const parser = globalThis.ExtMediaPeruTopsParser;

test("clasifica la miniatura servida por media.perutops.com como imagen", () => {
  assert.equal(parser.classifyUrl("https://media.perutops.com/attachments/2108/2108598-abcd.jpg?hash=xyz"), "image");
});

test("clasifica páginas de adjuntos XenForo aunque el slug no tenga extensión real", () => {
  assert.equal(parser.classifyUrl("https://perutops.com/foro-relax/attachments/img_0463-png.2175331/"), "attachment");
});

test("clasifica archivos de video de XenForo por extensión y nombre", () => {
  assert.equal(parser.classifyUrl("https://perutops.com/foro-relax/attachments/clip-mp4.3450155/"), "attachment");
  assert.equal(parser.classifyUrl("https://cdn.example.test/clip.mp4"), "video");
});

test("recupera el ID de adjunto desde el ancla DOM de XenForo", () => {
  const listItem = { querySelector(selector) { return selector.includes("u-anchorTarget") ? { id: "attachment-2175331" } : null; } };
  assert.equal(parser.attachmentId(null, listItem), "2175331");
});

test("recupera el ID de adjunto desde la URL si falta el ancla", () => {
  const anchor = { getAttribute() { return "/foro-relax/attachments/img_0463-png.2175331/"; } };
  assert.equal(parser.attachmentId(anchor, null), "2175331");
});

test("normaliza URLs relativas contra la página de PeruTops", () => {
  assert.equal(parser.absolute("/foro-relax/attachments/a.123/", "https://perutops.com/foro-relax/threads/t.1/"), "https://perutops.com/foro-relax/attachments/a.123/");
});


test("clasifica como imagen el enlace CDN .data cuyo parámetro a contiene el nombre original", () => {
  const url = "https://media.perutops.com/attachments/342/342253-abc.data?token=secreto%3D%3D&a=whatsapp-image-2018-12-13-at-12-22-57-pm-jpeg.407279";
  assert.equal(parser.classifyUrl(url), "image");
  assert.equal(parser.isForumAttachmentPage(url, "https://perutops.com/foro-relax/threads/t.414050/"), false);
});

test("solo trata como página interna de adjunto las rutas /attachments/ del mismo origen del foro", () => {
  const page = "https://perutops.com/foro-relax/threads/t.414050/";
  assert.equal(parser.isForumAttachmentPage("/foro-relax/attachments/photo-jpg.360605/", page), true);
  assert.equal(parser.isForumAttachmentPage("https://media.perutops.com/attachments/342/photo.data?token=x", page), false);
});
