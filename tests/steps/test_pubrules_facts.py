"""Steps for bin/pubrules-facts: gh is pubtest's stand-in, answering from the world the
Givens describe, and the program is run as the nightly runs it, with --out."""

from __future__ import annotations

import io
import json
import shlex
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import fastavro
import pytest
import yaml
from pubtest.steps.programs import run_command
from pubtest.steps.standins import standins
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("pubrules_facts.feature")

ROOT = Path(__file__).resolve().parents[2]
RAW = "-H Accept: application/vnd.github.raw+json"


@pytest.fixture
def world():
    return {"latest": "0", "released": {}, "pins": {}, "runs": {}, "state": {"owner": "Sustenaut", "repos": {}}}


def _answer(args: str, body) -> dict:
    text = body if isinstance(body, str) else json.dumps(body)
    return {"args": args, "stdout": text + "\n"}


def _install(world, ctx, tmp_path) -> None:
    """gh, answering the world's API paths, and anything else as GitHub's 404; and the
    state.json the program reads."""
    answers = [
        _answer("api repos/Sustenaut/pubrules/releases/latest", {"tag_name": "v" + world["latest"]}),
        _answer("api repos/Sustenaut/pubrules/releases?per_page=100",
                [{"tag_name": "v" + v, "published_at": at} for v, at in world["released"].items()]),
    ]
    for name, v in world["pins"].items():
        answers.append(_answer(f"api {RAW} repos/Sustenaut/{name}/contents/tests/requirements-pubrules.txt",
                               f"pubrules @ https://github.com/Sustenaut/pubrules/releases/download/v{v}/pubrules-{v}-py3-none-any.whl"))
    for name in world["state"]["repos"]:
        run = world["runs"].get(name)
        answers.append(_answer(f"api repos/Sustenaut/{name}/actions/workflows/main.yml/runs*",
                               {"workflow_runs": [run] if run else []}))
        if run:
            steps = [{"name": "Run .venv/bin/pubrules sync --check", "conclusion": run["sync"]}]
            answers.append(_answer(f"api repos/Sustenaut/{name}/actions/runs/{run['id']}/jobs*", {"jobs": [{"steps": steps}]}))
    answers.append({"args": "*", "exit": "1", "stderr": "gh: Not Found (HTTP 404)\n"})
    standins(ctx, tmp_path).add_turns("gh", answers)
    (ctx.directory / "state.json").write_text(json.dumps(world["state"]))


@given(parsers.parse('pubrules\' latest release is "{v}"'))
def latest(world, ctx, tmp_path, v):
    world["latest"] = v
    _install(world, ctx, tmp_path)


@given(parsers.parse('pubrules "{v}" was released {days:d} days ago'))
def released(world, ctx, tmp_path, v, days):
    world["released"][v] = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    _install(world, ctx, tmp_path)


@given(parsers.re(r'the state (?P<how>puts|governs|has) "(?P<name>[^"]+)"(?: on the board| off the board)?, '
                  r'pinning (?:pubrules "(?P<v>[^"]+)"|nothing), '
                  r'(?:whose main (?P<sync>passes|fails) its sync check at "(?P<sha>[^"]+)"|with no main runs)'))
def listed(world, ctx, tmp_path, how, name, v, sync, sha):
    if v:
        world["pins"][name] = v
    if sync:
        world["runs"][name] = {"id": len(world["runs"]) + 1, "head_sha": sha,
                               "html_url": f"https://github.com/Sustenaut/{name}/actions/runs/{sha}",
                               "sync": "success" if sync == "passes" else "failure"}
    world["state"]["repos"][name] = {"board": how != "has", "protect": False, "govern": how == "governs"}
    _install(world, ctx, tmp_path)


@when("I write the facts")
def write(ctx):
    command = shlex.join([sys.executable, str(ROOT / "bin" / "pubrules-facts"), "state.json", "--out", "facts.avro"])
    run_command(ctx, command, None)


def _facts(ctx) -> list[dict]:
    return list(fastavro.reader(io.BytesIO((ctx.directory / "facts.avro").read_bytes())))


def _fact(ctx, repo, check):
    found = [f for f in _facts(ctx) if f["repository"] == repo and f["check"] == check]
    assert len(found) == 1, (repo, check, _facts(ctx))
    return found[0]


@then(parsers.re(r'the facts hold "(?P<repo>[^"]+)" (?P<check>\w+) "(?P<status>\w+)" pinned "(?P<pinned>[^"]*)" '
                  r'fixed by "(?P<fix>[^"]*)"'))
def holds(ctx, repo, check, status, pinned, fix):
    fact = _fact(ctx, repo, check)
    assert (fact["status"], fact["pinned"], fact["fix"]) == (status, pinned, fix), fact


@then(parsers.parse('every fact of "{repo}" names main\'s commit "{sha}", its run, latest "{latest}" and the run\'s start'))
def names(ctx, repo, sha, latest):
    facts = _facts(ctx)
    found = {f["check"]: f for f in facts if f["repository"] == repo}
    assert set(found) == {"pin", "sync"}
    assert len({f["run_started_at"] for f in facts}) == 1
    sync = found["sync"]
    assert sync["main_commit"] == sha and sync["run_url"].endswith(f"/actions/runs/{sha}"), sync
    # The run is the sync check's evidence alone: a pin row names no run.
    assert found["pin"]["main_commit"] == "" and found["pin"]["run_url"] == "", found["pin"]
    for f in found.values():
        assert f["latest"] == latest and f["observed_at"] >= f["run_started_at"], f


@then(parsers.parse('the facts hold nothing of "{repo}"'))
def nothing_of(ctx, repo):
    assert not [f for f in _facts(ctx) if f["repository"] == repo]


@then(parsers.re(r'the facts hold "(?P<repo>[^"]+)" pin "(?P<status>\w+)"$'))
def pin_status(ctx, repo, status):
    assert _fact(ctx, repo, "pin")["status"] == status


def _job():
    return yaml.safe_load((ROOT / ".github/workflows/fleet-nightly.yml").read_text())["jobs"]["pubrules"]


def _facts_step():
    return next(s for s in _job()["steps"] if "pubrules-facts" in s.get("run", ""))


@when(parsers.parse('I read the nightly workflow\'s "{name}" job'))
def nightly(ctx, name):
    ctx.attempt(lambda: yaml.safe_load((ROOT / ".github/workflows/fleet-nightly.yml").read_text())["jobs"][name])


@when("I read the nightly's pubrules job, in lower case")
def nightly_lower(ctx):
    ctx.attempt(lambda: yaml.safe_dump(_job()).lower())


@when("I read the nightly's step that runs bin/pubrules-facts")
def facts_step(ctx):
    ctx.attempt(_facts_step)


@when("I read what the nightly's step that runs bin/pubrules-facts runs")
def facts_run(ctx):
    ctx.attempt(lambda: _facts_step()["run"])
