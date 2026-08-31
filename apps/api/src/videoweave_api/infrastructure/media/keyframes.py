from pathlib import Path
import subprocess

from videoweave_api.core.config import Settings


class KeyframeExtractionError(RuntimeError):
    pass


def uniform_timestamps(duration: float, count: int) -> list[float]:
    if duration <= 0:
        raise ValueError("video duration must be positive")
    if count < 1:
        raise ValueError("keyframe count must be positive")
    return [duration * (index + 0.5) / count for index in range(count)]


def extract_frame(
    input_path: Path,
    output_path: Path,
    timestamp: float,
    settings: Settings,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        settings.ffmpeg_binary,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{timestamp:.6f}",
        "-i",
        str(input_path),
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-y",
        str(output_path),
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
        raise KeyframeExtractionError(str(exc)) from exc

    if result.returncode != 0 or not output_path.exists():
        message = result.stderr.strip() or "ffmpeg did not create the keyframe"
        raise KeyframeExtractionError(message)
