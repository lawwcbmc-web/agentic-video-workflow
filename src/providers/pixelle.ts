import type {VideoJob, VideoScene} from "../types.js";

type PixelleVideoResponse = {
  success?: boolean;
  message?: string;
  video_url: string;
  duration: number;
  file_size: number;
};

export type PixelleGenerationResult = {
  source: string;
  durationSeconds: number;
  requestId?: string;
};

const requireConfig = () => {
  const baseUrl = process.env.PIXELLE_API_URL?.replace(/\/$/, "");
  const frameTemplate = process.env.PIXELLE_FRAME_TEMPLATE;
  if (!baseUrl) throw new Error("PIXELLE_API_URL is required for Pixelle generation.");
  if (!frameTemplate) throw new Error("PIXELLE_FRAME_TEMPLATE is required for Pixelle generation.");
  return {baseUrl, frameTemplate};
};

export const generatePixelleSceneVideo = async (job: VideoJob, scene: VideoScene): Promise<PixelleGenerationResult> => {
  const {baseUrl, frameTemplate} = requireConfig();
  const headers: Record<string, string> = {"content-type": "application/json"};
  if (process.env.PIXELLE_API_KEY) headers.authorization = `Bearer ${process.env.PIXELLE_API_KEY}`;

  const text = scene.voiceover?.trim() || scene.body.trim();
  const response = await fetch(`${baseUrl}/api/video/generate/sync`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      mode: "fixed",
      title: scene.heading,
      n_scenes: 1,
      video_fps: job.format.fps,
      frame_template: frameTemplate,
      media_workflow: process.env.PIXELLE_MEDIA_WORKFLOW || undefined,
      tts_workflow: process.env.PIXELLE_TTS_WORKFLOW || undefined,
      prompt_prefix: scene.visual?.prompt || scene.assetPrompt || undefined,
      bgm_volume: 0
    })
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`Pixelle generation failed (${response.status}): ${raw.slice(0, 500)}`);
  const result = JSON.parse(raw) as PixelleVideoResponse;
  if (!result.video_url) throw new Error("Pixelle response did not include video_url.");

  return {
    source: result.video_url,
    durationSeconds: result.duration
  };
};
