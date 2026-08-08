export type ProviderResult = {
  provider: string;
  status: "placeholder";
  message: string;
};

export const requestHeyGenPresenter = async (): Promise<ProviderResult> => ({
  provider: "heygen",
  status: "placeholder",
  message: "HeyGen integration is intentionally disabled until paid-generation approval is verified.",
});

export const requestCanvaDesign = async (): Promise<ProviderResult> => ({
  provider: "canva",
  status: "placeholder",
  message: "Canva integration placeholder: replace with an OAuth-backed adapter.",
});

export const publishVideo = async (): Promise<ProviderResult> => ({
  provider: "publisher",
  status: "placeholder",
  message: "Publishing is intentionally disabled until publish approval is verified.",
});
