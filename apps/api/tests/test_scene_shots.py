from videoweave_api.infrastructure.media.scenes import (
    SceneChange,
    TransitionEvent,
    automatic_scene_threshold,
    build_shots,
    cluster_scene_changes,
    event_changes,
)


def test_cluster_scene_changes_keeps_local_peak() -> None:
    events = cluster_scene_changes(
        [
            SceneChange(timestamp=2.583, score=1.482),
            SceneChange(timestamp=2.625, score=1.412),
            SceneChange(timestamp=2.667, score=1.061),
            SceneChange(timestamp=2.917, score=1.337),
        ],
        fps=24.0,
        max_gap_frames=3,
    )

    assert len(events) == 2
    assert events[0] == TransitionEvent(
        timestamp=2.583,
        score=1.482,
        start=2.583,
        end=2.667,
        member_count=3,
    )
    assert events[1].timestamp == 2.917


def test_auto_threshold_uses_event_distribution() -> None:
    events = [
        TransitionEvent(1.0, 1.05, 1.0, 1.0, 1),
        TransitionEvent(2.0, 1.06, 2.0, 2.0, 1),
        TransitionEvent(3.0, 1.07, 3.0, 3.0, 1),
        TransitionEvent(4.0, 1.40, 4.0, 4.0, 1),
    ]

    threshold, stats = automatic_scene_threshold(events, floor_threshold=1.0, mad_multiplier=2.0)
    accepted = event_changes(events, threshold)

    assert threshold == 1.085
    assert stats["median"] == 1.065
    assert [change.timestamp for change in accepted] == [4.0]


def test_build_shots_preserves_rapid_real_cuts() -> None:
    shots = build_shots(
        2.0,
        [
            SceneChange(timestamp=1.0, score=1.4),
            SceneChange(timestamp=1.15, score=1.5),
        ],
    )

    assert [(shot.start, shot.end) for shot in shots] == [
        (0.0, 1.0),
        (1.0, 1.15),
        (1.15, 2.0),
    ]
    assert shots[1].transition_score == 1.4
