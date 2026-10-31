// Reading an operator's form into a new state. Nothing from the form is trusted: it
// can only switch roles and name a project, for repositories the app can see.

const NAME = /^[A-Za-z0-9_.-]+$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NOTE_CHARS = 200;
// What a repository's dropdown says to take the form's new label instead.
export const NEW_LABEL = "__new__";

export class FormError extends Error {}

export function noteFrom(form) {
  const note = (form.get("note") ?? "").replace(/\s+/g, " ").trim();
  if (!note) throw new FormError("A change needs a note saying why.");
  if (note.length > NOTE_CHARS) throw new FormError(`A note is at most ${NOTE_CHARS} characters.`);
  return note;
}

export function shaFrom(form) {
  const sha = form.get("base") ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new FormError("The form is missing what it was read from. Reload the page.");
  return sha;
}

// The labels a state uses, which its dropdowns offer. A label no repository uses any
// more stops being offered.
export function labelsOf(state) {
  const used = Object.values(state.repos).map((r) => r.project).filter(Boolean);
  return [...new Set(used)].sort((a, b) => a.localeCompare(b));
}

export function stateFrom(form, current, visible) {
  const known = new Set([...Object.keys(current.repos), ...visible]);
  const named = form.getAll("repo");
  const repos = {};
  const labels = new Set(labelsOf(current));
  const newLabel = (form.get("new-label") ?? "").trim();
  if (newLabel && !PROJECT.test(newLabel)) throw new FormError("A label is lower case letters, digits and hyphens, at most 40.");
  let usedNew = false;
  for (const name of Object.keys(current.repos)) {
    if (!named.includes(name)) repos[name] = current.repos[name];
  }
  for (const name of named) {
    if (!NAME.test(name) || !known.has(name)) throw new FormError(`${name} isn't a repository the app can see.`);
    const roles = {
      board: form.get(`${name}.board`) === "on",
      protect: form.get(`${name}.protect`) === "on",
      govern: form.get(`${name}.govern`) === "on",
    };
    let project = form.get(`${name}.project`) ?? "";
    if (project === NEW_LABEL) {
      if (!newLabel) throw new FormError(`${name} is set to a new label, but none is given.`);
      project = newLabel;
      usedNew = true;
    } else if (project && !labels.has(project)) {
      throw new FormError(`${project} isn't one of the labels.`);
    }
    // A repository not yet in the state joins it when a role is switched on.
    if (current.repos[name] || roles.board || roles.protect || roles.govern) {
      repos[name] = project ? { project, ...roles } : roles;
    }
  }
  if (newLabel && !usedNew) throw new FormError(`No repository was set to the new label ${newLabel}, so it wouldn't be kept.`);
  return { owner: current.owner, repos };
}
