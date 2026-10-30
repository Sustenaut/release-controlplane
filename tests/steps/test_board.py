"""Steps for the control plane's scripts, with a fake storage service in this
process, and a repos file made from a state file."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("board.feature")

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
TOKEN = "the-oidc-token"
REPO = "example-org/secretly-named"


def board(grade="A", built="2026-10-30T10:00:00Z"):
    return json.dumps({
        "built": built, "pubkit": "0.23.0", "rules": "r", "summary": f"Built {built}", "problems": [],
        "repos": [{"repo": REPO, "overall": grade,
                   "grades": {"quality": {"letter": grade, "steps": [{"text": "x", "sources": [built]}]}},
                   "facts": {"sonar": {"value": grade, "sources": [built]}}}],
        "calls": [{"id": built, "at": built}]}).encode()


class Fake:
    """What the fake storage holds and was asked."""

    def __init__(self):
        self.tenants = {}
        self.uploads = []
        self.moves = []
        self.logins = []
        self.refuse_read = None
        self.stolen = False


def _handler(fake):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def _send(self, status, body=b"{}", headers=None):
            self.send_response(status)
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.startswith("/oidc"):
                fake.logins.append(self.path)
                return self._send(200, json.dumps({"value": TOKEN}).encode())
            assert self.headers["Authorization"] == f"Bearer {TOKEN}"
            if fake.refuse_read:
                return self._send(fake.refuse_read, b'{"error": "no"}')
            tenant = self.path.split("/")[1]
            held = fake.tenants.get(tenant)
            if not held:
                return self._send(404)
            return self._send(200, held, {"ETag": f'"{hashlib.sha256(held).hexdigest()}"'})

        def do_POST(self):
            length = int(self.headers["Content-Length"])
            body = self.rfile.read(length)
            tenant = self.path.split("/")[1]
            content = body.split(b"\r\n\r\n", 1)[1].rsplit(b"\r\n--", 1)[0]
            fake.uploads.append((tenant, content))
            return self._send(200, json.dumps({"id": hashlib.sha256(content).hexdigest()}).encode())

        def do_PUT(self):
            length = int(self.headers["Content-Length"])
            tenant = self.path.split("/")[1]
            wanted = json.loads(self.rfile.read(length))["hash"]
            fake.moves.append(dict(self.headers))
            if fake.stolen:
                return self._send(412, b'{"error": "moved"}')
            return self._send(200, json.dumps({"hash": wanted, "tenant": tenant}).encode())

    return Handler


@pytest.fixture
def fake():
    return Fake()


@pytest.fixture
def storage(fake):
    server = HTTPServer(("127.0.0.1", 0), _handler(fake))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def _publish(tmp_path, storage, owner, content):
    (tmp_path / "site").mkdir(exist_ok=True)
    (tmp_path / "site" / "board.json").write_bytes(content)
    return subprocess.run(
        [sys.executable, str(SCRIPTS / "publish-board.py"), owner], capture_output=True, text=True,
        check=False, timeout=30, cwd=tmp_path,
        env={"STORAGE_URL": storage, "ACTIONS_ID_TOKEN_REQUEST_URL": f"{storage}/oidc?x=1",
             "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "request"})


@given(parsers.parse('storage has no board for "{tenant}"'))
def no_board(fake, tenant):
    fake.tenants.pop(tenant, None)


@given(parsers.parse('storage\'s board for "{tenant}" has the grade "{grade}"'))
def has_board(fake, tenant, grade):
    fake.tenants[tenant] = board(grade)


@given("another writer moves the head first")
def stolen(fake):
    fake.stolen = True


@given(parsers.parse("storage refuses to read the head with {status:d}"))
def refuses(fake, status):
    fake.refuse_read = status


@when(parsers.re(r'I publish a board for "(?P<owner>\w+)"$'), target_fixture="result")
def publish(tmp_path, storage, owner):
    return _publish(tmp_path, storage, owner, board())


@when("I publish a board for an owner that isn't a name", target_fixture="result")
def publish_bad_owner(tmp_path, storage):
    return _publish(tmp_path, storage, "../other", board())


@when(parsers.parse('I publish a board for "{owner}" with the grade "{grade}", read later'),
      target_fixture="result")
def publish_later(tmp_path, storage, owner, grade):
    return _publish(tmp_path, storage, owner, board(grade, "2026-10-30T11:00:00Z"))


@then(parsers.re(r'it uploaded (?P<count>\d+) files? to "(?P<tenant>[^"]+)"'))
def uploaded(fake, count, tenant):
    assert len([u for u in fake.uploads if u[0] == tenant]) == int(count)


@then('the head moved with "If-None-Match: *"')
def first_move(fake):
    assert fake.moves[0]["If-None-Match"] == "*"
    assert "If-Match" not in fake.moves[0]


@then("the head moved with If-Match on the old hash")
def later_move(fake):
    assert fake.moves[0]["If-Match"] == f'"{hashlib.sha256(board("A")).hexdigest()}"'


@then("the head did not move")
def no_move(fake):
    assert not fake.moves


@then(parsers.parse('it signed in with the job\'s token for "{audience}"'))
def signed_in(fake, audience):
    assert fake.logins == [f"/oidc?x=1&audience={audience}"]


@then("its output names no repository and no token")
def quiet(result):
    for text in (REPO, TOKEN, "request"):
        assert text not in result.stdout + result.stderr


@given(parsers.parse('a state file for "{owner}"'), target_fixture="state")
def state_file(owner):
    return {"owner": owner, "repos": {
        "one": {"project": "tools", "board": True, "protect": True, "govern": False},
        "two": {"board": True, "protect": False, "govern": True},
        "three": {"board": False, "protect": False, "govern": True}}}


@when(parsers.parse('I turn it into the repos file for "{role}"'), target_fixture="repos")
def turn(state, role):
    out = subprocess.run([sys.executable, str(SCRIPTS / "repos-from-state.py"), role], input=json.dumps(state),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)["repositories"]


@then(parsers.parse('it lists "{names}"'))
def lists(repos, names):
    assert [r["repo"] for r in repos] == names.split(", ")


@then(parsers.parse('"{repo}" has the project "{project}", protect on and govern off'))
def has_project(repos, repo, project):
    assert next(r for r in repos if r["repo"] == repo) == {
        "repo": repo, "protect": True, "govern": False, "project": project}


@then(parsers.parse('"{repo}" has no project'))
def no_project(repos, repo):
    assert "project" not in next(r for r in repos if r["repo"] == repo)


@when("I read the hourly board workflow", target_fixture="workflow")
def read_workflow():
    return (ROOT / ".github/workflows/hourly-board.yml").read_text()


@then("it sends pubkit board's output nowhere, and uploads no artifact")
def quiet_workflow(workflow):
    assert "pubkit board --out site --repos repos.json > /dev/null" in workflow
    assert "upload-artifact" not in workflow and "STEP_SUMMARY" not in workflow


@then("its token comes from the reader app")
def reader(workflow):
    assert "app-id: '${{ vars.RELEASE_READER_APP_ID }}'" in workflow
    assert "private-key: '${{ secrets.RELEASE_READER_APP_KEY }}'" in workflow
    assert "owner: '${{ matrix.owner }}'" in workflow


@then("it may ask for an OpenID Connect token")
def oidc(workflow):
    assert "id-token: write" in workflow
