import type {EvidenceBundle, EvidenceSource, VideoJob} from "./types.js";
import {assertCitationLinks, evidenceSnapshot} from "./citations.js";

const ENDPOINT = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const MAX_RESPONSE_BYTES = 2_000_000;
type Dependencies = {fetch?: typeof fetch; now?: () => Date};
type RecordData = {
  source?: string; id?: string; pmid?: string; doi?: string; title?: string;
  authorString?: string; pubYear?: string; abstractText?: string; isRetracted?: string;
  journalInfo?: {journal?: {title?: string}};
  pubTypeList?: {pubType?: string[]}; commentCorrectionList?: unknown;
};

const plainText = (text: string) => text.replace(/<[^>]*>/g, " ")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

const sourceFromRecord = (record: RecordData): EvidenceSource | undefined => {
  const pmid = record.pmid;
  const types = record.pubTypeList?.pubType ?? [];
  if (record.source !== "MED" || !pmid || !/^[1-9]\d{0,8}$/.test(pmid) || record.id !== pmid) return;
  if (!record.title || !record.abstractText || !record.authorString || !record.journalInfo?.journal?.title || !/^\d{4}$/.test(record.pubYear ?? "")) return;
  // Conservative exclusion of known retractions, concerns, and correction notices.
  if (record.isRetracted === "Y" || /retract|expression of concern|erratum|correction/i.test(JSON.stringify([types, record.commentCorrectionList]))) return;
  const doi = record.doi?.trim().toLowerCase();
  if (doi && !/^10\.\d{4,9}\/\S+$/.test(doi)) return;
  const abstract = plainText(record.abstractText);
  if (abstract.length < 20 || abstract.length > 30_000) return;
  return {id: `pubmed-${pmid}`, pmid, ...(doi ? {doi} : {}), url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    title: plainText(record.title), authors: plainText(record.authorString), journal: plainText(record.journalInfo.journal.title),
    year: Number(record.pubYear), abstract, publicationTypes: [...types].sort()};
};

const search = async (query: string, dependencies: Dependencies): Promise<EvidenceSource[]> => {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({query, format: "json", resultType: "core", pageSize: "25"}).toString();
  // No arbitrary URLs, redirects, credentials, LLM calls, or unbounded retries.
  const response = await (dependencies.fetch ?? fetch)(url, {redirect: "error", signal: AbortSignal.timeout(15_000), headers: {accept: "application/json"}});
  if (!response.ok) throw new Error(`Evidence provider failed (${response.status}); no evidence was validated.`);
  if (!response.body) throw new Error("Evidence provider returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Evidence provider response exceeds size limit.");
      chunks.push(value);
    }
  } finally {await reader.cancel();}
  const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const records = (raw as {resultList?: {result?: RecordData[]}} | null)?.resultList?.result;
  if (!Array.isArray(records)) throw new Error("Malformed evidence provider response.");
  const sources = records.map(sourceFromRecord).filter((source): source is EvidenceSource => Boolean(source));
  return sources.filter((source, index) => sources.findIndex((other) => other.id === source.id || (source.doi && other.doi === source.doi)) === index);
};

export const retrieveEvidence = async (topic: string, dependencies: Dependencies = {}): Promise<EvidenceBundle> => {
  if (typeof topic !== "string" || topic.trim().length < 3 || topic.length > 500) throw new Error("Evidence query must contain 3–500 characters and no patient identifiers.");
  // Plain terms only; callers cannot inject provider query operators or source filters.
  const stopWords = new Set(["a", "an", "the", "in", "on", "of", "for", "and", "or", "vs", "versus", "with", "about", "create", "make", "video", "short"]);
  const terms = topic.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((term) => !stopWords.has(term)).map((term) => term === "tnk" ? "tenecteplase" : term === "tpa" ? "alteplase" : term).slice(0, 30);
  if (!terms?.length) throw new Error("Evidence query has no searchable terms.");
  const query = terms.map((term) => `"${term}"`).join(" AND ");
  const now = (dependencies.now ?? (() => new Date()))();
  const date = now.toISOString().slice(0, 10);
  const base = `(${query}) AND SRC:MED AND HAS_ABSTRACT:Y AND FIRST_PDATE:[1900-01-01 TO ${date}]`;
  // Separate bounded searches reserve space for guidelines and clinical trials.
  const guidelines = await search(`${base} AND (PUB_TYPE:"Guideline" OR PUB_TYPE:"Practice Guideline") sort_date:y`, dependencies);
  const trials = await search(`${base} AND (PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Clinical Trial") sort_date:y`, dependencies);
  const relevant = await search(base, dependencies);
  const guidelineRecords = guidelines.filter((source) => source.publicationTypes.some((type) => /^(practice )?guideline$/i.test(type)));
  const trialRecords = trials.filter((source) => source.publicationTypes.some((type) => /^(randomized controlled|clinical) trial$/i.test(type)));
  const candidates = [...guidelineRecords.slice(0, 4), ...trialRecords.slice(0, 4), ...relevant];
  const sources = candidates.filter((source, index) => candidates.findIndex((other) => other.id === source.id || (source.doi && other.doi === source.doi)) === index).slice(0, 10);
  if (!sources.length) throw new Error("No usable evidence found. Refine the query; no sources or citations were invented.");
  return {provider: "europe-pmc", query: topic.trim(), retrievedAt: now.toISOString(), sources};
};

export const attachEvidence = (job: VideoJob, evidence: EvidenceBundle): VideoJob => {
  const updated = structuredClone(job);
  updated.evidence = {...structuredClone(evidence), validation: undefined};
  updated.scenes.forEach((scene) => {delete scene.citations; delete scene.evidenceExcerpts;});
  updated.review = {factual: "pending", clinical: "pending"};
  updated.approvals = {brief: "pending", paidGeneration: "pending", publish: "pending"};
  return updated;
};

export const validateEvidence = async (job: VideoJob, dependencies: Dependencies = {}): Promise<VideoJob> => {
  assertCitationLinks(job);
  const sources = job.evidence!.sources;
  const canonical = await search(`SRC:MED AND (${sources.map((source) => `EXT_ID:${source.pmid}`).join(" OR ")})`, dependencies);
  for (const source of sources) {
    const found = canonical.find((item) => item.id === source.id);
    // Explicit field order makes input JSON key ordering irrelevant.
    const keys: Array<keyof EvidenceSource> = ["id", "pmid", "doi", "url", "title", "authors", "journal", "year", "abstract", "publicationTypes"];
    if (!found || keys.some((key) => JSON.stringify(found[key]) !== JSON.stringify(source[key]))) {
      throw new Error(`Source ${source.id} is missing, flagged, or differs from the provider. Refresh evidence and review again.`);
    }
  }
  const updated = structuredClone(job);
  const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  updated.evidence!.validation = {checkedAt, snapshot: evidenceSnapshot(updated)};
  updated.review = {factual: "pending", clinical: "pending"};
  updated.approvals = {brief: "pending", paidGeneration: "pending", publish: "pending"};
  return updated;
};
