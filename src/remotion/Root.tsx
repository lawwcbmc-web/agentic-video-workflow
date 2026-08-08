import React from "react";
import {Composition} from "remotion";
import {MainVideo, type VideoJob} from "./Video.js";
import sample from "../../jobs/sample-job.json";

export const VideoRoot: React.FC = () => {
  const job = sample as VideoJob;
  const durationInFrames = Math.round(job.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) * job.format.fps);

  return (
    <Composition
      id="MainVideo"
      component={MainVideo}
      durationInFrames={durationInFrames}
      fps={job.format.fps}
      width={job.format.width}
      height={job.format.height}
      defaultProps={job}
    />
  );
};
