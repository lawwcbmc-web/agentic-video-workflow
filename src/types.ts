export type Approval = "pending" | "approved" | "rejected";
export type VisualType = "text" | "image" | "video" | "chart" | "presenter";
export type AssetProvider = "none" | "pixelle" | "local" | "heygen" | "canva";

export type SceneVisual = {
  type: VisualType;
  prompt?: string;
  source?: string;
  provider?: AssetProvider;
};

export type SceneAudio = {
  source?: string;
  provider?: "none" | "pixelle" | "local";
};

export type GenerationState = {
  status: "pending" | "generated" | "failed";
  requestId?: string;
  estimatedCostUsd?: number;
  error?: string;
};

export type VideoScene = {
  id: string;
  durationSeconds: number;
  heading: string;
  body: string;
  voiceover?: string;
  assetPrompt?: string;
  visual?: SceneVisual;
  audio?: SceneAudio;
  citations?: string[];
  generation?: GenerationState;
};

export type VideoJob = {
  id: string;
  title: string;
  objective: string;
  audience: string;
  format: {width: number; height: number; fps: number};
  scenes: VideoScene[];
  providers?: {
    presenter?: "none" | "heygen-placeholder";
    design?: "none" | "canva-placeholder";
    media?: "none" | "pixelle";
    voice?: "none" | "pixelle";
  };
  approvals: {
    brief: Approval;
    paidGeneration: Approval;
    publish: Approval;
  };
};
