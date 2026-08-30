import React from "react";
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from "remotion";
import {assertRenderReady} from "../review.js";
import {assertJobSchema} from "../validation.js";
import {citationLabels} from "../citations.js";
import type {VideoJob, VideoScene} from "../types.js";

const resolveAssetSource = (source?: string) => {
  if (!source) return undefined;
  if (/^(https?:|data:|blob:)/i.test(source)) return source;
  return staticFile(source.replace(/^\/+/, ""));
};

const TextOverlay: React.FC<{heading: string; body: string; duration: number; citations: string[]}> = ({heading, body, duration, citations}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, Math.max(12, duration - 12), duration], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <AbsoluteFill style={{justifyContent: "flex-end", padding: 90, opacity, background: "linear-gradient(180deg,transparent 35%,rgba(0,0,0,.78))", color: "white"}}>
      <div style={{fontFamily: "Arial, sans-serif", fontSize: 78, fontWeight: 800, lineHeight: 1.05}}>{heading}</div>
      <div style={{fontFamily: "Arial, sans-serif", fontSize: 42, lineHeight: 1.35, marginTop: 36}}>{body}</div>
      {citations.length ? <div style={{fontFamily: "Arial, sans-serif", fontSize: 26, lineHeight: 1.4, marginTop: 24}}>Sources: {citations.join("; ")}</div> : null}
    </AbsoluteFill>
  );
};

const Scene: React.FC<{scene: VideoScene; duration: number; citations: string[]}> = ({scene, duration, citations}) => {
  const visualSource = resolveAssetSource(scene.visual?.source);
  const audioSource = resolveAssetSource(scene.audio?.source);
  const visualType = scene.visual?.type ?? "text";

  return (
    <AbsoluteFill style={{background: "linear-gradient(145deg,#071b33,#0f6b78)"}}>
      {visualSource && visualType === "image" ? (
        <Img src={visualSource} style={{width: "100%", height: "100%", objectFit: "cover"}} />
      ) : null}
      {visualSource && (visualType === "video" || visualType === "presenter") ? (
        <OffthreadVideo src={visualSource} style={{width: "100%", height: "100%", objectFit: "cover"}} />
      ) : null}
      {audioSource ? <Audio src={audioSource} /> : null}
      <TextOverlay heading={scene.heading} body={scene.body} duration={duration} citations={citations} />
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC<VideoJob> = (job) => {
  assertJobSchema(job);
  assertRenderReady(job);
  const {scenes, format} = job;
  let cursor = 0;
  return (
    <AbsoluteFill>
      {scenes.map((scene) => {
        const duration = Math.round(scene.durationSeconds * format.fps);
        const from = cursor;
        cursor += duration;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={duration}>
            <Scene scene={scene} duration={duration} citations={citationLabels(job, scene)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
