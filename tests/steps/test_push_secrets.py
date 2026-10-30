"""Steps for scripts/push-secrets.sh, against a fake gh that logs its arguments
and what it read, and answers for the environment's branch policies."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("push-secrets.feature")

ROOT = Path(__file__).resolve().parents[2]
MAP = json.loads((ROOT / "secrets.json").read_text())
KEY = "-----BEGIN RSA PRIVATE KEY-----\nTOPSECRETKEYBODY\n-----END RSA PRIVATE KEY-----\n"

FAKE_GH = f"""#!{sys.executable}
import json, os, sys
args = sys.argv[1:]
is_set = len(args) > 1 and args[1] == "set"
read = sys.stdin.read() if is_set else ""
with open(os.environ["GH_LOG"], "a") as log:
    log.write(json.dumps({{"args": args, "read": read}}) + "\\n")
if is_set and args[2] == os.environ.get("GH_REFUSE"):
    sys.exit(1)
if args[0] == "api" and "deployment-branch-policies" in " ".join(args) and "POST" not in args:
    print(os.environ.get("GH_BRANCHES", ""))
"""


def _variable(name):
    return name.upper().replace("-", "_")


def _value(entry):
    return KEY if entry["check"] == "key" else str(1000 + MAP["secrets"].index(entry))


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    return root


@pytest.fixture
def world(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "gh").write_text(FAKE_GH)
    (bin_dir / "gh").chmod(0o755)
    return {"env": {"PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
                    "GH_LOG": str(tmp_path / "gh.log")},
            "log": tmp_path / "gh.log"}


def _calls(world):
    if not world["log"].exists():
        return []
    return [json.loads(line) for line in world["log"].read_text().splitlines()]


@given("every secret is in Bitwarden")
def every_secret(world):
    world["env"].update({_variable(e["name"]): _value(e) for e in MAP["secrets"]})


@given(parsers.parse('"{one}" and "{two}" are not'))
def are_not(world, one, two):
    del world["env"][_variable(one)]
    del world["env"][_variable(two)]


@given(parsers.parse('"{name}" holds "{value}"'))
def holds(world, name, value):
    world["env"][_variable(name)] = value


@given(parsers.parse('"{name}" is empty'))
def is_empty(world, name):
    world["env"][_variable(name)] = ""


@given(parsers.parse('gh refuses "{name}"'))
def refuses(world, name):
    world["env"]["GH_REFUSE"] = name


@given(parsers.parse('the environment already takes "{branch}"'))
def already(world, branch):
    world["env"]["GH_BRANCHES"] = branch


@when("I run push-secrets", target_fixture="result")
def run_it(run, world, repo):
    return run(str(ROOT / "scripts" / "push-secrets.sh"), cwd=repo, env=world["env"])


@when(parsers.parse('I run push-secrets with "{flag}"'), target_fixture="result")
def run_with(run, world, repo, flag):
    return run(str(ROOT / "scripts" / "push-secrets.sh"), flag, cwd=repo, env=world["env"])


def _sets(world):
    return [c for c in _calls(world) if len(c["args"]) > 1 and c["args"][1] == "set"]


def _set(world, kind, name, repo, environment=None):
    for call in _sets(world):
        args = call["args"]
        if args[0] == kind and args[2] == name and args[args.index("-R") + 1] == repo:
            if environment is None or args[args.index("--env") + 1] == environment:
                return call
    return None


@then(parsers.parse('gh set the {kind} "{name}" in "{repo}" for the environment "{environment}"'))
def set_in_environment(world, kind, name, repo, environment):
    call = _set(world, kind, name, repo, environment)
    assert call and call["read"] == KEY


@then(parsers.parse('gh set the {kind} "{name}" in "{repo}"'))
def set_in(world, kind, name, repo):
    call = _set(world, kind, name, repo)
    assert call and "--env" not in call["args"] and call["read"]


@then(parsers.parse('gh did not set "{name}" outside an environment'))
def only_environment(world, name):
    found = [c for c in _sets(world) if c["args"][2] == name]
    assert found and all("--env" in c["args"] for c in found)


@then(parsers.parse('gh did not set "{name}" anywhere'))
def not_anywhere(world, name):
    assert not [c for c in _sets(world) if c["args"][2] == name]


@then(parsers.parse('the environment "{environment}" of "{repo}" takes only "{branch}"'))
def environment_branch(world, environment, repo, branch):
    joined = [" ".join(c["args"]) for c in _calls(world) if c["args"][0] == "api"]
    assert any("PUT" in a and f"repos/{repo}/environments/{environment}" in a for a in joined)
    assert any("POST" in a and f"name={branch}" in a for a in joined)
    first_set = next(i for i, c in enumerate(_calls(world)) if len(c["args"]) > 1 and c["args"][1] == "set")
    first_api = next(i for i, c in enumerate(_calls(world)) if c["args"][0] == "api")
    assert first_api < first_set


@then("no value is printed or on any command line")
def no_value(world, result):
    values = [_value(e) for e in MAP["secrets"]]
    for value in values:
        assert value.strip() not in result.stdout + result.stderr
        for call in _calls(world):
            assert value.strip() not in " ".join(call["args"])


@then("gh was not called")
def gh_not_called(world):
    assert _calls(world) == []


@then(parsers.parse('"{value}" is not printed'))
def not_printed(result, value):
    assert value not in result.stdout + result.stderr


@then("gh did not add a branch to the environment")
def no_branch_added(world):
    assert not [c for c in _calls(world) if c["args"][0] == "api" and "POST" in c["args"]]


@when("I read secrets.json", target_fixture="secrets")
def read_map():
    return MAP


@then("every key goes as a secret and every id as a variable")
def kinds(secrets):
    for entry in secrets["secrets"]:
        assert entry["kind"] == ("secret" if entry["check"] == "key" else "variable"), entry["name"]


@then("the state writer goes only to an environment")
def writer_environment(secrets):
    for entry in secrets["secrets"]:
        if "-writer-" in entry["name"]:
            assert all(t in secrets["environments"] for t in entry["to"]), entry["name"]
