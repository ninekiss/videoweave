from videoweave_api.infrastructure.media.scenes import SceneChange, build_shots


def test_build_shots_from_scene_changes() -> None:
    shots = build_shots(
        10.0,
        [
            SceneChange(timestamp=2.0, score=18.0),
            SceneChange(timestamp=7.0, score=22.0),
        ],
    )

    assert [(shot.start, shot.end) for shot in shots] == [
        (0.0, 2.0),
        (2.0, 7.0),
        (7.0, 10.0),
    ]
    assert [shot.representative_timestamp for shot in shots] == [1.0, 4.5, 8.5]
    assert shots[1].transition_score == 18.0
