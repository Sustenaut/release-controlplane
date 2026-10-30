#!/usr/bin/env python3
"""Write the repos file pubkit reads from one owner's state.json.

    repos-from-state.py board < state.json    # what the board grades
    repos-from-state.py govern < state.json   # what the nightly updates

pubkit never reads a state file's roles beyond checking them: this is where they
become its plain list of repositories.
"""

import json
import sys


def repos_file(state: dict, role: str) -> dict:
    entries = []
    for name, roles in state["repos"].items():
        if roles[role]:
            entry = {"repo": f"{state['owner']}/{name}", "protect": roles["protect"],
                     "govern": roles["govern"]}
            if roles.get("project"):
                entry["project"] = roles["project"]
            entries.append(entry)
    return {"repositories": entries}


if __name__ == "__main__":
    if sys.argv[1:] not in (["board"], ["govern"]):
        sys.exit("usage: repos-from-state.py board|govern < state.json")
    print(json.dumps(repos_file(json.load(sys.stdin), sys.argv[1]), separators=(",", ":")))
