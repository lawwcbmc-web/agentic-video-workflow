import OpenAI from "openai";
import type {VideoJob} from "./types.js";
import {isMedicalTopic} from "./review.js";

export type PromptRequest = {prompt: string; audience?: string; durationSeconds?: number; aspectRatio?: "vertical" | "landscape"; useAi?: boolean};
type ScenePlan = {title: string; objective: string; scenes: Array<{heading: string; body: string; voiceover: string; assetPrompt: string}>};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "prompt-video";
const outputSchema = {
  type: "object", additionalProperties: false, required: ["title", "objective", "scenes"],
  properties: {
    title: {type: "string"}, objective: {type: "string"},
    scenes: {type: "array", minItems: 2, maxItems: 8, items: {type: "object", additionalProperties: false,
      required: ["heading", "body", "voiceover", "assetPrompt"],
      properties: {heading: {type: "string"}, body: {type: "string"}, voiceover: {type: "string"}, assetPrompt: {type: "string"}}}}
  }
} as const;

const assembleJob = (request: PromptRequest, content: ScenePlan): VideoJob => {
  const total = Math.min(90, Math.max(10, request.durationSeconds ?? 30));
  const perScene = total / content.scenes.length;
  const vertical = request.aspectRatio !== "landscape";
  const medical = isMedicalTopic(`${request.prompt} ${content.title} ${content.objective}`);
  return {
    id: `${slugify(content.title)}-${Date.now().toString(36)}`,
    title: content.title,
    objective: content.objective,
    audience: request.audience?.trim() || "General audience",
    format: vertical ? {width: 1080, height: 1920, fps: 30} : {width: 1920, height: 1080, fps: 30},
    providers: {presenter: "none", design: "none", media: "pixelle", voice: "pixelle"},
    scenes: content.scenes.map((scene, index) => ({
      id: `scene-${index + 1}`,
      durationSeconds: perScene,
      ...scene,
      visual: {type: "image", prompt: scene.assetPrompt, provider: "pixelle"},
      audio: {provider: "pixelle"},
      generation: {status: "pending"}
    })),
    ...(medical ? {review: {factual: "pending" as const, clinical: "pending" as const}} : {}),
    approvals: {brief: "pending", paidGeneration: "pending", publish: "pending"}
  };
};

const demoDirector = (request: PromptRequest): VideoJob => {
  const clean = request.prompt.trim().replace(/\s+/g, " ");
  const topic = clean.replace(/^(create|make|produce)\s+(a\s+)?(short\s+)?(video\s+)?(about|on|explaining)?\s*/i, "") || clean;
  return assembleJob(request, {title: topic.slice(0, 72), objective: `Create a clear, concise introductory video about ${topic}.`, scenes: [
    {heading: topic, body: "Why this matters", voiceover: `Here is a quick introduction to ${topic}.`, assetPrompt: `Clean editorial visual representing ${topic}`},
    {heading: "Key idea", body: "Focus on the most useful takeaway.", voiceover: "Understand the main idea and why it is useful.", assetPrompt: `Simple explanatory graphic for ${topic}`},
    {heading: "Next step", body: "Review, verify, and take appropriate action.", voiceover: "Review the information carefully and choose the appropriate next step.", assetPrompt: `Confident closing visual related to ${topic}`}
  ]});
};

export const generateJob = async (request: PromptRequest): Promise<{job: VideoJob; mode: "demo" | "openai"}> => {
  if (!request.prompt?.trim() || request.prompt.trim().length < 8) throw new Error("Please enter a more descriptive prompt.");
  if (!request.useAi) return {job: demoDirector(request), mode: "demo"};
  if (process.env.ALLOW_AI_SCRIPTING !== "true") throw new Error("AI scripting is disabled. Set ALLOW_AI_SCRIPTING=true on the server.");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    instructions: "You are a concise video director. Return factual, accessible scenes. Do not invent statistics, citations, diagnoses, or claims. For medical topics, avoid individualized treatment advice and write for subsequent clinician review.",
    input: `Create a ${request.durationSeconds ?? 30}-second ${request.aspectRatio ?? "vertical"} video for ${request.audience || "a general audience"}. Prompt: ${request.prompt}`,
    text: {format: {type: "json_schema", name: "video_scene_plan", strict: true, schema: outputSchema}}
  });
  if (!response.output_text) throw new Error("The AI director returned no structured output.");
  return {job: assembleJob(request, JSON.parse(response.output_text) as ScenePlan), mode: "openai"};
};
