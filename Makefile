# Test the release control plane. CI runs `make venv` then `make functional`
# (pubkit.json's ci block).

PYTHON ?= python3
VENV := .venv

.PHONY: venv functional lock clean

venv: $(VENV)/.done

$(VENV)/.done: tests/requirements.lock
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --quiet --require-hashes -r tests/requirements.lock
	touch $@

# The Gherkin suite, run against the scripts.
functional: venv
	cd tests && ../$(VENV)/bin/pytest -n auto

lock: venv
	$(VENV)/bin/pubkit lock

clean:
	rm -rf $(VENV)
