from dataclasses import dataclass
from pathlib import Path
import re
import statistics
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
class TransitionEvent:
    timestamp: float
    score: float
    start: float
    end: float
    member_count: int

    @property
    def span(self) -> float:
        return max(0.0, self.end - self.start)


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


def cluster_scene_changes(
    changes: list[SceneChange],
    fps: float | None,
    *,
    max_gap_frames: int = 3,
) -> list[TransitionEvent]:
    """Collapse consecutive scdet responses into one peak transition event.

    scdet can report several adjacent frames for one visual transition. The
    clustering window is expressed in frames so it scales with source FPS
    instead of imposing a fixed minimum shot duration.
    """
    if max_gap_frames < 1:
        raise ValueError("max_gap_frames must be positive")
    if not changes:
        return []

    effective_fps = fps if fps is not None and fps > 0 else 30.0
    max_gap_seconds = max_gap_frames / effective_fps
    ordered = sorted(changes, key=lambda item: item.timestamp)

    groups: list[list[SceneChange]] = [[ordered[0]]]
    for change in ordered[1:]:
        if change.timestamp - groups[-1][-1].timestamp <= max_gap_seconds + 1e-9:
            groups[-1].append(change)
        else:
            groups.append([change])

    events: list[TransitionEvent] = []
    for group in groups:
        peak = max(group, key=lambda item: (item.score, -item.timestamp))
        events.append(
            TransitionEvent(
                timestamp=round(peak.timestamp, 6),
                score=round(peak.score, 6),
                start=round(group[0].timestamp, 6),
                end=round(group[-1].timestamp, 6),
                member_count=len(group),
            )
        )
    return events


def automatic_scene_threshold(
    events: list[TransitionEvent],
    *,
    floor_threshold: float = 1.0,
    mad_multiplier: float = 2.0,
) -> tuple[float, dict[str, float | int]]:
    """Choose a conservative P0 threshold from transition-event scores.

    The detector floor produces noisy low-score responses. Median + k*MAD is
    robust to a few strong cuts while remaining cheap and deterministic.
    """
    if floor_threshold < 0:
        raise ValueError("floor_threshold must be non-negative")
    if mad_multiplier < 0:
        raise ValueError("mad_multiplier must be non-negative")
    if not events:
        return round(floor_threshold, 6), {
            "count": 0,
            "median": 0.0,
            "mad": 0.0,
            "minimum": 0.0,
            "maximum": 0.0,
        }

    scores = [event.score for event in events]
    median = float(statistics.median(scores))
    mad = float(statistics.median(abs(score - median) for score in scores))
    threshold = max(floor_threshold + 0.05, median + mad_multiplier * mad)

    return round(threshold, 6), {
        "count": len(scores),
        "median": round(median, 6),
        "mad": round(mad, 6),
        "minimum": round(min(scores), 6),
        "maximum": round(max(scores), 6),
    }


def event_changes(
    events: list[TransitionEvent],
    threshold: float,
) -> list[SceneChange]:
    return [
        SceneChange(timestamp=event.timestamp, score=event.score)
        for event in events
        if event.score >= threshold
    ]


def build_shots(
    duration: float,
    changes: list[SceneChange],
    *,
    min_shot_duration: float = 0.0,
) -> list[ShotBoundary]:
    if duration <= 0:
        raise ValueError("duration must be positive")
    if min_shot_duration < 0:
        raise ValueError("min_shot_duration must be non-negative")

    accepted: list[SceneChange] = []
    previous: float | None = None
    for change in sorted(changes, key=lambda item: item.timestamp):
        timestamp = min(max(change.timestamp, 0.0), duration)
        if timestamp <= 0 or timestamp >= duration:
            continue
        if previous is not None and timestamp - previous <= max(min_shot_duration, 1e-9):
            continue
        if min_shot_duration > 0 and duration - timestamp < min_shot_duration:
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
