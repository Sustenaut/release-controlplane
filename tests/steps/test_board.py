"""Steps for how this repository's public workflow calls pubkit."""

from __future__ import annotations

from pathlib import Path

from pytest_bdd import parsers, scenarios, then, when

scenarios("board.feature")

ROOT = Path(__file__).resolve().parents[2]


@when("I read the hourly board workflow", target_fixture="workflow")
def read_workflow():
    return (ROOT / ".github/workflows/hourly-board.yml").read_text()


@then("it sends pubfleet board's output nowhere, and uploads no artifact")
def quiet_workflow(workflow):
    assert "pubfleet board --out site --repos repos.json > /dev/null" in workflow
    assert "upload-artifact" not in workflow and "STEP_SUMMARY" not in workflow


@then("its token comes from the reader app")
def reader(workflow):
    assert "app-id: '${{ vars.RELEASE_READER_APP_ID }}'" in workflow
    assert "private-key: '${{ secrets.RELEASE_READER_APP_KEY }}'" in workflow
    assert "owner: '${{ matrix.owner }}'" in workflow


@then("it may ask for an OpenID Connect token")
def oidc(workflow):
    assert "id-token: write" in workflow


@then(parsers.parse('it keeps the board in the tenant "{tenant}"'))
def keeps(workflow, tenant):
    assert "pubfleet state --repos-for board state.json > repos.json" in workflow
    assert f"pubfleet board-publish --url https://storage.sustenaut.eu --tenant {tenant}" in workflow
