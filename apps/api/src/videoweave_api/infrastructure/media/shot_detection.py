from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from videoweave_api.infrastructure.media.scenes import SceneChange

PYSCENEDETECT_ADAPTIVE = "pyscenedetect-adaptive"


class ShotDetectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class ShotDetectionResult:
    detector: str
    changes: list[SceneChange]
    diagnostics: dict[str, Any]


def _library_version() -> str | None:
    try:
        return version("scenedetect-headless")
    except PackageNotFoundError:
        try:
            return version("scenedetect")
        except PackageNotFoundError:
            return None


def detect_adaptive_shots(
    source: Path,
    *,
    adaptive_threshold: float = 3.0,
    min_scene_len_frames: int = 3,
    window_width: int = 2,
    min_content_val: float = 15.0,
) -> ShotDetectionResult:
    if adaptive_threshold <= 0:
        raise ValueError("adaptive_threshold must be positive")
    if min_scene_len_frames < 1:
        raise ValueError("min_scene_len_frames must be positive")
    if window_width < 1:
        raise ValueError("window_width must be positive")
    if min_content_val < 0:
        raise ValueError("min_content_val must be non-negative")

    try:
        from scenedetect import AdaptiveDetector, detect
    except ImportError as exc:
        raise ShotDetectionError("PySceneDetect is not installed") from exc

    detector = AdaptiveDetector(
        adaptive_threshold=adaptive_threshold,
        min_scene_len=min_scene_len_frames,
        window_width=window_width,
        min_content_val=min_content_val,
    )

    try:
        scenes = detect(
            str(source),
            detector,
            show_progress=False,
            start_in_scene=True,
        )
    except Exception as exc:
        raise ShotDetectionError(f"PySceneDetect failed: {exc}") from exc

    changes = [
        SceneChange(timestamp=round(float(start.seconds), 6), score=None)
        for start, _end in scenes[1:]
        if float(start.seconds) > 0
    ]

    return ShotDetectionResult(
        detector=PYSCENEDETECT_ADAPTIVE,
        changes=changes,
        diagnostics={
            "library": "PySceneDetect",
            "library_version": _library_version(),
            "detector_config": {
                "adaptive_threshold": adaptive_threshold,
                "min_scene_len_frames": min_scene_len_frames,
                "window_width": window_width,
                "min_content_val": min_content_val,
            },
            "detected_scene_count": len(scenes),
            "accepted_boundary_count": len(changes),
        },
    )
