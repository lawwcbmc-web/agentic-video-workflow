import {spawnSync} from "node:child_process";

const result = spawnSync("ffmpeg", ["-version"], {encoding: "utf8"});
if (result.error || result.status !== 0) {
  console.error("FFmpeg is required. Install it, then rerun npm run check:ffmpeg.");
  process.exit(1);
}
console.log(result.stdout.split("\n")[0]);
