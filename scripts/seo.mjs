import { load } from "cheerio";

export function pageUrl(origin, slug) {
  return new URL(slug === "/" ? "/" : slug.replace(/\/$/, "") + "/", origin).href;
}

export function renderSeo(html, slug, pages, company, origin) {
  const $ = load(html);
  const seo = pages.get(slug);
  const url = pageUrl(origin, slug);
  const home = pageUrl(origin, "/");
  const absolute = (value) => new URL(value, origin).href;
  const image = $(".hys-product-detail img, .entry-content img, .category-card img").first().attr("src") || $("meta[property='og:image']").attr("content");
  const setMeta = (attribute, key, value) => {
    $(`meta[${attribute}="${key}"]`).remove();
    $("<meta>").attr(attribute, key).attr("content", value).appendTo("head");
  };
  $("html").attr("lang", "en");
  $("title").remove();
  $("<title>").text(seo.title).appendTo("head");
  setMeta("name", "description", seo.description);
  setMeta("name", "robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  $("link[rel='canonical']").remove();
  $("<link>").attr({ rel: "canonical", href: url }).appendTo("head");
  $("meta[property^='article:'], meta[property^='og:image:'], meta[name^='twitter:label'], meta[name^='twitter:data']").remove();
  for (const [key, value] of Object.entries({title: seo.title, description: seo.description, url, type: "website", site_name: company.manufacturer, locale: "en_US"})) setMeta("property", "og:" + key, value);
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", seo.title);
  setMeta("name", "twitter:description", seo.description);
  if (image) {
    setMeta("property", "og:image", absolute(image));
    setMeta("name", "twitter:image", absolute(image));
  }
  // Replace imported WordPress schema, including its unsupported search action.
  $("script[type='application/ld+json']").remove();
  const crumbs = [{ "@type": "ListItem", position: 1, name: "Home", item: home }];
  const parts = slug.split("/").filter(Boolean);
  parts.forEach((part, index) => {
    const parent = "/" + parts.slice(0, index + 1).join("/");
    const name = pages.get(parent)?.title.split(" - ")[0] || part;
    crumbs.push({ "@type": "ListItem", position: index + 2, name, item: pageUrl(origin, parent) });
  });
  const graph = [
    { "@type": "Organization", "@id": home + "#organization", name: company.manufacturer, url: home, address: company.manufacturerAddress },
    { "@type": "Organization", "@id": home + "#distributor", name: company.distributor, url: company.website, address: company.distributorAddress, telephone: company.phone, email: company.email1 },
    { "@type": "WebSite", "@id": home + "#website", url: home, name: company.manufacturer, publisher: { "@id": home + "#organization" }, inLanguage: "en" },
    { "@type": slug === "/contact-us" ? "ContactPage" : slug === "/about-us" ? "AboutPage" : "WebPage", "@id": url + "#webpage", url, name: seo.title, description: seo.description, isPartOf: { "@id": home + "#website" }, about: { "@id": home + "#organization" }, breadcrumb: { "@id": url + "#breadcrumb" }, inLanguage: "en", ...(image ? { image: absolute(image) } : {}) },
    { "@type": "BreadcrumbList", "@id": url + "#breadcrumb", itemListElement: crumbs },
  ];
  $("<script>").attr({ type: "application/ld+json", id: "site-seo" }).text(JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")).appendTo("head");
  return $.html();
}

export function sitemap(origin, slugs) {
  const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + slugs.map(slug => `  <url><loc>${escape(pageUrl(origin, slug))}</loc></url>`).join("\n") + '\n</urlset>\n';
}
