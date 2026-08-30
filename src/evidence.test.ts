import assert from "node:assert/strict";
import {test} from "node:test";
import {spawnSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {retrieveEvidence, attachEvidence, validateEvidence} from "./evidence.js";
import {assertCitationLinks, assertValidatedEvidence, citationLabels, EVIDENCE_MAX_AGE_MS} from "./citations.js";
import {approveMedicalReview, assertRequiredReviews, assertRenderReady} from "./review.js";
import {assertJobSchema} from "./validation.js";
import {MainVideo} from "./remotion/Video.js";
import {generateJob} from "./generator.js";
import type {VideoJob} from "./types.js";

// Synthetic records: these are software fixtures, not clinical evidence.
const record = {source: "MED", id: "12345678", pmid: "12345678", doi: "10.1234/test",
  title: "Synthetic stroke trial fixture", authorString: "Example A", pubYear: "2025",
  journalInfo: {journal: {title: "Test Journal"}}, pubTypeList: {pubType: ["Randomized Controlled Trial"]},
  abstractText: "This synthetic abstract is for testing citation provenance only. It must not be used as clinical evidence."};
const now = new Date();
const response = (records: unknown[] = [record]) => Response.json({resultList: {result: records}});
const provider = (records: unknown[] = [record]): typeof fetch => async () => response(records);
const dependencies = {fetch: provider(), now: () => now};
const draft = async (): Promise<VideoJob> => {
  const {job} = await generateJob({prompt: "Create a video about stroke"});
  const updated = attachEvidence(job, await retrieveEvidence("stroke", dependencies));
  updated.scenes.forEach((scene) => {
    scene.citations = ["pubmed-12345678"];
    scene.evidenceExcerpts = [{sourceId: "pubmed-12345678", excerpt: "This synthetic abstract is for testing citation provenance only."}];
  });
  return updated;
};
const approved = async () => {
  const job = await validateEvidence(await draft(), dependencies);
  job.approvals.brief = "approved";
  approveMedicalReview(job);
  return job;
};

test("retrieval reserves searches for guidelines/trials, restricts the host, deduplicates and records provenance", async () => {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(url.origin, "https://www.ebi.ac.uk");
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.equal(url.searchParams.get("resultType"), "core");
    return response([record, record]);
  };
  const bundle = await retrieveEvidence("TNK vs alteplase in stroke", {fetch: fetcher, now: () => now});
  assert.equal(calls.length, 3);
  assert.match(calls[0].searchParams.get("query")!, /Guideline/);
  assert.match(calls[1].searchParams.get("query")!, /Randomized Controlled Trial/);
  assert.match(calls[0].searchParams.get("query")!, /"tenecteplase" AND "alteplase" AND "stroke"/);
  assert.equal(bundle.sources.length, 1); assert.equal(bundle.provider, "europe-pmc");
  assert.equal(bundle.retrievedAt, now.toISOString()); assert.equal(bundle.validation, undefined);
  assert.equal(bundle.sources[0].url, "https://pubmed.ncbi.nlm.nih.gov/12345678/");
});

test("retrieval excludes missing abstracts, non-PubMed records, malformed identities and flagged publications", async () => {
  const bad = [
    {...record, abstractText: ""}, {...record, source: "PPR"}, {...record, id: "999"}, {...record, doi: "javascript:evil"},
    {...record, isRetracted: "Y"}, {...record, pubTypeList: {pubType: ["Retracted Publication"]}},
    {...record, commentCorrectionList: {commentCorrection: [{type: "Expression of concern"}]}},
  ];
  const result = await retrieveEvidence("stroke", {fetch: provider([...bad, record])});
  assert.equal(result.sources.length, 1);
  await assert.rejects(retrieveEvidence("stroke", {fetch: provider(bad)}), /No usable evidence/);
});

test("network errors, malformed data, empty and oversized responses fail without a fallback", async () => {
  const fetchers: typeof fetch[] = [
    async () => new Response("rate limited", {status: 429}),
    async () => new Response("unavailable", {status: 503}),
    async () => {throw new Error("timeout");},
    async () => new Response("not json"), async () => Response.json({}),
    async () => new Response("x".repeat(2_000_001)), provider([]),
  ];
  for (const fetcher of fetchers) await assert.rejects(retrieveEvidence("stroke", {fetch: fetcher}));
  await assert.rejects(retrieveEvidence("x"), /query/);
});

test("schema accepts evidence drafts and rejects extra fields, malformed source IDs and excessive citations", async () => {
  const job = await draft(); assertJobSchema(job);
  for (const mutate of [
    (j: VideoJob) => {j.evidence!.sources[0].id = "invented";},
    (j: VideoJob) => {j.scenes[0].citations = ["a", "b", "c", "d"];},
    (j: VideoJob) => {Object.assign(j.evidence!, {verified: true});},
  ]) {const changed = structuredClone(job); mutate(changed); assert.throws(() => assertJobSchema(changed));}
});

test("citation graph rejects unknown IDs, absent coverage, duplicate IDs, orphan and fabricated excerpts", async () => {
  const mutations: Array<(j: VideoJob) => void> = [
    (j) => {j.scenes[0].citations = ["invented"];},
    (j) => {delete j.scenes[0].citations;},
    (j) => {j.scenes[0].citations!.push("pubmed-12345678");},
    (j) => {j.evidence!.sources.push(j.evidence!.sources[0]);},
    (j) => {j.scenes[1].id = j.scenes[0].id;},
    (j) => {j.evidence!.sources[0].url = "http://localhost/private";},
    (j) => {delete j.scenes[0].evidenceExcerpts;},
    (j) => {j.scenes[0].evidenceExcerpts![0].excerpt = "A completely fabricated claim not in the source abstract.";},
    (j) => {j.scenes[0].evidenceExcerpts![0].excerpt = "This";},
    (j) => {j.scenes[0].evidenceExcerpts!.push({sourceId: "unlinked", excerpt: record.abstractText});},
  ];
  for (const mutate of mutations) {const job = await draft(); mutate(job); assert.throws(() => assertCitationLinks(job));}
});

test("online validation resolves PMID identities and checks metadata, not just the existence of a URL", async () => {
  const job = await draft(); const original = JSON.stringify(job);
  const validated = await validateEvidence(job, {fetch: async (input) => {
    assert.equal(new URL(String(input)).searchParams.get("query"), "SRC:MED AND (EXT_ID:12345678)");
    return response();
  }});
  assertValidatedEvidence(validated);
  assert.equal(JSON.stringify(job), original);
  assert.equal(validated.review?.factual, "pending");
  assert.equal(validated.approvals.brief, "pending");
  for (const records of [[], [{...record, title: "Changed title"}], [{...record, isRetracted: "Y"}], [{...record, doi: "10.1234/different"}]]) {
    await assert.rejects(validateEvidence(job, {fetch: provider(records)}), /missing, flagged, or differs/);
  }
});

test("matching abstracts are not clinical approval; both human reviews and content snapshots are required", async () => {
  const job = await validateEvidence(await draft(), dependencies);
  assert.throws(() => assertRequiredReviews(job), /Factual review/);
  job.review!.factual = "approved";
  assert.throws(() => assertRequiredReviews(job), /Clinical review/);
  job.review!.clinical = "approved";
  assert.throws(() => assertRequiredReviews(job), /Reviewed content changed/);
  approveMedicalReview(job); assertRequiredReviews(job);
  const unvalidated = await draft();
  assert.throws(() => approveMedicalReview(unvalidated), /unvalidated/);
});

test("content, narration, citations, metadata and visual prompt edits invalidate approval", async () => {
  const original = await approved();
  const mutations: Array<(j: VideoJob) => void> = [
    (j) => {j.scenes[0].body += " changed";}, (j) => {j.scenes[0].voiceover += " changed";},
    (j) => {j.scenes[0].heading += " changed";}, (j) => {j.scenes[0].citations = [];},
    (j) => {j.evidence!.sources[0].abstract += " changed";}, (j) => {j.title += " changed";},
    (j) => {j.audience += " changed";}, (j) => {j.scenes[0].visual!.prompt += " changed";},
    (j) => {delete j.review;}, (j) => {delete j.evidence;},
  ];
  for (const mutate of mutations) {const job = structuredClone(original); mutate(job); assert.throws(() => assertRequiredReviews(job));}
  // Adding generated assets does not change the approved script or evidence.
  const enriched = structuredClone(original); enriched.scenes[0].visual!.source = "generated.mp4";
  assertRequiredReviews(enriched);
});

test("stale, future and invalid timestamps fail closed", async () => {
  const job = await validateEvidence(await draft(), dependencies);
  assert.throws(() => assertValidatedEvidence(job, now.getTime() + EVIDENCE_MAX_AGE_MS + 1), /stale/);
  for (const checkedAt of ["invalid", new Date(now.getTime() + 120_000).toISOString()]) {
    job.evidence!.validation!.checkedAt = checkedAt;
    assert.throws(() => assertValidatedEvidence(job, now.getTime()), /timestamp/);
  }
});

test("refresh removes scene links and resets every approval, including paid generation and publishing", async () => {
  const job = await approved(); job.approvals.paidGeneration = "approved"; job.approvals.publish = "approved";
  const refreshed = attachEvidence(job, job.evidence!);
  assert.equal(refreshed.evidence!.validation, undefined);
  assert.equal(refreshed.review?.contentSnapshot, undefined);
  assert.deepEqual(Object.values(refreshed.approvals), ["pending", "pending", "pending"]);
  assert.equal(refreshed.scenes[0].citations, undefined);
  assert.equal(refreshed.scenes[0].evidenceExcerpts, undefined);
});

test("medical legacy jobs cannot bypass reviews; general jobs retain text rendering", async () => {
  const sample = JSON.parse(await readFile("jobs/sample-job.json", "utf8")) as VideoJob;
  delete sample.review; sample.approvals.brief = "approved";
  assert.throws(() => assertRenderReady(sample), /Factual review/);
  assert.throws(() => MainVideo(sample), /Factual review/);
  const {job} = await generateJob({prompt: "A video about solar eclipses"});
  job.approvals.brief = "approved";
  assert.doesNotThrow(() => MainVideo(job));
  const reviewed = await approved(); assert.doesNotThrow(() => MainVideo(reviewed));
  assert.deepEqual(citationLabels(reviewed, reviewed.scenes[0]), ["PMID 12345678 · 2025"]);
});

test("factory refuses combined evidence/approval operations before any network or write", () => {
  const combinations = [
    ['stroke treatment', '--evidence', '--approve-review'],
    ['--job=missing.json', '--validate-evidence', '--approve-brief'],
    ['--job=missing.json', '--evidence', '--render'],
    ['--job=missing.json', '--evidence', '--assets'],
    ['--job=missing.json', '--evidence', '--validate-evidence'],
    ['stroke treatment', '--validate-evidence'],
    ['stroke treatment', '--approve-review'],
  ];
  for (const args of combinations) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/factory.ts', ...args], {encoding: 'utf8'});
    assert.equal(result.status, 1); assert.doesNotMatch(result.stderr, /ENOENT|fetch failed/);
  }
});

test("plan, assets and publishing entrypoints reject medical jobs without review before contacting providers", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'video-evidence-'));
  try {
    const job = await draft();
    job.approvals = {brief: 'approved', paidGeneration: 'approved', publish: 'approved'};
    const filename = path.join(dir, 'job.json'); await writeFile(filename, JSON.stringify(job));
    for (const action of ['plan', 'assets', 'publish']) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/orchestrator.ts', action, filename], {
        encoding: 'utf8', env: {...process.env, ALLOW_PAID_GENERATION: 'true', ALLOW_PUBLISHING: 'true'},
      });
      assert.equal(result.status, 1); assert.match(result.stderr, /Factual review/);
    }
  } finally {await rm(dir, {recursive: true, force: true});}
});

test("an invented DOI is rejected even when the canonical record has no DOI", async () => {
  const withoutDoi = {...record, doi: undefined};
  const job = await draft();
  await assert.rejects(validateEvidence(job, {fetch: provider([withoutDoi])}), /differs/);
});

test("AI director gets retrieved sources and returns unvalidated scene citations without approving them", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY; const oldEnabled = process.env.ALLOW_AI_SCRIPTING;
  process.env.OPENAI_API_KEY = "test-not-a-real-key"; process.env.ALLOW_AI_SCRIPTING = "true";
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "www.ebi.ac.uk") return response();
    assert.equal(url.hostname, "api.openai.com"); aiCalls++;
    const body = JSON.parse(String(init?.body));
    assert.match(body.input, /pubmed-12345678/); assert.match(body.instructions, /untrusted source data/);
    const scene = {heading: "Synthetic stroke fixture", body: "Review the test record.", voiceover: "Review the test record.", assetPrompt: "Neutral test visual",
      citations: ["pubmed-12345678"], evidenceExcerpts: [{sourceId: "pubmed-12345678", excerpt: record.abstractText}]};
    return Response.json({id: "resp_test", object: "response", output: [{type: "message", role: "assistant", content: [{type: "output_text", text: JSON.stringify({title: "Synthetic stroke fixture", objective: "Exercise the source-grounded director", scenes: [scene, scene]})}]}]});
  };
  try {
    const {job} = await generateJob({prompt: "Stroke evidence test", retrieveEvidence: true, useAi: true});
    assert.equal(aiCalls, 1); assertJobSchema(job); assertCitationLinks(job);
    assert.equal(job.evidence?.validation, undefined); assert.equal(job.review?.clinical, "pending");
    assert.deepEqual(Object.values(job.approvals), ["pending", "pending", "pending"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldEnabled === undefined) delete process.env.ALLOW_AI_SCRIPTING; else process.env.ALLOW_AI_SCRIPTING = oldEnabled;
  }
});
