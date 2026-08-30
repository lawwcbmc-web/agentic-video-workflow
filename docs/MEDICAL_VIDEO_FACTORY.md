# Medical Video Factory

The `create` command turns one topic into a validated video job. Medical topics are automatically marked for factual and clinical review.

## 1. Create a safe draft

```bash
npm run create -- "TNK vs alteplase in acute ischemic stroke" --ai --duration=60 --audience="Stroke clinicians"
```

This writes `out/jobs/<job-id>.json`. For medical topics, `review.factual` and `review.clinical` are both `pending`.

Approval flags are deliberately rejected during first-generation mode: the generated script must be saved and reviewed before it can be approved.

## 2. Render the reviewed draft

After reviewing the exact saved job file, resume that same job:

```bash
npm run create -- --job=out/jobs/<job-id>.json --approve-brief --approve-review --render
```

This renders a deterministic text-first Remotion video even if Pixelle is not configured.

## 3. Render with Pixelle assets

Pixelle generation remains separately gated. Configure `PIXELLE_API_URL`, `PIXELLE_FRAME_TEMPLATE`, and any required provider settings, then explicitly enable external generation:

```bash
ALLOW_PAID_GENERATION=true npm run create -- --job=out/jobs/<job-id>.json --approve-brief --approve-review --approve-paid --assets --render
```

`--approve-paid` records per-job approval. `ALLOW_PAID_GENERATION=true` is the independent environment gate. Both are required.

## Flags

- `--job=...`: resume the exact saved job that was reviewed.
- `--ai`: use the configured OpenAI director; requires `ALLOW_AI_SCRIPTING=true` and `OPENAI_API_KEY`.
- `--duration=N`: target 10-90 seconds during draft generation.
- `--audience=...`: set intended audience during draft generation.
- `--landscape`: render 1920x1080 instead of 1080x1920 during draft generation.
- `--approve-brief`: approve the saved brief after human review.
- `--approve-review`: approve factual and clinical review for detected medical topics.
- `--approve-paid`: approve external asset generation for this saved job.
- `--assets`: ask Pixelle to generate scene assets.
- `--render`: render the final MP4.

The command does not claim to perform literature research or generate verified citations. Medical factual review remains a human responsibility until a separate evidence-retrieval and citation-validation layer is implemented.
