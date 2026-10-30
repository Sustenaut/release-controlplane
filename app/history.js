// What changed between two versions of a state file, in words.

const ROLES = ["board", "protect", "govern"];
const onOff = (value) => (value ? "on" : "off");

export function changes(before, after) {
  const was = before?.repos ?? {};
  const now = after?.repos ?? {};
  const out = [];
  for (const name of Object.keys({ ...was, ...now }).sort()) {
    if (!was[name]) out.push(`${name} added`);
    else if (!now[name]) out.push(`${name} removed`);
    else {
      for (const role of ROLES) {
        if (was[name][role] !== now[name][role]) out.push(`${name}: ${role} ${onOff(now[name][role])}`);
      }
      if ((was[name].project ?? "") !== (now[name].project ?? "")) {
        out.push(`${name}: project ${now[name].project ?? "none"}`);
      }
    }
  }
  return out;
}
