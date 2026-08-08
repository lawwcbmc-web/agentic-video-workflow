import React from "react";
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from "remotion";

export type VideoJob = {
  title: string;
  format: {fps: number};
  scenes: Array<{id: string; durationSeconds: number; heading: string; body: string}>;
};

const Scene: React.FC<{heading: string; body: string; duration: number}> = ({heading, body, duration}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, duration - 12, duration], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <AbsoluteFill style={{background: "linear-gradient(145deg,#071b33,#0f6b78)", color: "white", justifyContent: "center", padding: 90, opacity}}>
      <div style={{fontFamily: "Arial, sans-serif", fontSize: 78, fontWeight: 800, lineHeight: 1.05}}>{heading}</div>
      <div style={{fontFamily: "Arial, sans-serif", fontSize: 42, lineHeight: 1.35, marginTop: 36}}>{body}</div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC<VideoJob> = ({scenes, format}) => {
  let cursor = 0;
  return (
    <AbsoluteFill>
      {scenes.map((scene) => {
        const duration = Math.round(scene.durationSeconds * format.fps);
        const from = cursor;
        cursor += duration;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={duration}>
            <Scene heading={scene.heading} body={scene.body} duration={duration} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
