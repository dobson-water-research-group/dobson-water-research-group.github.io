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

// A deadline can be a date (2027-03-31, open until the end of that day) or a date and time
// (2026-12-16T12:00:00Z, open until that moment).
function hasTime(value) {
  if (value instanceof Date) return value.getUTCHours() + value.getUTCMinutes() + value.getUTCSeconds() > 0;
  return `${value}`.length > 10;
}

function closesAt(value) {
  const d = toDate(value);
  if (!d || hasTime(value) || !(value instanceof Date)) return d;
  return new Date(d.getTime() + 86_399_000); // 23:59:59 on that day
}

function isOpen(data) {
  if (data.status === "closed") return false;
  const deadline = closesAt(data.deadline);
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
  eleventyConfig.addFilter("closesAt", (value) => closesAt(value)?.toISOString() ?? "");
  eleventyConfig.addFilter("date", (value, style = "long") => {
    const d = toDate(value);
    if (!d) return value ?? "";
    if (style === "short") return d.toLocaleDateString("en-IE", { month: "short", year: "numeric", timeZone: "UTC" });
    if (!hasTime(value)) return d.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    const day = d.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Dublin" });
    const time = d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Dublin" });
    return `${day}, ${time} Irish time`;
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
