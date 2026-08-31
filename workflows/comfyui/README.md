# ComfyUI workflow artifacts

This directory contains ComfyUI workflows exported in **API format** for VideoWeave execution.

`WorkflowDefinition.artifact_ref` is resolved relative to this directory (or `COMFYUI_WORKFLOW_DIR` when configured). Absolute paths and path traversal are rejected by the adapter.

## Registry contract

A ComfyUI workflow is registered with:

- `engine = "comfyui"`
- `artifact_ref` pointing to an API-format JSON file under this directory
- `config.bindings` describing where stable GenerationSpec fields enter the graph

Example workflow config:

```json
{
  "bindings": {
    "prompt": { "node_id": "6", "input": "text" },
    "negative_prompt": { "node_id": "7", "input": "text" },
    "seed": { "node_id": "3", "input": "seed" },
    "input_image": { "node_id": "10", "input": "image" },
    "model": { "node_id": "1", "input": "ckpt_name" }
  },
  "parameter_bindings": {
    "steps": { "node_id": "3", "input": "steps" },
    "cfg": { "node_id": "3", "input": "cfg" }
  }
}
```

P0 requirements:

- T2V workflows must bind `prompt` and `seed`.
- I2V workflows must additionally bind `input_image`.
- `negative_prompt`, `model`, and arbitrary `parameter_bindings` are optional.
- The workflow must produce a video file that ComfyUI exposes through its normal history/output records.

VideoWeave does not construct model-specific ComfyUI graphs in API routes or product code. The workflow artifact remains executor-specific; Jobs only snapshot the selected workflow/model plus stable GenerationSpec values.

## Execution path

```text
GenerationSpec
→ Registry resolution
→ Job snapshot
→ ComfyUIAdapter
→ upload input image (I2V only)
→ POST /prompt
→ poll /history/{prompt_id}
→ GET /view
→ S3 VIDEO Asset
→ AssetLineage (when an input Asset exists)
```
