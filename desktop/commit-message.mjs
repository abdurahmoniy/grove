import { createHash } from "node:crypto";

const SUMMARY_LIMIT = 72;
const DESCRIPTION_LIMIT = 4096;
const FILE_LIMIT = 40;

function shorten(value, limit) {
  const characters = Array.from(value);
  return characters.length > limit
    ? `${characters.slice(0, limit - 1).join("")}…`
    : value;
}

function displayPath(value) {
  const escaped = JSON.stringify(value)
    .slice(1, -1)
    .replace(
      /[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
  return shorten(escaped, 180);
}

function describe(file, summary = false) {
  const basename = file.path.split("/").pop();
  const originalBasename = file.originalPath?.split("/").pop();
  const useBasename = summary && basename !== originalBasename;
  const path = displayPath(useBasename ? basename : file.path);
  const original =
    file.originalPath &&
    displayPath(useBasename ? originalBasename : file.originalPath);
  if (file.status === "R") return `Rename ${original} to ${path}`;
  if (file.status === "C") return `Copy ${original} to ${path}`;
  if (file.status === "A") return `Add ${path}`;
  if (file.status === "D") return `Remove ${path}`;
  if (file.status === "T") return `Change file type of ${path}`;
  if (file.oldId === file.newId && file.oldMode !== file.newMode)
    return `Update permissions for ${path}`;
  return `Update ${path}`;
}

function category(path) {
  if (/(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\./i.test(path))
    return "tests";
  if (
    /(^|\/)(docs?|documentation)\/|\.(md|mdx|rst|adoc)$|(^|\/)(readme|changelog|license)(\.|$)/i.test(
      path,
    )
  )
    return "documentation";
  if (/\.(css|scss|sass|less)$/i.test(path)) return "styles";
  return null;
}

/** Build a factual draft from one raw cached diff, without reading file contents. */
export function commitMessageFromStagedDiff(raw) {
  const entries = raw.split("\0");
  const files = [];
  for (let i = 0; i < entries.length && entries[i];) {
    const header =
      /^:(\d{6}) (\d{6}) ([a-f0-9]{40,64}) ([a-f0-9]{40,64}) ([A-Z])\d*$/.exec(
        entries[i++],
      );
    if (!header || !entries[i])
      throw new Error(
        "Could not read the staged changes. Refresh and try again.",
      );
    const [, oldMode, newMode, oldId, newId, status] = header;
    if (status === "U")
      throw new Error(
        "Resolve the conflicts before generating a commit message.",
      );
    let path = entries[i++];
    let originalPath;
    if (status === "R" || status === "C") {
      originalPath = path;
      path = entries[i++];
      if (!path)
        throw new Error(
          "Could not read the staged rename. Refresh and try again.",
        );
    }
    files.push({ path, originalPath, oldMode, newMode, oldId, newId, status });
  }
  if (!files.length)
    throw new Error("Stage some changes before generating a commit message.");

  let summary;
  if (files.length === 1) summary = describe(files[0], true);
  else {
    const firstStatus = files[0].status;
    const sameAction = files.every((file) => file.status === firstStatus);
    const verb = sameAction
      ? { A: "Add", D: "Remove", R: "Rename", C: "Copy" }[firstStatus] ||
        "Update"
      : "Update";
    const commonCategory = category(files[0].path);
    const subject =
      commonCategory &&
      files.every((file) => category(file.path) === commonCategory)
        ? commonCategory
        : `${files.length} files`;
    summary = `${verb} ${subject}`;
    if (files.length === 2) {
      const second = describe(files[1], true);
      const pair = `${describe(files[0], true)} and ${second[0].toLowerCase()}${second.slice(1)}`;
      if (Array.from(pair).length <= SUMMARY_LIMIT) summary = pair;
    }
  }
  const lines = [];
  let length = 0;
  for (const file of files) {
    const line = `- ${describe(file)}`;
    if (
      lines.length >= FILE_LIMIT ||
      length + line.length + 1 > DESCRIPTION_LIMIT - 80
    )
      break;
    lines.push(line);
    length += line.length + 1;
  }
  if (lines.length < files.length)
    lines.push(`- ${files.length - lines.length} more staged files`);
  return {
    summary: shorten(summary, SUMMARY_LIMIT),
    description: lines.join("\n"),
    fileCount: files.length,
    stagedFingerprint: createHash("sha256").update(raw).digest("hex"),
  };
}
