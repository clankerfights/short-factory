import { execFile } from "node:child_process";

export function runNpmScript(script: string, args: string[]): Promise<string> {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm", "run", script, "--", ...args]
      : ["run", script, "--", ...args];

  return new Promise((resolve, reject) => {
    execFile(
      command,
      commandArgs,
      {
        cwd: process.cwd(),
        timeout: 300_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}
