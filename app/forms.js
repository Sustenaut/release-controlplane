// Reading an operator's form into a new state. Nothing from the form is trusted: it
// can only switch roles and name a project, for repositories the app can see.

const NAME = /^[A-Za-z0-9_.-]+$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NOTE_CHARS = 200;

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

export function stateFrom(form, current, visible) {
  const known = new Set([...Object.keys(current.repos), ...visible]);
  const named = form.getAll("repo");
  const repos = {};
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
    const project = (form.get(`${name}.project`) ?? "").trim();
    if (project && !PROJECT.test(project)) {
      throw new FormError(`${name}'s project must be lower case letters, digits and hyphens.`);
    }
    // A repository not yet in the state joins it when a role is switched on.
    if (current.repos[name] || roles.board || roles.protect || roles.govern) {
      repos[name] = project ? { project, ...roles } : roles;
    }
  }
  return { owner: current.owner, repos };
}
