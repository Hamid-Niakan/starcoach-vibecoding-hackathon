import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type CorpusFile = {
  absolutePath: string;
  sourcePath: string;
  content: string;
};

export type CorpusSection = {
  headingPath: string[];
  content: string;
  anchor: string | null;
};

export type CorpusPage = {
  sourcePath: string;
  canonicalUrl: string;
  title: string;
  sections: CorpusSection[];
  content: string;
};

const ORIGINAL_LINK = /^\ufeff?Original link:\s*(\S+)\s*$/im;
const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

function walk(directory: string): string[] {
  return readdirSync(directory)
    .sort((left, right) => left.localeCompare(right, "en"))
    .flatMap((entry) => {
      const absolute = resolve(directory, entry);
      return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
    });
}

export function discoverCorpus(root: string): CorpusFile[] {
  const absoluteRoot = resolve(root);
  return walk(absoluteRoot)
    .filter((path) => path.endsWith(".md"))
    .map((absolutePath) => {
      const sourcePath = relative(absoluteRoot, absolutePath)
        .split(sep)
        .join("/");
      if (sourcePath.startsWith("../") || sourcePath.includes("/../")) {
        throw new Error("Corpus source path escapes the approved root");
      }
      return {
        absolutePath,
        sourcePath,
        content: readFileSync(absolutePath, "utf8"),
      };
    });
}

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200c+/g, "‌")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function normalizeCanonicalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Original link must be a valid official canonical URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.liara.ir" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Original link must be an official canonical URL");
  }
  url.pathname = `/${url.pathname.split("/").filter(Boolean).join("/")}/`;
  return url.toString();
}

export function headingAnchor(heading: string): string | null {
  const anchor = normalizeForSearch(heading)
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return anchor || null;
}

export function parseCorpusPage(file: CorpusFile): CorpusPage {
  const link = ORIGINAL_LINK.exec(file.content);
  if (!link?.[1])
    throw new Error(`Missing Original link in ${file.sourcePath}`);
  const canonicalUrl = normalizeCanonicalUrl(link[1]);
  const lines = file.content.replace(/^\ufeff/, "").split(/\r?\n/);
  const headings: string[] = [];
  const sections: CorpusSection[] = [];
  let buffer: string[] = [];
  let sectionPath: string[] = [];
  let sectionAnchor: string | null = null;
  let title = "";
  let inFence = false;

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content && sectionPath.length > 0) {
      sections.push({
        headingPath: [...sectionPath],
        content,
        anchor: sectionAnchor,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const match = inFence ? null : HEADING.exec(line);
    if (!match) {
      if (!ORIGINAL_LINK.test(line)) buffer.push(line);
      ORIGINAL_LINK.lastIndex = 0;
      continue;
    }
    flush();
    const level = match[1]!.length;
    const heading = match[2]!.replace(/\s+#+$/, "").trim();
    if (!title) title = heading;
    headings.length = level - 1;
    headings[level - 1] = heading;
    sectionPath = headings.filter(Boolean);
    sectionAnchor = level === 1 ? null : headingAnchor(heading);
    buffer.push(line);
  }
  flush();

  if (!title)
    throw new Error(`Corpus page ${file.sourcePath} has no heading title`);
  if (sections.length === 0)
    throw new Error(`Corpus page ${file.sourcePath} has no content`);
  return {
    sourcePath: file.sourcePath,
    canonicalUrl,
    title,
    sections,
    content: file.content,
  };
}

export function loadRouteInventory(root: string): ReadonlySet<string> {
  return new Set(
    discoverCorpus(root).map((file) => parseCorpusPage(file).canonicalUrl),
  );
}
