from fractions import Fraction
import json
import subprocess
from typing import Any

from videoweave_api.core.config import Settings


class MediaProbeError(RuntimeError):
    pass


def _number(value: Any) -> float | None:
    if value in (None, "", "N/A"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _integer(value: Any) -> int | None:
    if value in (None, "", "N/A"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _frame_rate(value: Any) -> float | None:
    if not value or value in ("0/0", "N/A"):
        return None
    try:
        return float(Fraction(str(value)))
    except (ValueError, ZeroDivisionError):
        return None


def parse_ffprobe(payload: dict[str, Any]) -> dict[str, Any]:
    streams = payload.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    media_format = payload.get("format", {})

    duration = _number(media_format.get("duration")) or _number(video.get("duration"))
    fps = _frame_rate(video.get("avg_frame_rate")) or _frame_rate(video.get("r_frame_rate"))

    metadata = {
        "format_name": media_format.get("format_name"),
        "bit_rate": _integer(media_format.get("bit_rate")),
        "video_codec": video.get("codec_name"),
        "audio_codec": audio.get("codec_name"),
        "width": _integer(video.get("width")),
        "height": _integer(video.get("height")),
        "duration": duration,
        "fps": fps,
        "frame_count": _integer(video.get("nb_frames")),
        "pixel_format": video.get("pix_fmt"),
        "color_space": video.get("color_space"),
    }
    return {key: value for key, value in metadata.items() if value is not None}


def probe_media(url: str, settings: Settings) -> dict[str, Any]:
    command = [
        settings.ffprobe_binary,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        url,
    ]
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=settings.ffprobe_timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise MediaProbeError(f"{settings.ffprobe_binary} was not found") from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaProbeError("ffprobe timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise MediaProbeError(exc.stderr.strip() or "ffprobe failed") from exc

    try:
        return parse_ffprobe(json.loads(result.stdout))
    except json.JSONDecodeError as exc:
        raise MediaProbeError("ffprobe returned invalid JSON") from exc
