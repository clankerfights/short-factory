import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export async function openContainingFolder(filePath: string): Promise<string> {
  const resolvedFile = path.resolve(filePath);
  const stat = await fs.stat(resolvedFile);
  const folder = stat.isDirectory() ? resolvedFile : path.dirname(resolvedFile);

  if (process.platform === "win32") {
    const args = stat.isDirectory() ? [folder] : [`/select,${resolvedFile}`];
    spawnDetached("explorer.exe", args);
    return folder;
  }

  if (process.platform === "darwin") {
    const args = stat.isDirectory() ? [folder] : ["-R", resolvedFile];
    spawnDetached("open", args);
    return folder;
  }

  spawnDetached("xdg-open", [folder]);
  return folder;
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}
