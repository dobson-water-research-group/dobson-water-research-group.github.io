// Builds the publications list at build time from OpenAlex, using each group member's ORCID iD.
// Settings (hide / extra / since_year) live in publications_settings.yaml.

import fs from "node:fs";
import Fetch from "@11ty/eleventy-fetch";
import { load as loadYaml } from "js-yaml";

const read = (file) => loadYaml(fs.readFileSync(new URL(file, import.meta.url), "utf8")) ?? {};

// Display categories, in the order the filter buttons appear. `shown` = visible by default.
const CATEGORIES = {
  article: { label: "Journal article", shown: true, rank: 0 },
  chapter: { label: "Book or chapter", shown: true, rank: 1 },
  "conference-paper": { label: "Conference paper", shown: true, rank: 2 },
  thesis: { label: "Thesis", shown: true, rank: 3 },
  report: { label: "Report", shown: true, rank: 4 },
  preprint: { label: "Preprint", shown: false, rank: 5 },
  abstract: { label: "Conference abstract", shown: false, rank: 6 },
  dataset: { label: "Dataset", shown: false, rank: 7 },
};

const SKIP_TYPES = new Set(["peer-review", "paratext", "erratum", "retraction", "editorial", "supplementary-materials"]);

function categorise(work) {
  const source = work.primary_location?.source;
  const venue = source?.display_name ?? "";
  if (/abstract|general assembly|fall meeting|agufm|egu ?ga/i.test(venue)) return "abstract";
  switch (work.type) {
    case "article":
    case "review":
    case "software-paper":
    case "letter":
      return source?.type === "repository" || !source ? "preprint" : "article";
    case "book":
    case "book-chapter":
      return "chapter";
    case "conference-paper":
    case "proceedings-article":
      return "conference-paper";
    case "conference-abstract":
      return "abstract";
    case "preprint":
    case "posted-content":
      return "preprint";
    case "dissertation":
      return "thesis";
    case "report":
      return "report";
    case "dataset":
      return "dataset";
    default:
      return null;
  }
}

// Escape everything, then allow back the few tags journals use in titles (italics, sub/superscripts).
const safeTitle = (t) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;(\/?)(i|em|sub|sup)&gt;/gi, (_, slash, tag) => `<${slash}${tag.toLowerCase()}>`);
const normTitle = (t = "") =>
  t
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "");
const bareDoi = (doi) => doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() || null;
const bareOrcid = (orcid) => orcid?.replace(/^https?:\/\/orcid\.org\//i, "") || null;

async function worksFor(orcid) {
  const select = "id,doi,title,publication_year,publication_date,type,primary_location,authorships,open_access,biblio";
  const auth = [process.env.OPENALEX_API_KEY && `api_key=${process.env.OPENALEX_API_KEY}`]
    .filter(Boolean)
    .map((p) => `&${p}`)
    .join("");
  const works = [];
  let cursor = "*";
  while (cursor) {
    const url = `https://api.openalex.org/works?filter=author.orcid:${orcid}&select=${select}&per_page=200&cursor=${encodeURIComponent(cursor)}${auth}`;
    const page = await Fetch(url, { duration: "1d", type: "json" });
    works.push(...page.results);
    cursor = page.results.length ? page.meta.next_cursor : null;
  }
  return works;
}

function toEntry(work, members) {
  const category = categorise(work);
  if (!category || SKIP_TYPES.has(work.type) || !work.title) return null;
  const memberIds = new Set();
  const authors = (work.authorships ?? []).map((a) => {
    const member = members.get(bareOrcid(a.author?.orcid));
    if (member) memberIds.add(member.id);
    return { name: a.author?.display_name ?? a.raw_author_name, member: member?.id ?? null };
  });
  const b = work.biblio ?? {};
  const pages = b.first_page && b.last_page && b.first_page !== b.last_page ? `${b.first_page}–${b.last_page}` : b.first_page;
  return {
    id: work.id,
    title: safeTitle(work.title),
    authors,
    venue: work.primary_location?.source?.display_name ?? "",
    details: [b.volume && `${b.volume}${b.issue ? `(${b.issue})` : ""}`, pages].filter(Boolean).join(", "),
    year: work.publication_year,
    date: work.publication_date ?? `${work.publication_year}-01-01`,
    category,
    doi: bareDoi(work.doi),
    url: work.doi ?? work.primary_location?.landing_page_url ?? work.id,
    oa_url: work.open_access?.is_oa ? work.open_access.oa_url : null,
    people: [...memberIds],
  };
}

function manualEntry(item, members) {
  const byName = [...members.values()];
  return {
    id: item.doi ?? item.url ?? item.title,
    title: safeTitle(item.title),
    authors: (item.authors ?? []).map((name) => ({
      name,
      member: byName.find((m) => name.toLowerCase().includes(m.name.split(" ").at(-1).toLowerCase()))?.id ?? null,
    })),
    venue: item.venue ?? "",
    details: item.details ?? "",
    year: Number(item.year),
    date: item.date ?? `${item.year}-01-01`,
    category: { "book-chapter": "chapter", "conference-abstract": "abstract" }[item.type] ?? item.type ?? "article",
    doi: bareDoi(item.doi),
    url: item.doi ? `https://doi.org/${bareDoi(item.doi)}` : item.url,
    oa_url: item.pdf ?? null,
    people: item.people ?? [],
  };
}

export default async function () {
  const people = read("./people.yaml");
  const settings = read("./publications_settings.yaml");
  const hidden = new Set((settings.hide ?? []).map((h) => bareDoi(`${h}`) ?? `${h}`.toLowerCase()));
  const members = new Map(people.filter((p) => p.orcid).map((p) => [bareOrcid(`${p.orcid}`), p]));

  const raw = [];
  for (const [orcid, person] of members) {
    try {
      raw.push(...(await worksFor(orcid)));
    } catch (err) {
      // On GitHub, fail the build so the live site keeps its last good list rather than showing an empty one.
      if (process.env.CI) throw new Error(`OpenAlex lookup failed for ${person.name}: ${err.message}`);
      console.warn(`[publications] Couldn't fetch works for ${person.name} (${err.message}). Continuing without them.`);
    }
  }

  const entries = [
    ...raw.map((w) => toEntry(w, members)).filter(Boolean),
    ...(settings.extra ?? []).map((item) => manualEntry(item, members)),
  ].filter((e) => !hidden.has(e.doi) && !hidden.has(e.id.toLowerCase()) && !hidden.has(e.id.split("/").at(-1).toLowerCase()));

  // Merge duplicates: the same DOI found via two people, or a preprint of a published paper.
  const byKey = new Map();
  for (const e of entries) {
    const key = normTitle(e.title);
    const existing = byKey.get(key) ?? [...byKey.values()].find((x) => e.doi && x.doi === e.doi);
    if (!existing) {
      byKey.set(key, e);
      continue;
    }
    existing.people = [...new Set([...existing.people, ...e.people])];
    for (const a of e.authors) {
      const match = existing.authors.find((x) => x.name === a.name);
      if (match && a.member) match.member = a.member;
    }
    if (CATEGORIES[e.category].rank < CATEGORIES[existing.category].rank) {
      byKey.set(key, { ...e, people: existing.people, oa_url: e.oa_url ?? existing.oa_url });
    } else if (!existing.oa_url && e.oa_url) {
      existing.oa_url = e.oa_url;
    }
  }

  const since = Number(settings.since_year) || 0;
  const items = [...byKey.values()].filter((e) => e.year >= since).sort((a, b) => b.date.localeCompare(a.date));

  const years = [];
  for (const item of items) {
    if (years.at(-1)?.year !== item.year) years.push({ year: item.year, items: [] });
    years.at(-1).items.push(item);
  }

  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, items.filter((i) => i.category === c).length]));
  return {
    items,
    years,
    counts,
    categories: Object.entries(CATEGORIES)
      .filter(([key]) => counts[key] > 0)
      .map(([key, c]) => ({ key, ...c, count: counts[key] })),
    labels: Object.fromEntries(Object.entries(CATEGORIES).map(([key, c]) => [key, c.label])),
    shown: Object.fromEntries(Object.entries(CATEGORIES).map(([key, c]) => [key, c.shown])),
    updated: new Date().toISOString(),
  };
}
