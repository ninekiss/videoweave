from dataclasses import dataclass
from pathlib import Path
import re
import subprocess

from videoweave_api.core.config import Settings

_SCENE_LINE = re.compile(
    r"lavfi\.scd\.score:\s*(?P<score>[0-9.]+),\s*lavfi\.scd\.time:\s*(?P<time>[0-9.]+)"
)


@dataclass(frozen=True)
class SceneChange:
    timestamp: float
    score: float


@dataclass(frozen=True)
class ShotBoundary:
    index: int
    start: float
    end: float
    duration: float
    representative_timestamp: float
    transition_score: float | None = None


class SceneDetectionError(RuntimeError):
    pass


def detect_scene_changes(
    source: Path,
    threshold: float,
    settings: Settings,
) -> list[SceneChange]:
    command = [
        settings.ffmpeg_binary,
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "info",
        "-i",
        str(source),
        "-filter:v",
        f"scdet=threshold={threshold}:sc_pass=1",
        "-an",
        "-f",
        "null",
        "-",
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=settings.ffmpeg_timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SceneDetectionError(f"scene detection failed: {exc}") from exc

    if result.returncode != 0:
        message = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "ffmpeg failed"
        raise SceneDetectionError(message)

    changes: list[SceneChange] = []
    for match in _SCENE_LINE.finditer(result.stderr):
        changes.append(
            SceneChange(
                timestamp=float(match.group("time")),
                score=float(match.group("score")),
            )
        )
    return changes


def build_shots(
    duration: float,
    changes: list[SceneChange],
    *,
    min_shot_duration: float = 0.25,
) -> list[ShotBoundary]:
    if duration <= 0:
        raise ValueError("duration must be positive")

    accepted: list[SceneChange] = []
    previous = 0.0
    for change in sorted(changes, key=lambda item: item.timestamp):
        timestamp = min(max(change.timestamp, 0.0), duration)
        if timestamp <= 0 or timestamp >= duration:
            continue
        if timestamp - previous < min_shot_duration:
            continue
        if duration - timestamp < min_shot_duration:
            continue
        accepted.append(SceneChange(timestamp=timestamp, score=change.score))
        previous = timestamp

    starts = [0.0, *[change.timestamp for change in accepted]]
    ends = [*[change.timestamp for change in accepted], duration]
    score_by_start = {change.timestamp: change.score for change in accepted}

    shots: list[ShotBoundary] = []
    for index, (start, end) in enumerate(zip(starts, ends, strict=True), start=1):
        shot_duration = end - start
        shots.append(
            ShotBoundary(
                index=index,
                start=round(start, 6),
                end=round(end, 6),
                duration=round(shot_duration, 6),
                representative_timestamp=round(start + shot_duration / 2, 6),
                transition_score=score_by_start.get(start),
            )
        )
    return shots
