from videoweave_api.infrastructure.media.probe import parse_ffprobe


def test_parse_ffprobe_extracts_core_video_metadata() -> None:
    payload = {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "avg_frame_rate": "30000/1001",
                "nb_frames": "300",
                "pix_fmt": "yuv420p",
            },
            {"codec_type": "audio", "codec_name": "aac"},
        ],
        "format": {
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
            "duration": "10.010000",
            "bit_rate": "8000000",
        },
    }

    metadata = parse_ffprobe(payload)

    assert metadata["width"] == 1920
    assert metadata["height"] == 1080
    assert metadata["video_codec"] == "h264"
    assert metadata["audio_codec"] == "aac"
    assert metadata["frame_count"] == 300
    assert round(metadata["fps"], 3) == 29.97
