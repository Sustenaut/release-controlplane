"""Steps for how this repository's public workflow calls pubfleet."""

from __future__ import annotations

from pathlib import Path

from pytest_bdd import scenarios, when

scenarios("board.feature")

ROOT = Path(__file__).resolve().parents[2]


@when("I read the hourly board workflow")
def read_workflow(ctx):
    ctx.attempt(lambda: (ROOT / ".github/workflows/hourly-board.yml").read_text())
