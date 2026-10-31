# Test the release control plane. CI runs `make venv` then `make functional`
# (pubkit.json's ci block).

PYTHON ?= python3
VENV := .venv

.PHONY: venv node functional lock clean

venv: $(VENV)/.done

$(VENV)/.done: tests/requirements.lock
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --quiet --require-hashes -r tests/requirements.lock
	touch $@

node: node_modules/.package-lock.json

node_modules/.package-lock.json: package.json package-lock.json
	npm ci --ignore-scripts

# The app's tests, and the Gherkin suite, run against the scripts.
functional: venv node
	npm test
	cd tests && ../$(VENV)/bin/pytest -n auto

lock: venv
	$(VENV)/bin/pubkit lock

clean:
	rm -rf $(VENV) node_modules
