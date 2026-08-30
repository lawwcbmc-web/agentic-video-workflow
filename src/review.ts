import type {VideoJob} from "./types.js";

const medicalTerms = /\b(stroke|thrombolysis|thrombectomy|tenecteplase|alteplase|tnk|tpa|migraine|seizure|epilep|neurolog|medical|clinical|patient|diagnos|treatment|therapy|drug|dose|disease|syndrome|hospital|emergency|blood pressure|diabetes|hypertension)\b/i;

export const isMedicalTopic = (text: string): boolean => medicalTerms.test(text);

export const assertRequiredReviews = (job: VideoJob) => {
  if (!job.review) return;
  if (job.review.factual !== "approved") throw new Error("Factual review is not approved.");
  if (job.review.clinical !== "approved") throw new Error("Clinical review is not approved.");
};
