"""Steps for bin/pubkit-report, against a fake gh that answers from a JSON file."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("pubkit_report.feature")

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
    print(json.dumps({{"workflow_runs": [{{"id": 1, "html_url": "https://github.com/run/1"}}] if m.group(1) in world["failing"] else []}})); sys.exit(0)
if re.match(r"repos/Sustenaut/[^/]+/actions/runs/1/jobs", path):
    print(json.dumps({{"jobs": [{{"steps": [{{"name": "Run .venv/bin/pubkit sync --check", "conclusion": "failure"}}]}}]}})); sys.exit(0)
sys.stderr.write("gh: Not Found (HTTP 404)\\n"); sys.exit(1)
"""


@pytest.fixture
def world(tmp_path):
    return {"latest": "0", "pins": {}, "failing": [], "state": {"owner": "Sustenaut", "repos": {}}}


@given(parsers.parse('pubkit\'s latest release is "{v}"'))
def latest(world, v):
    world["latest"] = v


@given(parsers.re(r'the state (?P<how>puts|governs|has) "(?P<name>[^"]+)"(?: on the board| off the board)?, '
                  r'pinning pubkit "(?P<v>[^"]+)"(?P<fails>, whose main fails its sync check)?'))
def listed(world, how, name, v, fails):
    world["pins"][name] = v
    world["state"]["repos"][name] = {"board": how != "has", "protect": False, "govern": how == "governs"}
    if fails:
        world["failing"].append(name)


@when("I run the report", target_fixture="result")
def run(world, tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "gh").write_text(FAKE_GH)
    (bin_dir / "gh").chmod(0o755)
    (tmp_path / "world.json").write_text(json.dumps(world))
    (tmp_path / "state.json").write_text(json.dumps(world["state"]))
    env = {**os.environ, "FAKE_WORLD": str(tmp_path / "world.json"),
           "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    return subprocess.run([sys.executable, str(ROOT / "bin" / "pubkit-report"), str(tmp_path / "state.json")],
                          capture_output=True, text=True, env=env, check=False)


@then("it succeeds")
def succeeds(result):
    assert result.returncode == 0, result.stderr


@then(parsers.parse('it says "{line}"'))
def says(result, line):
    assert line in result.stdout.splitlines(), result.stdout


@then(parsers.parse('it does not mention "{a}" or "{b}"'))
def not_mention(result, a, b):
    assert f"• {a}" not in result.stdout and f"• {b}" not in result.stdout, result.stdout


@then("it prints nothing")
def nothing(result):
    assert result.stdout == "", result.stdout


@when("I read the nightly workflow", target_fixture="job")
def nightly():
    import yaml  # noqa: PLC0415
    return yaml.safe_load((ROOT / ".github/workflows/fleet-nightly.yml").read_text())["jobs"]["pubkit"]


@then("its pubkit job prints a count to the log and the summary, and the lines only to Slack")
def quiet(job):
    report = next(s for s in job["steps"] if s.get("id") == "report")["run"]
    assert 'bin/pubkit-report state.json > "$RUNNER_TEMP/pubkit.txt"' in report
    # The file is only written, and counted: nothing prints its lines.
    uses = [line.strip() for line in report.splitlines() if "pubkit.txt" in line]
    assert uses == ['bin/pubkit-report state.json > "$RUNNER_TEMP/pubkit.txt"',
                    "steps=$(grep -c '^•' \"$RUNNER_TEMP/pubkit.txt\" || true)"], uses
    assert all("tee" not in line or "pubkit steps to take: $steps" in line for line in report.splitlines())
    say = next(s for s in job["steps"] if s.get("name") == "Say what to run")
    assert "--rawfile t \"$RUNNER_TEMP/pubkit.txt\"" in say["run"] and "> /dev/null" in say["run"]
