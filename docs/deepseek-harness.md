# DeepSeek Harness integration

This repository can use DeepSeek as an alternative AI planning backend while keeping the existing OpenAI path intact.

## Recommended harness

Use the TypeScript/MCP distribution of `deepseek-harness`:

```bash
npx -y @deepseek-harness/mcp
```

The upstream project documents protocol-aware handling for DeepSeek V4-Pro / V4-Flash, including reasoning-content preservation, tool-call streaming aggregation, token limits, and schema validation.

Upstream: `HenryZ838978/deepseek-harness`

## Local configuration

Add a DeepSeek API key to your local `.env` file. Do not commit real keys.

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=
DEEPSEEK_HARNESS_ENABLED=false
```

Keep `DEEPSEEK_HARNESS_ENABLED=false` until the MCP process is configured locally and tested.

## Why this is separate from the video renderer

The harness is intended for the agent/director layer: prompt planning, structured scene generation, and tool orchestration. Remotion remains responsible for deterministic video rendering.

## Suggested next implementation step

Add an adapter in `src/providers.ts` that selects between:

- existing OpenAI director
- DeepSeek Harness MCP director
- demo director

The application should fail closed to the current provider if the DeepSeek harness is disabled or unavailable.
