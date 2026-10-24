import { load } from "cheerio";
import { renderSeo, sitemap } from "./seo.mjs";
import qrcode from "qrcode-generator";
import {
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const onboarding = JSON.parse(
  readFileSync(path.join(root, "cms-onboarding.json"), "utf8"),
);
export const bindings = JSON.parse(
  readFileSync(path.join(root, "src/cms/bindings.json"), "utf8"),
);
const defaults = new Map(
  onboarding.sections.map((section) => [section.key, section]),
);
const get = (obj, key) => key.split(".").reduce((value, k) => value?.[k], obj);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function https(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Only HTTPS URLs are allowed");
  return url.href;
}
export function publicImage(value) {
  if (typeof value !== "string") throw Error("Invalid image");
  if (value.startsWith("media:")) {
    const [site, id, ...extra] = value.slice(6).split("/");
    if (site !== onboarding.websiteId || !uuid.test(id ?? "") || extra.length)
      throw Error("Cross-site or invalid media reference");
    return `https://jxqdgtmwwjlsrhbgxpaq.supabase.co/storage/v1/object/public/website-published-media/${site}/${id}`;
  }
  if (
    /^\/cms-assets\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|avif|gif)$/.test(value)
  ) {
    if (!existsSync(path.join(root, "dist", value)))
      throw Error("Missing imported image");
    return value;
  }
  return https(value);
}
export function publicDocument(value) {
  return value.startsWith("media:") ? publicImage(value) : publicUrl(value);
}
export function publicUrl(value) {
  const url = new URL(https(value));
  return url.origin === onboarding.origin
    ? url.pathname + url.search + url.hash
    : url.href;
}
function validate(fields, content, prefix = "") {
  if (!content || typeof content !== "object" || Array.isArray(content))
    throw Error(`Invalid section ${prefix}`);
  for (const field of fields) {
    const value = content[field.key],
      label = prefix + field.key;
    if (value === undefined || value === null || value === "") {
      if (field.required) throw Error(`Required ${label}`);
      continue;
    }
    if (field.type === "group") validate(field.fields, value, label + ".");
    else if (field.type === "collection") {
      if (!Array.isArray(value) || value.length > 100)
        throw Error(`Invalid collection ${label}`);
      value.forEach((item) => validate(field.fields, item, label + "."));
    } else if (typeof value !== "string") throw Error(`Invalid text ${label}`);
    else if (field.type === "pdf") publicDocument(value);
    else if (field.type === "image") publicImage(value);
    else if (field.type === "url") https(value);
    else if (
      field.type === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      throw Error(`Invalid email ${label}`);
    else if (field.type === "select" && !field.options.includes(value))
      throw Error(`Invalid option ${label}`);
  }
}
export function readSection(snapshot, key) {
  const section = defaults.get(key);
  if (!section) throw Error("Unknown CMS section");
  const page = snapshot.pages?.[section.slug];
  const content =
    page && Object.hasOwn(page, key) ? page[key] : section.content;
  validate(section.definition.fields, content, key + ".");
  if (section.definition.editor) {
    const field = section.definition.editor.field,
      ids = new Set();
    for (const item of content[field]) {
      if (!uuid.test(item.id) || ids.has(item.id))
        throw Error("Invalid or duplicate item ID");
      ids.add(item.id);
    }
    return {
      ...content,
      [field]: content[field].filter((item) => item.status === "published"),
    };
  }
  return content;
}
export function validateSnapshot(snapshot) {
  if (
    snapshot.formatVersion !== 1 ||
    snapshot.websiteId !== onboarding.websiteId ||
    !snapshot.pages ||
    Array.isArray(snapshot.pages) ||
    typeof snapshot.pages !== "object"
  )
    throw Error("Wrong website or invalid CMS snapshot");
  for (const page of Object.values(snapshot.pages))
    if (!page || typeof page !== "object" || Array.isArray(page))
      throw Error("Invalid CMS page");
  for (const section of onboarding.sections) readSection(snapshot, section.key);
}
function setText($, node, value) {
  const parts = String(value).split("\n");
  node.empty();
  parts.forEach((part, i) => {
    if (i) node.append("<br>");
    node.append($("<span>").text(part).contents());
  });
}
function setImage(node, image, alt) {
  node
    .attr("src", publicImage(image))
    .attr("alt", alt ?? "")
    .removeAttr("srcset sizes data-src data-srcset");
  const link = node.closest("a");
  if (
    link.length &&
    /\.(jpg|jpeg|png|webp)(\?|$)/i.test(link.attr("href") ?? "")
  )
    link.attr("href", publicImage(image));
}
const scriptJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function renderPage(html, file, snapshot) {
  validateSnapshot(snapshot);
  const $ = load(html);
  let changed = false;
  const contents = new Map(
    onboarding.sections.map((s) => [s.key, readSection(snapshot, s.key)]),
  );
  for (const binding of bindings) {
    if (binding.file && binding.file !== file) continue;
    const value = get(contents.get(binding.section), binding.key);
    if (value === undefined) continue;
    const original = get(defaults.get(binding.section).content, binding.key);
    if (JSON.stringify(value) === JSON.stringify(original)) continue;
    let nodes = $(binding.selector);
    if (!binding.all) nodes = nodes.eq(binding.index ?? 0);
    if (!nodes.length) {
      if (binding.file)
        throw Error(`Missing CMS binding ${file}:${binding.key}`);
      continue;
    }
    changed = true;
    nodes.each((_, element) => {
      const node = $(element);
      switch (binding.type) {
        case "text":
          setText($, node, value);
          break;
        case "headingLink":
          setText($, node.find("a").first(), value);
          break;
        case "attribute":
          node.attr(binding.attribute, value);
          break;
        case "image":
          setImage(node, value.image, value.imageAlt);
          break;
        case "poster":
          node
            .attr("poster", publicImage(value.image))
            .attr("aria-label", value.imageAlt);
          break;
        case "email":
          node.text(value).attr("href", "mailto:" + value);
          break;
        case "phone":
          if (!/^[+\d\s().-]{3,40}$/.test(value))
            throw Error("Invalid telephone");
          node.text(value).attr("href", "tel:" + value.replace(/[^+\d]/g, ""));
          break;
        case "fax":
          node.text("F: " + value);
          break;
        case "href":
          node.attr("href", https(value));
          if (!node.find("img").length)
            node.text(
              new URL(value).host + new URL(value).pathname.replace(/\/$/, ""),
            );
          break;
        case "slideshow": {
          const settings = JSON.parse(node.attr("data-settings"));
          settings.background_slideshow_gallery = value.map((slide, i) => ({
            id: 50000 + i,
            url: publicImage(slide.image),
          }));
          node.attr("data-settings", JSON.stringify(settings));
          if (value.length)
            node.css(
              "background-image",
              `url("${publicImage(value[0].image)}")`,
            );
          else node.css("background-image", "none");
          break;
        }
        case "video":
          node
            .attr("data-hls-src", "")
            .attr("data-fallback-src", publicUrl(value))
            .attr("src", publicUrl(value));
          node.find("a").attr("href", publicUrl(value));
          $("script").each((_, s) => {
            const text = $(s).html();
            if (text?.includes("var stream = video.dataset.hlsSrc;"))
              $(s).text(
                text.replace(
                  "var fallback = video.dataset.fallbackSrc;",
                  "var fallback = video.dataset.fallbackSrc;\n  if (!stream) { video.src = fallback; return; }",
                ),
              );
          });
          break;
      }
    });
  }
  const page = onboarding.sections.find(
    (s) =>
      s.slug !== "/shared" &&
      bindings.some((b) => b.section === s.key && b.file === file),
  );
  if (page) {
    const content = contents.get(page.key);
    if (page.definition.editor?.field === "items") {
      const original = page.content.items;
      if (JSON.stringify(content.items) !== JSON.stringify(original)) {
        changed = true;
        const container = $(".hys-product-details");
        const template = container.find(".hys-product-detail").first().clone();
        if (!container.length || !template.length)
          throw Error("Missing product layout");
        container.empty();
        for (const item of content.items) {
          const node = template.clone();
          node.find("h2").first().text(item.title);
          node.find("figcaption").text(item.title);
          setImage(node.find("img").first(), item.image, item.imageAlt);
          setText(
            $,
            node.find(".hys-product-description p").first(),
            item.description,
          );
          const body = node.find("tbody").empty();
          for (const spec of item.specifications) {
            body.append(
              $("<tr>").append(
                $('<th scope="row">').text(spec.label),
                $("<td>").text(spec.value),
              ),
            );
          }
          container.append(node);
        }
      }
    }
    if (
      page.definition.editor?.field === "documents" &&
      JSON.stringify(content.documents) !==
        JSON.stringify(page.content.documents)
    ) {
      changed = true;
      const grid = $(".hys-flipbook-grid").empty();
      for (const document of content.documents) {
        const source = publicDocument(document.url);
        const id = "df_cms_" + document.id.replaceAll("-", "");
        const article = $('<article class="hys-flipbook-item">').append(
          $("<h2>").text(document.title),
        );
        const book = $(
          '<div class="_df_book df-lite" wpoptions="true" thumbtype="">',
        )
          .attr("id", id)
          .attr("data-title", document.title);
        const script = $(
          '<script class="df-shortcode-script" type="application/javascript">',
        ).text(
          `window.option_${id} = ${scriptJson({ height: 400, webgl: "false", outline: [], backgroundColor: "white", hard: "cover", source, wpOptions: "true" })}; if(window.DFLIP && window.DFLIP.parseBooks){window.DFLIP.parseBooks();}`,
        );
        article.append(
          $('<div class="hys-flipbook-shell">').append(book, script),
          $("<p>").append(
            $('<a class="hys-pdf-download" download>')
              .attr("href", source)
              .text("Download PDF"),
          ),
        );
        grid.append(article);
      }
    }
    if (content.seo) {
      for (const [property, value] of [
        ["title", content.seo.title],
        ["description", content.seo.description],
      ])
        if (value !== page.content.seo?.[property]) {
          changed = true;
          $(
            `meta[property="og:${property}"],meta[name="twitter:${property}"]`,
          ).attr("content", value);
        }
    }
  }
  const categories = contents.get("product_categories").items;
  if (
    $(".category-grid").length &&
    JSON.stringify(categories) !==
      JSON.stringify(defaults.get("product_categories").content.items)
  ) {
    changed = true;
    const grid = $(".category-grid").empty(),
      catalogue = file.startsWith("catalogue/");
    for (const item of categories) {
      const href = publicUrl(catalogue ? item.catalogueUrl : item.productUrl);
      const card = $('<article class="category-card">');
      card.append(
        $("<a>")
          .attr("href", href)
          .append(
            $("<img>")
              .attr("src", publicImage(item.image))
              .attr("alt", item.imageAlt),
          ),
        $("<h2>").append($("<a>").attr("href", href).text(item.title)),
        $('<a class="category-button">')
          .attr("href", href)
          .text(catalogue ? "VIEW CATALOGUE" : "VIEW PRODUCTS"),
      );
      grid.append(card);
    }
  }
  const company = contents.get("company_details"),
    oldCompany = defaults.get("company_details").content;
  if (company.manufacturer !== oldCompany.manufacturer) {
    $(".hys-brand span").text(company.manufacturer);
    $(".hys-contact-card").eq(0).find("h3").text(company.manufacturer);
    changed = true;
  }
  for (const [key, index] of [
    ["manufacturerAddress", 0],
    ["distributorAddress", 1],
  ])
    if (company[key] !== oldCompany[key]) {
      setText(
        $,
        $(".hys-contact-card").eq(index).find("address"),
        company[key],
      );
      changed = true;
    }
  if (company.phone !== oldCompany.phone || company.fax !== oldCompany.fax) {
    const p = $(".hys-contact-card").eq(1).find("p").not(".hys-contact-role");
    p.empty().append(
      $("<strong>").text("T:"),
      " ",
      $("<a>")
        .attr("href", "tel:" + company.phone.replace(/[^+\d]/g, ""))
        .text(company.phone),
      "<br>",
      $("<strong>").text("F:"),
      " " + company.fax,
    );
    changed = true;
  }
  if (company.distributorLabel !== oldCompany.distributorLabel) {
    $(".hys-contact-card")
      .eq(1)
      .find(".hys-contact-role")
      .text(company.distributorLabel);
    changed = true;
  }
  if (company.website !== oldCompany.website) {
    $(".hs-footer-qr img,.hys-contact-website-card img")
      .attr("src", "/assets/cms-distributor-qr.svg")
      .attr("alt", "QR code for " + https(company.website));
    changed = true;
  }
  if (company.distributor !== oldCompany.distributor) {
    $(".hys-contact-card").eq(1).find("h3").text(company.distributor);
    changed = true;
  }
  return changed ? $.html() : html;
}
export function buildSite({
  snapshotPath = path.join(root, "src/cms/website-content.json"),
  output = path.join(root, "site"),
} = {}) {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  validateSnapshot(snapshot);
  if (path.resolve(output) === path.join(root, "dist"))
    throw Error("Output must not overwrite original templates");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(path.join(root, "dist"), output, { recursive: true });
  const files = [...new Set(bindings.filter((b) => b.file).map((b) => b.file))];
  const origin = new URL(https(process.env.SITE_URL || onboarding.origin)).origin;
  const seoPages = new Map(onboarding.sections.filter(s => s.content.seo).map(s => [s.slug, readSection(snapshot, s.key).seo]));
  const company = readSection(snapshot, "company_details");
  for (const file of files) {
    const source = readFileSync(path.join(root, "dist", file), "utf8");
    const slug = file === "index.html" ? "/" : "/" + file.replace(/\/index\.html$/, "");
    writeFileSync(path.join(output, file), renderSeo(renderPage(source, file, snapshot), slug, seoPages, company, origin));
  }
  writeFileSync(path.join(output, "sitemap.xml"), sitemap(origin, [...seoPages.keys()]));
  writeFileSync(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  if (company.website !== defaults.get("company_details").content.website) {
    const qr = qrcode(0, "M");
    qr.addData(https(company.website));
    qr.make();
    writeFileSync(
      path.join(output, "assets/cms-distributor-qr.svg"),
      qr.createSvgTag({ scalable: true }),
    );
  }
  let script = readFileSync(path.join(output, "copy.js"), "utf8");
  script = script.replace(
    "'mailto:sales@huatsiang.com?subject=Website%20enquiry&body='",
    scriptJson("mailto:" + company.email1 + "?subject=Website%20enquiry&body="),
  );
  writeFileSync(path.join(output, "copy.js"), script);
  console.log(
    `Built ${files.length} CMS pages; original templates and legacy redirect pages preserved.`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  buildSite();
