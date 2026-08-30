import assert from "node:assert/strict";
import {generateJob} from "./generator.js";

const {job, mode} = await generateJob({prompt: "Create a short video about recognising stroke FAST", audience: "General public", durationSeconds: 30});
assert.equal(mode, "demo");
assert.equal(job.scenes.length, 3);
assert.equal(job.approvals.brief, "pending");
assert.equal(job.approvals.paidGeneration, "pending");
assert.equal(job.approvals.publish, "pending");
assert.equal(job.scenes.reduce((total, scene) => total + scene.durationSeconds, 0), 30);
assert.equal(job.providers?.media, "pixelle");
assert.equal(job.providers?.voice, "pixelle");
assert.equal(job.scenes[0]?.visual?.provider, "pixelle");
assert.equal(job.scenes[0]?.visual?.type, "image");
assert.equal(job.scenes[0]?.generation?.status, "pending");
console.log("Prompt generator test passed");
