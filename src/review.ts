import type {VideoJob} from "./types.js";
import {assertValidatedEvidence} from "./citations.js";

const medicalTerms = /\b(stroke|thrombolysis|thrombectomy|tenecteplase|alteplase|tnk|tpa|migraine|seizure|epilep\w*|neurolog\w*|medical|clinical|patient\w*|diagnos\w*|treatment|therapy|drug|dose|disease|syndrome|hospital|emergency|blood pressure|diabetes|hypertension)\b/i;
export const isMedicalTopic = (text: string): boolean => medicalTerms.test(text);
export const requiresMedicalReview = (job: VideoJob): boolean => Boolean(job.review || job.evidence || isMedicalTopic(
  [job.title, job.objective, job.audience, ...job.scenes.flatMap((scene) => [scene.heading, scene.body, scene.voiceover ?? "", scene.assetPrompt ?? "", scene.visual?.prompt ?? ""])].join(" ")
));

export const reviewSnapshot = (job: VideoJob): string => JSON.stringify({
  title: job.title, objective: job.objective, audience: job.audience, evidence: job.evidence,
  scenes: job.scenes.map(({id, heading, body, voiceover, assetPrompt, visual, citations, evidenceExcerpts}) =>
    ({id, heading, body, voiceover, assetPrompt, visualPrompt: visual?.prompt, citations, evidenceExcerpts})),
});

export const approveMedicalReview = (job: VideoJob) => {
  if (!requiresMedicalReview(job)) return;
  assertValidatedEvidence(job);
  job.review = {factual: "approved", clinical: "approved", contentSnapshot: reviewSnapshot(job)};
};

export const assertRequiredReviews = (job: VideoJob) => {
  if (!requiresMedicalReview(job)) return;
  if (job.review?.factual !== "approved") throw new Error("Factual review is not approved.");
  if (job.review.clinical !== "approved") throw new Error("Clinical review is not approved.");
  assertValidatedEvidence(job);
  if (job.review.contentSnapshot !== reviewSnapshot(job)) throw new Error("Reviewed content changed. Repeat factual and clinical review of the saved job.");
};

export const assertRenderReady = (job: VideoJob) => {
  if (job.approvals.brief !== "approved") throw new Error("Approve the brief before rendering.");
  assertRequiredReviews(job);
};
