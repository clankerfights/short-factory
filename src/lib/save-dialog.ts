import { spawn } from "node:child_process";

export async function pickMp4SavePath(suggestedName: string): Promise<string | null> {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.SaveFileDialog",
    "$dialog.Title = 'Save rendered MP4'",
    "$dialog.Filter = 'MP4 video (*.mp4)|*.mp4'",
    "$dialog.DefaultExt = 'mp4'",
    "$dialog.AddExtension = $true",
    "$dialog.OverwritePrompt = $true",
    `$dialog.FileName = ${powershellStringLiteral(suggestedName)}`,
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::Out.Write($dialog.FileName)",
    "}",
  ].join("; ");

  const result = await runPowerShell(["-NoProfile", "-STA", "-Command", script]);
  const selectedPath = result.trim();
  return selectedPath || null;
}

function runPowerShell(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", args, {
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            Buffer.concat(stderr).toString("utf8") ||
              `Save dialog exited with code ${code}.`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

function powershellStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
