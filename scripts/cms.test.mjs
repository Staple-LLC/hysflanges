import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  onboarding,
  bindings,
  renderPage,
  validateSnapshot,
  publicImage,
  readSection,
  buildSite,
} from "./cms-build.mjs";
const initial = JSON.parse(
  readFileSync("src/cms/website-content.json", "utf8"),
);
const fresh = () => structuredClone(initial);
const html = (file) => readFileSync("dist/" + file, "utf8");
test("imports every active page, six products and six technical sheets with packaged images", () => {
  assert.equal(onboarding.sections.length, 12);
  assert.equal(
    new Set(bindings.filter((b) => b.file).map((b) => b.file)).size,
    10,
  );
  assert.equal(
    initial.pages["/our-products/flanges"].flange_products.items.length,
    5,
  );
  assert.equal(
    initial.pages["/our-products/fittings"].fitting_products.items.length,
    1,
  );
  assert.equal(
    initial.pages["/catalogue/fittings"].fitting_catalogue.documents.length,
    6,
  );
  for (const asset of Object.keys(
    JSON.parse(readFileSync("src/cms/asset-manifest.json", "utf8")),
  ))
    assert.ok(existsSync("dist" + asset));
  validateSnapshot(initial);
});
test("initial rollout preserves all ten HTML files byte for byte", () => {
  for (const file of new Set(bindings.filter((b) => b.file).map((b) => b.file)))
    assert.equal(renderPage(html(file), file, initial), html(file));
});
test("renders homepage text and SEO changes without injecting HTML", () => {
  const s = fresh();
  s.pages["/"].home.headings.item1 = "<script>alert(1)</script>";
  s.pages["/"].home.seo.title = "Updated company title";
  const $ = load(renderPage(html("index.html"), "index.html", s));
  assert.equal($("title").text(), "Updated company title");
  assert.equal(
    $(".entry-content h2").first().text(),
    "<script>alert(1)</script>",
  );
  assert.equal(
    $("script").filter((i, e) => $(e).text() === "alert(1)").length,
    0,
  );
});
test("adds products with specifications and respects private/empty collections", () => {
  const s = fresh(),
    items = s.pages["/our-products/flanges"].flange_products.items;
  items.push({
    ...items[0],
    id: "70000000-0000-0000-0000-000000000001",
    title: "New flange",
    specifications: [{ label: "Size", value: "DN100" }],
  });
  items[1].status = "draft";
  let $ = load(
    renderPage(
      html("our-products/flanges/index.html"),
      "our-products/flanges/index.html",
      s,
    ),
  );
  assert.equal($(".hys-product-detail").length, 5);
  assert.equal($(".hys-product-detail h2").last().text(), "New flange");
  assert.equal($(".hys-product-detail td").last().text(), "DN100");
  s.pages["/our-products/flanges"].flange_products.items = [];
  $ = load(
    renderPage(
      html("our-products/flanges/index.html"),
      "our-products/flanges/index.html",
      s,
    ),
  );
  assert.equal($(".hys-product-detail").length, 0);
});
test("technical sheet URLs update the download and flipbook together, including additions", () => {
  const s = fresh(),
    docs = s.pages["/catalogue/fittings"].fitting_catalogue.documents;
  docs[0].url = "https://example.com/new-sheet.pdf";
  docs[0].title = "Updated sheet";
  docs.push({
    ...docs[0],
    id: "70000000-0000-0000-0000-000000000002",
    title: "Extra sheet",
  });
  const $ = load(
    renderPage(
      html("catalogue/fittings/index.html"),
      "catalogue/fittings/index.html",
      s,
    ),
  );
  assert.equal($(".hys-flipbook-item").length, 7);
  assert.equal($(".hys-flipbook-item h2").first().text(), "Updated sheet");
  assert.equal(
    $(".hys-pdf-download").first().attr("href"),
    "https://example.com/new-sheet.pdf",
  );
  assert.ok(
    $(".df-shortcode-script")
      .first()
      .text()
      .includes("https://example.com/new-sheet.pdf"),
  );
});
test("category changes reach homepage, product list and catalogue without restoring removed cards", () => {
  const s = fresh();
  s.pages["/shared"].product_categories.items[0].title = "Precision flanges";
  s.pages["/shared"].product_categories.items.pop();
  for (const file of [
    "index.html",
    "our-products/index.html",
    "catalogue/index.html",
  ]) {
    const $ = load(renderPage(html(file), file, s));
    assert.equal($(".category-card").length, 1);
    assert.equal($(".category-card h2").text(), "Precision flanges");
  }
  s.pages["/shared"].product_categories.items = [];
  const $ = load(renderPage(html("index.html"), "index.html", s));
  assert.equal($(".category-card").length, 0);
});
test("uploaded images resolve to published media and remove outdated responsive sources", () => {
  const s = fresh();
  const group = s.pages["/catalogue/flanges"].flange_catalogue.images.image1;
  group.image =
    "media:" + onboarding.websiteId + "/70000000-0000-0000-0000-000000000003";
  group.imageAlt = "New technical diagram";
  const $ = load(
    renderPage(
      html("catalogue/flanges/index.html"),
      "catalogue/flanges/index.html",
      s,
    ),
  );
  assert.ok(
    $(".entry-content img")
      .first()
      .attr("src")
      .includes("/website-published-media/" + onboarding.websiteId),
  );
  assert.equal(
    $(".entry-content img").first().attr("alt"),
    "New technical diagram",
  );
  assert.equal($(".entry-content img").first().attr("srcset"), undefined);
});
test("company details change consistently across contact page and footer", () => {
  const s = fresh(),
    c = s.pages["/shared"].company_details;
  c.manufacturer = "New company";
  c.manufacturerAddress = "New address\nSeoul";
  c.email1 = "new@example.com";
  c.phone = "+60 3 1234 5678";
  c.fax = "+60 3 1111 2222";
  const $ = load(
    renderPage(html("contact-us/index.html"), "contact-us/index.html", s),
  );
  assert.equal($(".hs-footer-manufacturer h2").text(), "New company");
  assert.equal($(".hys-contact-card h3").first().text(), "New company");
  assert.ok(
    $(".hys-contact-card address").first().text().includes("New address"),
  );
  assert.equal($('a[href="mailto:new@example.com"]').length, 2);
  assert.equal($('a[href="tel:+60312345678"]').length, 2);
  assert.ok($(".hys-contact-card").eq(1).text().includes("+60 3 1111 2222"));
});
test("video changes replace both HLS fallback and the download URL", () => {
  const s = fresh();
  s.pages["/videos"].videos.videoUrl = "https://example.com/new.mp4";
  const $ = load(renderPage(html("videos/index.html"), "videos/index.html", s));
  assert.equal($("video").attr("src"), "https://example.com/new.mp4");
  assert.equal($("video").attr("data-hls-src"), "");
  assert.equal($("video a").attr("href"), "https://example.com/new.mp4");
  assert.ok(
    $("script")
      .map((i, e) => $(e).text())
      .get()
      .some((t) => t.includes("if (!stream)")),
  );
});
test("rejects wrong websites, malicious URLs, foreign media, malformed sections and duplicate IDs", () => {
  assert.throws(() => validateSnapshot({ ...fresh(), websiteId: "other" }));
  assert.throws(() => publicImage("javascript:alert(1)"));
  assert.throws(() => publicImage("/cms-assets/../secret.png"));
  assert.throws(() =>
    publicImage(
      "media:82a18e9e-ea66-4834-8b4d-a7625eb59bef/70000000-0000-0000-0000-000000000003",
    ),
  );
  const s = fresh();
  s.pages["/"].home = null;
  assert.throws(() => validateSnapshot(s));
  const t = fresh();
  t.pages["/shared"].product_categories.items.push(
    t.pages["/shared"].product_categories.items[0],
  );
  assert.throws(() => validateSnapshot(t));
  const u = fresh();
  u.pages["/our-products/flanges"].flange_products.items[0].imageAlt = "";
  assert.throws(() => validateSnapshot(u));
});
test("missing sections use imported defaults while explicit empty collections stay empty", () => {
  const s = fresh();
  delete s.pages["/about-us"];
  assert.deepEqual(
    readSection(s, "about"),
    onboarding.sections.find((x) => x.key === "about").content,
  );
  s.pages["/shared"].product_categories.items = [];
  assert.deepEqual(readSection(s, "product_categories").items, []);
});
test("build preserves legacy redirects and source templates, and updates form email plus QR", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hys-cms-test-"));
  try {
    const snapshot = fresh();
    snapshot.pages["/shared"].company_details.email1 = "owner@example.com";
    snapshot.pages["/shared"].company_details.website =
      "https://example.com/distributor";
    const file = path.join(dir, "snapshot.json"),
      output = path.join(dir, "site");
    writeFileSync(file, JSON.stringify(snapshot));
    const source = html("index.html");
    buildSite({ snapshotPath: file, output });
    assert.equal(
      readFileSync(path.join(output, "58-2/bars/index.html"), "utf8"),
      html("58-2/bars/index.html"),
    );
    assert.equal(html("index.html"), source);
    assert.ok(
      readFileSync(path.join(output, "copy.js"), "utf8").includes(
        "mailto:owner@example.com",
      ),
    );
    assert.ok(existsSync(path.join(output, "assets/cms-distributor-qr.svg")));
    assert.ok(
      readFileSync(path.join(output, "contact-us/index.html"), "utf8").includes(
        "/assets/cms-distributor-qr.svg",
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uploaded PDFs resolve in both the viewer and download link without a .pdf path extension", () => {
  const s = fresh();
  s.pages["/catalogue/fittings"].fitting_catalogue.documents[0].url =
    "media:" + onboarding.websiteId + "/70000000-0000-0000-0000-000000000004";
  const $ = load(
    renderPage(
      html("catalogue/fittings/index.html"),
      "catalogue/fittings/index.html",
      s,
    ),
  );
  const href = $(".hys-pdf-download").first().attr("href");
  assert.ok(href.includes("/website-published-media/" + onboarding.websiteId));
  assert.ok($(".df-shortcode-script").first().text().includes(href));
});
