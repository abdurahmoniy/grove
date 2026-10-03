export interface DiffLine {
  type: "add" | "delete" | "context" | "hunk";
  text: string;
  old?: number;
  next?: number;
}

export function parseDiff(text: string): DiffLine[] {
  const result: DiffLine[] = [];
  const rawLines = text.split("\n");
  let old = 0;
  let next = 0;
  let oldRemaining = 0;
  let nextRemaining = 0;
  let canAnnotate = false;

  for (let index = 0; index < rawLines.length; index++) {
    const line = rawLines[index];
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(
      line,
    );
    if (hunk) {
      old = Number(hunk[1]);
      next = Number(hunk[3]);
      oldRemaining = Number(hunk[2] ?? 1);
      nextRemaining = Number(hunk[4] ?? 1);
      canAnnotate = false;
      result.push({ type: "hunk", text: line });
      continue;
    }
    if (line.startsWith("@@@ ")) {
      // Combined diffs have one prefix per parent, not ordinary +/- columns.
      oldRemaining = 0;
      nextRemaining = 0;
      canAnnotate = false;
      result.push({ type: "hunk", text: line });
      continue;
    }
    if (line === "\\ No newline at end of file" && canAnnotate) {
      result.push({ type: "hunk", text: line });
      canAnnotate = false;
      continue;
    }
    canAnnotate = false;
    if (oldRemaining === 0 && nextRemaining === 0) continue;

    // Prefixes are source content while inside a hunk, including --- and +++.
    if (line.startsWith("-") && oldRemaining > 0) {
      result.push({ type: "delete", text: line.slice(1), old: old++ });
      oldRemaining--;
    } else if (line.startsWith("+") && nextRemaining > 0) {
      result.push({ type: "add", text: line.slice(1), next: next++ });
      nextRemaining--;
    } else if (
      (line.startsWith(" ") || (line === "" && index < rawLines.length - 1)) &&
      oldRemaining > 0 &&
      nextRemaining > 0
    ) {
      result.push({
        type: "context",
        text: line.slice(1),
        old: old++,
        next: next++,
      });
      oldRemaining--;
      nextRemaining--;
    } else {
      // File metadata or an incomplete/unsupported patch ends the current hunk.
      oldRemaining = 0;
      nextRemaining = 0;
      continue;
    }
    canAnnotate = true;
  }
  return result;
}
