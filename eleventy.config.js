import { HtmlBasePlugin } from "@11ty/eleventy";
import { load as loadYaml } from "js-yaml";
import markdownIt from "markdown-it";

const md = markdownIt({ html: true, linkify: true, typographer: true });

// Dates arrive either as JS Dates (from front matter) or "YYYY-MM-DD" strings (from YAML data files).
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(`${value}`.length === 10 ? `${value}T23:59:59Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isOpen(data) {
  if (data.status === "closed") return false;
  const deadline = toDate(data.deadline);
  return !deadline || deadline >= new Date();
}

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addDataExtension("yaml,yml", (contents) => loadYaml(contents));
  eleventyConfig.setLibrary("md", md);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addWatchTarget("src/assets/");

  // Files with `draft: true` show up in `npm start` but are left out of the published site.
  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") return false;
  });

  eleventyConfig.addCollection("opportunities", (api) =>
    api
      .getFilteredByGlob("src/opportunities/*.md")
      .sort((a, b) => (toDate(b.data.deadline) ?? b.date) - (toDate(a.data.deadline) ?? a.date)),
  );

  eleventyConfig.addFilter("md", (text) => (text ? md.render(`${text}`) : ""));
  eleventyConfig.addFilter("mdInline", (text) => (text ? md.renderInline(`${text}`) : ""));
  eleventyConfig.addFilter("isOpen", isOpen);
  eleventyConfig.addFilter("openOnly", (items) => items.filter((item) => isOpen(item.data)));
  eleventyConfig.addFilter("closedOnly", (items) => items.filter((item) => !isOpen(item.data)));
  eleventyConfig.addFilter("date", (value, style = "long") => {
    const d = toDate(value);
    if (!d) return value ?? "";
    const opts = style === "short" ? { month: "short", year: "numeric" } : { day: "numeric", month: "long", year: "numeric" };
    return d.toLocaleDateString("en-IE", { ...opts, timeZone: "UTC" });
  });
  eleventyConfig.addFilter("initials", (name = "") => {
    const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)[0] : ""}`.toUpperCase();
  });
  eleventyConfig.addFilter("person", (people, id) => people.find((p) => p.id === id));
  eleventyConfig.addFilter("where", (items, key, value) => items.filter((item) => item[key] === value));
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
