"""Steps for bin/pubkit-facts, against a fake gh that answers from a JSON file."""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
from pathlib import Path

import fastavro
import pytest
import yaml
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("pubkit_facts.feature")

ROOT = Path(__file__).resolve().parents[2]
FAKE_GH = f"""#!{sys.executable}
import json, os, re, sys
world = json.load(open(os.environ["FAKE_WORLD"]))
path = sys.argv[-1]
if path == "repos/Sustenaut/pubkit/releases/latest":
    print(json.dumps({{"tag_name": "v" + world["latest"]}})); sys.exit(0)
m = re.match(r"repos/Sustenaut/([^/]+)/contents/tests/requirements-pubkit.txt$", path)
if m and m.group(1) in world["pins"]:
    v = world["pins"][m.group(1)]
    print(f"pubkit @ https://github.com/Sustenaut/pubkit/releases/download/v{{v}}/pubkit-{{v}}-py3-none-any.whl"); sys.exit(0)
m = re.match(r"repos/Sustenaut/([^/]+)/actions/workflows/main.yml/runs", path)
if m:
    run = world["runs"].get(m.group(1))
    print(json.dumps({{"workflow_runs": [run] if run else []}})); sys.exit(0)
m = re.match(r"repos/Sustenaut/[^/]+/actions/runs/([^/]+)/jobs", path)
if m:
    run = next(r for r in world["runs"].values() if str(r["id"]) == m.group(1))
    print(json.dumps({{"jobs": [{{"steps": [{{"name": "Run .venv/bin/pubkit sync --check", "conclusion": run["sync"]}}]}}]}})); sys.exit(0)
sys.stderr.write("gh: Not Found (HTTP 404)\\\\n"); sys.exit(1)
"""


@pytest.fixture
def world():
    return {"latest": "0", "pins": {}, "runs": {}, "state": {"owner": "Sustenaut", "repos": {}}}


@given(parsers.parse('pubkit\'s latest release is "{v}"'))
def latest(world, v):
    world["latest"] = v


@given(parsers.re(r'the state (?P<how>puts|governs|has) "(?P<name>[^"]+)"(?: on the board| off the board)?, '
                  r'pinning (?:pubkit "(?P<v>[^"]+)"|nothing), '
                  r'(?:whose main (?P<sync>passes|fails) its sync check at "(?P<sha>[^"]+)"|with no main runs)'))
def listed(world, how, name, v, sync, sha):
    if v:
        world["pins"][name] = v
    if sync:
        world["runs"][name] = {"id": len(world["runs"]) + 1, "head_sha": sha,
                               "html_url": f"https://github.com/Sustenaut/{name}/actions/runs/{sha}",
                               "sync": "success" if sync == "passes" else "failure"}
    world["state"]["repos"][name] = {"board": how != "has", "protect": False, "govern": how == "governs"}


@when("I write the facts", target_fixture="result")
def write(world, tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "gh").write_text(FAKE_GH)
    (bin_dir / "gh").chmod(0o755)
    (tmp_path / "world.json").write_text(json.dumps(world))
    (tmp_path / "state.json").write_text(json.dumps(world["state"]))
    env = {**os.environ, "FAKE_WORLD": str(tmp_path / "world.json"),
           "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    proc = subprocess.run([sys.executable, str(ROOT / "bin" / "pubkit-facts"), str(tmp_path / "state.json"),
                           "--out", str(tmp_path / "facts.avro")], capture_output=True, text=True, env=env, check=False)
    facts = list(fastavro.reader(io.BytesIO((tmp_path / "facts.avro").read_bytes()))) if proc.returncode == 0 else []
    return {"proc": proc, "facts": facts}


@then(parsers.parse('it succeeds, printing "{text}"'))
def succeeds(result, text):
    assert result["proc"].returncode == 0, result["proc"].stderr
    assert result["proc"].stdout.strip() == text, result["proc"].stdout


def _fact(result, repo, check):
    found = [f for f in result["facts"] if f["repository"] == repo and f["check"] == check]
    assert len(found) == 1, (repo, check, result["facts"])
    return found[0]


@then(parsers.re(r'the facts hold "(?P<repo>[^"]+)" (?P<check>\w+) "(?P<status>\w+)" pinned "(?P<pinned>[^"]*)" '
                  r'fixed by "(?P<fix>[^"]*)"'))
def holds(result, repo, check, status, pinned, fix):
    fact = _fact(result, repo, check)
    assert (fact["status"], fact["pinned"], fact["fix"]) == (status, pinned, fix), fact


@then(parsers.parse('every fact of "{repo}" names main\'s commit "{sha}", its run, latest "{latest}" and the run\'s start'))
def names(result, repo, sha, latest):
    found = [f for f in result["facts"] if f["repository"] == repo]
    assert len(found) == 2
    starts = {f["run_started_at"] for f in result["facts"]}
    assert len(starts) == 1
    for f in found:
        assert f["main_commit"] == sha and f["run_url"].endswith(f"/actions/runs/{sha}"), f
        assert f["latest"] == latest and f["observed_at"] >= f["run_started_at"], f


@then(parsers.parse('the facts hold nothing of "{repo}"'))
def nothing_of(result, repo):
    assert not [f for f in result["facts"] if f["repository"] == repo]


@then("the output names no repository")
def quiet(result):
    out = result["proc"].stdout + result["proc"].stderr
    assert "Sustenaut/" not in out and "behind" not in out and "drifted" not in out, out


@when("I read the nightly workflow", target_fixture="job")
def nightly():
    return yaml.safe_load((ROOT / ".github/workflows/fleet-nightly.yml").read_text())["jobs"]["pubkit"]


@then("its pubkit job writes the facts to storage's pubkit-checks tenant as the job's own token")
def to_storage(job):
    assert job["permissions"]["id-token"] == "write"
    run = next(s["run"] for s in job["steps"] if "pubkit-facts" in s.get("run", ""))
    assert "bin/pubkit-facts state.json --url https://storage.sustenaut.eu --tenant pubkit-checks" in run


@then("it prints only the counts")
def counts(job):
    text = yaml.safe_dump(job)
    assert "slack" not in text.lower() and "upload-artifact" not in text
    run = next(s["run"] for s in job["steps"] if "pubkit-facts" in s.get("run", ""))
    assert "--out" not in run and "cat " not in run
