# Medical Video Factory

The `create` command turns one topic into a validated video job and can optionally generate Pixelle assets and render the final Remotion MP4.

## Safe draft

```bash
npm run create -- "TNK vs alteplase in acute ischemic stroke" --ai --duration=60 --audience="Stroke clinicians"
```

This writes `out/jobs/<job-id>.json`. Medical topics are automatically marked with factual and clinical review states set to `pending`.

## Render after review

After reviewing the generated script and approving the brief and medical content:

```bash
npm run create -- "TNK vs alteplase in acute ischemic stroke" --ai --duration=60 --audience="Stroke clinicians" --approve-brief --approve-review --render
```

This renders a deterministic text-first Remotion video even if Pixelle is not configured.

## Render with Pixelle assets

Pixelle generation remains separately gated. Configure `PIXELLE_API_URL`, `PIXELLE_FRAME_TEMPLATE`, and any required provider settings, then explicitly enable paid/external generation:

```bash
ALLOW_PAID_GENERATION=true npm run create -- "TNK vs alteplase in acute ischemic stroke" --ai --duration=60 --audience="Stroke clinicians" --approve-brief --approve-review --approve-paid --assets --render
```

`--approve-paid` records job approval. `ALLOW_PAID_GENERATION=true` is the independent environment gate. Both are required.

## Flags

- `--ai`: use the configured OpenAI director; requires `ALLOW_AI_SCRIPTING=true` and `OPENAI_API_KEY`.
- `--duration=N`: target 10-90 seconds.
- `--audience=...`: set intended audience.
- `--landscape`: render 1920x1080 instead of 1080x1920.
- `--approve-brief`: mark the generated brief approved after human review.
- `--approve-review`: approve factual and clinical review for detected medical topics.
- `--approve-paid`: approve external asset generation for this job.
- `--assets`: ask Pixelle to generate scene assets.
- `--render`: render the final MP4.

The command does not claim to perform literature research or generate verified citations. Medical factual review remains a human responsibility until a separate evidence-retrieval and citation-validation layer is implemented.
