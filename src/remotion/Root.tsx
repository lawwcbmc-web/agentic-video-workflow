import React from "react";
import {Composition, type CalculateMetadataFunction} from "remotion";
import {MainVideo, type VideoJob} from "./Video.js";
import sample from "../../jobs/sample-job.json" with {type: "json"};

export const VideoRoot: React.FC = () => {
  const job = sample as VideoJob;
  const durationInFrames = Math.round(job.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) * job.format.fps);
  const calculateMetadata: CalculateMetadataFunction<VideoJob> = ({props}) => ({
    durationInFrames: Math.round(props.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) * props.format.fps),
    fps: props.format.fps,
    width: props.format.width,
    height: props.format.height,
  });

  return (
    <Composition
      id="MainVideo"
      component={MainVideo}
      durationInFrames={durationInFrames}
      fps={job.format.fps}
      width={job.format.width}
      height={job.format.height}
      defaultProps={job}
      calculateMetadata={calculateMetadata}
    />
  );
};
