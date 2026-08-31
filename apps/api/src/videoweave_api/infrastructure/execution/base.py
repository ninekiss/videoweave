from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol


StageCallback = Callable[[str, float], None]


@dataclass(frozen=True)
class ExecutionResult:
    external_id: str
    output_path: Path
    output_filename: str
    output_ref: dict
    diagnostics: dict


class ExecutionAdapter(Protocol):
    def execute(
        self,
        *,
        spec: dict,
        workdir: Path,
        input_path: Path | None = None,
        on_stage: StageCallback | None = None,
    ) -> ExecutionResult: ...
