from copy import deepcopy
import json
from pathlib import Path
import time
from typing import Any
from uuid import uuid4

import httpx

from videoweave_api.core.config import Settings
from videoweave_api.infrastructure.execution.base import ExecutionResult, StageCallback


class ComfyUIExecutionError(RuntimeError):
    pass


_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi", ".gif"}


class ComfyUIAdapter:
    """Execute API-format ComfyUI workflows without leaking graph details upward."""

    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self.settings = settings
        self._client = client

    def _workflow_path(self, artifact_ref: str) -> Path:
        relative = Path(artifact_ref)
        if relative.is_absolute():
            raise ComfyUIExecutionError("ComfyUI workflow artifact_ref must be relative")

        root = self.settings.comfyui_workflow_dir.resolve()
        path = (root / relative).resolve()
        if not path.is_relative_to(root):
            raise ComfyUIExecutionError("ComfyUI workflow artifact_ref escapes workflow directory")
        if not path.is_file():
            raise ComfyUIExecutionError(f"ComfyUI workflow not found: {artifact_ref}")
        return path

    def _load_workflow(self, artifact_ref: str) -> dict[str, Any]:
        path = self._workflow_path(artifact_ref)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ComfyUIExecutionError(f"invalid ComfyUI workflow JSON: {artifact_ref}") from exc

        if isinstance(payload, dict) and isinstance(payload.get("prompt"), dict):
            payload = payload["prompt"]
        if not isinstance(payload, dict) or not payload:
            raise ComfyUIExecutionError("ComfyUI workflow must be an API-format node graph")
        return deepcopy(payload)

    @staticmethod
    def _binding(config: dict, name: str) -> dict | None:
        bindings = config.get("bindings", {})
        if not isinstance(bindings, dict):
            raise ComfyUIExecutionError("workflow config bindings must be an object")
        binding = bindings.get(name)
        if binding is None:
            return None
        if not isinstance(binding, dict):
            raise ComfyUIExecutionError(f"workflow binding {name} must be an object")
        return binding

    @staticmethod
    def _apply_binding(workflow: dict, binding: dict | None, value: Any, name: str) -> None:
        if binding is None or value is None:
            return
        node_id = str(binding.get("node_id", ""))
        input_name = binding.get("input")
        if not node_id or not isinstance(input_name, str) or not input_name:
            raise ComfyUIExecutionError(f"workflow binding {name} requires node_id and input")
        node = workflow.get(node_id)
        if not isinstance(node, dict):
            raise ComfyUIExecutionError(f"workflow binding {name} references missing node {node_id}")
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            raise ComfyUIExecutionError(f"workflow node {node_id} has no inputs object")
        inputs[input_name] = value

    @staticmethod
    def _stage(callback: StageCallback | None, stage: str, progress: float) -> None:
        if callback is not None:
            callback(stage, progress)

    def _upload_image(self, client: httpx.Client, input_path: Path) -> str:
        with input_path.open("rb") as handle:
            response = client.post(
                "/upload/image",
                files={"image": (input_path.name, handle, "application/octet-stream")},
                data={"type": "input", "overwrite": "true"},
            )
        self._raise_for_status(response, "ComfyUI input upload failed")
        payload = response.json()
        name = payload.get("name")
        subfolder = payload.get("subfolder") or ""
        if not isinstance(name, str) or not name:
            raise ComfyUIExecutionError("ComfyUI input upload returned no file name")
        return f"{subfolder.rstrip('/')}/{name}".lstrip("/") if subfolder else name

    @staticmethod
    def _raise_for_status(response: httpx.Response, prefix: str) -> None:
        if response.is_success:
            return
        try:
            body = response.read()
            detail = body.decode("utf-8", errors="replace")[:4000].strip()
        except Exception:
            detail = ""
        raise ComfyUIExecutionError(
            f"{prefix}: HTTP {response.status_code}{': ' + detail if detail else ''}"
        )

    def _submit(self, client: httpx.Client, workflow: dict) -> str:
        response = client.post(
            "/prompt",
            json={"prompt": workflow, "client_id": f"videoweave-{uuid4()}"},
        )
        self._raise_for_status(response, "ComfyUI prompt submission failed")
        payload = response.json()
        prompt_id = payload.get("prompt_id")
        if not isinstance(prompt_id, str) or not prompt_id:
            node_errors = payload.get("node_errors")
            raise ComfyUIExecutionError(
                f"ComfyUI prompt submission returned no prompt_id: {node_errors or payload}"
            )
        return prompt_id

    @staticmethod
    def _history_entry(payload: dict, prompt_id: str) -> dict | None:
        entry = payload.get(prompt_id)
        if isinstance(entry, dict):
            return entry
        if isinstance(payload.get("outputs"), dict):
            return payload
        return None

    @staticmethod
    def _output_refs(entry: dict) -> list[dict]:
        refs: list[dict] = []

        def visit(value: Any) -> None:
            if isinstance(value, dict):
                if isinstance(value.get("filename"), str):
                    refs.append(
                        {
                            "filename": value["filename"],
                            "subfolder": value.get("subfolder", ""),
                            "type": value.get("type", "output"),
                        }
                    )
                    return
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)

        visit(entry.get("outputs", {}))
        return refs

    def _wait_for_output(self, client: httpx.Client, prompt_id: str) -> tuple[dict, dict]:
        deadline = time.monotonic() + self.settings.comfyui_job_timeout_seconds
        while time.monotonic() < deadline:
            response = client.get(f"/history/{prompt_id}")
            self._raise_for_status(response, "ComfyUI history request failed")
            payload = response.json()
            if not isinstance(payload, dict):
                raise ComfyUIExecutionError("ComfyUI history returned invalid JSON")

            entry = self._history_entry(payload, prompt_id)
            if entry is None:
                time.sleep(self.settings.comfyui_poll_seconds)
                continue

            status = entry.get("status", {}) if isinstance(entry.get("status"), dict) else {}
            status_str = str(status.get("status_str", "")).lower()
            if status_str in {"error", "failed", "cancelled", "canceled"}:
                raise ComfyUIExecutionError(f"ComfyUI execution ended with status {status_str}")

            refs = self._output_refs(entry)
            completed = bool(status.get("completed")) or status_str == "success"
            if completed:
                video_ref = next(
                    (
                        ref
                        for ref in refs
                        if Path(str(ref["filename"])).suffix.lower() in _VIDEO_EXTENSIONS
                    ),
                    None,
                )
                if video_ref is None:
                    raise ComfyUIExecutionError(
                        "ComfyUI workflow completed but produced no supported video output"
                    )
                return entry, video_ref

            time.sleep(self.settings.comfyui_poll_seconds)

        raise ComfyUIExecutionError("ComfyUI execution timed out")

    def _download_output(self, client: httpx.Client, ref: dict, workdir: Path) -> Path:
        filename = Path(str(ref["filename"])).name
        if not filename:
            raise ComfyUIExecutionError("ComfyUI output has an invalid filename")
        destination = workdir / filename
        with client.stream(
            "GET",
            "/view",
            params={
                "filename": ref["filename"],
                "subfolder": ref.get("subfolder", ""),
                "type": ref.get("type", "output"),
            },
        ) as response:
            self._raise_for_status(response, "ComfyUI output download failed")
            with destination.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)
        if not destination.exists() or destination.stat().st_size == 0:
            raise ComfyUIExecutionError("ComfyUI output download was empty")
        return destination

    def execute(
        self,
        *,
        spec: dict,
        workdir: Path,
        input_path: Path | None = None,
        on_stage: StageCallback | None = None,
    ) -> ExecutionResult:
        resolution = spec.get("resolution")
        if not isinstance(resolution, dict):
            raise ComfyUIExecutionError("generation spec has no execution resolution")
        workflow_snapshot = resolution.get("workflow")
        if not isinstance(workflow_snapshot, dict):
            raise ComfyUIExecutionError("generation spec has no workflow snapshot")

        artifact_ref = workflow_snapshot.get("artifact_ref")
        if not isinstance(artifact_ref, str) or not artifact_ref:
            raise ComfyUIExecutionError("ComfyUI workflow has no artifact_ref")
        config = workflow_snapshot.get("config", {})
        if not isinstance(config, dict):
            raise ComfyUIExecutionError("ComfyUI workflow config must be an object")

        self._stage(on_stage, "loading ComfyUI workflow", 0.12)
        workflow = self._load_workflow(artifact_ref)

        owned_client = self._client is None
        client = self._client or httpx.Client(
            base_url=self.settings.comfyui_base_url.rstrip("/"),
            timeout=self.settings.comfyui_request_timeout_seconds,
        )
        try:
            input_name: str | None = None
            if input_path is not None:
                self._stage(on_stage, "uploading input to ComfyUI", 0.2)
                input_name = self._upload_image(client, input_path)

            model_snapshot = resolution.get("model")
            model_location = (
                model_snapshot.get("location")
                if isinstance(model_snapshot, dict)
                else None
            )
            self._apply_binding(workflow, self._binding(config, "prompt"), spec.get("prompt"), "prompt")
            self._apply_binding(
                workflow,
                self._binding(config, "negative_prompt"),
                spec.get("negative_prompt"),
                "negative_prompt",
            )
            self._apply_binding(workflow, self._binding(config, "seed"), spec.get("seed"), "seed")
            self._apply_binding(workflow, self._binding(config, "model"), model_location, "model")
            self._apply_binding(
                workflow,
                self._binding(config, "input_image"),
                input_name,
                "input_image",
            )

            parameter_bindings = config.get("parameter_bindings", {})
            if parameter_bindings is not None and not isinstance(parameter_bindings, dict):
                raise ComfyUIExecutionError("parameter_bindings must be an object")
            parameters = spec.get("parameters", {})
            if isinstance(parameters, dict) and isinstance(parameter_bindings, dict):
                for name, binding in parameter_bindings.items():
                    if name not in parameters:
                        continue
                    if not isinstance(binding, dict):
                        raise ComfyUIExecutionError(
                            f"parameter binding {name} must be an object"
                        )
                    self._apply_binding(workflow, binding, parameters[name], f"parameter:{name}")

            self._stage(on_stage, "submitting ComfyUI workflow", 0.3)
            prompt_id = self._submit(client, workflow)
            self._stage(on_stage, "waiting for ComfyUI", 0.42)
            history, output_ref = self._wait_for_output(client, prompt_id)
            self._stage(on_stage, "downloading ComfyUI output", 0.82)
            output_path = self._download_output(client, output_ref, workdir)
            return ExecutionResult(
                external_id=prompt_id,
                output_path=output_path,
                output_filename=output_path.name,
                output_ref=output_ref,
                diagnostics={
                    "history_status": history.get("status", {}),
                    "workflow_artifact_ref": artifact_ref,
                },
            )
        except httpx.HTTPError as exc:
            raise ComfyUIExecutionError(f"ComfyUI request failed: {exc}") from exc
        finally:
            if owned_client:
                client.close()
