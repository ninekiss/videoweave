import json
from pathlib import Path

import httpx

from videoweave_api.core.config import Settings
from videoweave_api.infrastructure.execution.comfyui import ComfyUIAdapter


def test_comfyui_adapter_binds_i2v_inputs_and_downloads_video(tmp_path: Path) -> None:
    workflow = {
        "1": {"class_type": "CLIPTextEncode", "inputs": {"text": "default"}},
        "2": {"class_type": "KSampler", "inputs": {"seed": 0}},
        "3": {"class_type": "LoadImage", "inputs": {"image": "default.png"}},
    }
    (tmp_path / "i2v.json").write_text(json.dumps(workflow), encoding="utf-8")
    input_path = tmp_path / "reference.png"
    input_path.write_bytes(b"image-bytes")
    submitted: dict = {}
    routes: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        routes.append(request.url.path)
        if request.url.path == "/upload/image":
            return httpx.Response(200, json={"name": "uploaded.png", "subfolder": "", "type": "input"})
        if request.url.path == "/prompt":
            submitted.update(json.loads(request.content.decode("utf-8")))
            return httpx.Response(200, json={"prompt_id": "prompt-1", "number": 1})
        if request.url.path == "/history/prompt-1":
            return httpx.Response(
                200,
                json={
                    "prompt-1": {
                        "status": {"status_str": "success", "completed": True},
                        "outputs": {
                            "99": {
                                "gifs": [
                                    {"filename": "generated.mp4", "subfolder": "video", "type": "output"}
                                ]
                            }
                        },
                    }
                },
            )
        if request.url.path == "/view":
            return httpx.Response(200, content=b"fake-video-bytes")
        return httpx.Response(404)

    settings = Settings(
        COMFYUI_BASE_URL="http://comfy.test",
        COMFYUI_WORKFLOW_DIR=tmp_path,
        COMFYUI_POLL_SECONDS=0.01,
        COMFYUI_JOB_TIMEOUT_SECONDS=1,
    )
    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://comfy.test")
    adapter = ComfyUIAdapter(settings, client=client)

    result = adapter.execute(
        spec={
            "capability": "image-to-video",
            "prompt": "Wind moves through the grass",
            "seed": 123,
            "parameters": {},
            "resolution": {
                "engine": "comfyui",
                "workflow": {
                    "artifact_ref": "i2v.json",
                    "config": {
                        "bindings": {
                            "prompt": {"node_id": "1", "input": "text"},
                            "seed": {"node_id": "2", "input": "seed"},
                            "input_image": {"node_id": "3", "input": "image"},
                        }
                    },
                },
                "model": None,
            },
        },
        workdir=tmp_path,
        input_path=input_path,
    )

    assert submitted["prompt"]["1"]["inputs"]["text"] == "Wind moves through the grass"
    assert submitted["prompt"]["2"]["inputs"]["seed"] == 123
    assert submitted["prompt"]["3"]["inputs"]["image"] == "uploaded.png"
    assert result.external_id == "prompt-1"
    assert result.output_ref["filename"] == "generated.mp4"
    assert result.output_path.read_bytes() == b"fake-video-bytes"
    assert routes == ["/upload/image", "/prompt", "/history/prompt-1", "/view"]

    client.close()
