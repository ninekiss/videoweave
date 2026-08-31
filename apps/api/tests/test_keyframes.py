from videoweave_api.infrastructure.media.keyframes import uniform_timestamps


def test_uniform_timestamps_use_segment_midpoints() -> None:
    assert uniform_timestamps(8.0, 4) == [1.0, 3.0, 5.0, 7.0]
