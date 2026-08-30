import type {VideoJob, VideoScene} from "./types.js";

export const EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const normalizeExcerpt = (text: string) => text.replace(/\s+/g, " ").trim();

// Snapshots detect edits; they are not signatures or proof of reviewer identity.
export const evidenceSnapshot = (job: VideoJob): string => JSON.stringify({
  provider: job.evidence?.provider, query: job.evidence?.query,
  retrievedAt: job.evidence?.retrievedAt, sources: job.evidence?.sources,
  scenes: job.scenes.map(({id, heading, body, voiceover, citations, evidenceExcerpts}) =>
    ({id, heading, body, voiceover, citations, evidenceExcerpts})),
});

export const assertCitationLinks = (job: VideoJob) => {
  const sources = job.evidence?.sources;
  if (!sources?.length) throw new Error("Retrieve evidence before validating citations.");
  const ids = sources.map((source) => source.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate evidence source IDs.");
  const dois = sources.flatMap((source) => source.doi ? [source.doi.toLowerCase()] : []);
  if (new Set(dois).size !== dois.length) throw new Error("Duplicate evidence DOIs.");
  if (new Set(job.scenes.map((scene) => scene.id)).size !== job.scenes.length) throw new Error("Duplicate scene IDs.");
  for (const source of sources) {
    if (!/^[1-9]\d{0,8}$/.test(source.pmid) || source.id !== `pubmed-${source.pmid}` || source.url !== `https://pubmed.ncbi.nlm.nih.gov/${source.pmid}/`) {
      throw new Error(`Invalid canonical source identity: ${source.id}`);
    }
  }
  for (const scene of job.scenes) {
    if (!scene.citations?.length) throw new Error(`Scene ${scene.id} needs at least one citation.`);
    if (scene.citations.length > 3) throw new Error(`Scene ${scene.id} supports at most three citations for readable overlays.`);
    if (new Set(scene.citations).size !== scene.citations.length) throw new Error(`Duplicate citation in scene ${scene.id}.`);
    for (const id of scene.citations) {
      const source = sources.find((item) => item.id === id);
      if (!source) throw new Error(`Unknown citation ${id} in scene ${scene.id}.`);
      const excerpts = scene.evidenceExcerpts?.filter((item) => item.sourceId === id);
      if (!excerpts?.length) throw new Error(`Missing supporting excerpt for ${id} in scene ${scene.id}.`);
      for (const {excerpt} of excerpts) {
        const normalized = normalizeExcerpt(excerpt);
        if (normalized.length < 20 || !normalizeExcerpt(source.abstract).includes(normalized)) {
          throw new Error(`Excerpt does not match the retrieved abstract for ${id} in scene ${scene.id}.`);
        }
      }
    }
    if (scene.evidenceExcerpts?.some((item) => !scene.citations?.includes(item.sourceId))) throw new Error(`Unlinked excerpt in scene ${scene.id}.`);
  }
};

export const assertValidatedEvidence = (job: VideoJob, now = Date.now()) => {
  assertCitationLinks(job);
  const validation = job.evidence?.validation;
  if (!validation || validation.snapshot !== evidenceSnapshot(job)) throw new Error("Evidence is unvalidated or changed. Run --validate-evidence, then review the saved job.");
  for (const timestamp of [validation.checkedAt, job.evidence!.retrievedAt]) {
    const age = now - Date.parse(timestamp);
    if (!Number.isFinite(age) || age < -60_000 || age > EVIDENCE_MAX_AGE_MS) throw new Error("Evidence is stale or has an invalid timestamp. Refresh evidence and repeat review.");
  }
};

export const citationLabels = (job: VideoJob, scene: VideoScene): string[] => (scene.citations ?? []).map((id) => {
  const source = job.evidence?.sources.find((item) => item.id === id);
  return source ? `PMID ${source.pmid} · ${source.year}` : id;
});
