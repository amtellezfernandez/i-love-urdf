import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { rootDir } from "./loadDist.mjs";

const cliPath = path.join(rootDir, "dist", "cli.js");

const shellEscape = (value) => `'${value.replace(/'/g, `'\"'\"'`)}'`;

const resolveScriptLauncher = () => {
  if (process.platform === "win32") {
    return null;
  }

  const gnuProbe = spawnSync("script", ["-qec", "true", "/dev/null"], {
    cwd: rootDir,
    stdio: "ignore",
  });
  if (gnuProbe.status === 0) {
    return {
      command: "script",
      argsFor(commandArgs) {
        return ["-qec", commandArgs.map(shellEscape).join(" "), "/dev/null"];
      },
    };
  }

  const bsdProbe = spawnSync("script", ["-q", "/dev/null", "true"], {
    cwd: rootDir,
    stdio: "ignore",
  });
  if (bsdProbe.status === 0) {
    return {
      command: "script",
      argsFor(commandArgs) {
        return ["-q", "/dev/null", ...commandArgs];
      },
    };
  }

  return null;
};

const scriptLauncher = resolveScriptLauncher();

export const supportsPtyShellTests = Boolean(scriptLauncher);

export const sanitizePtyOutput = (value) =>
  value
    .replace(/\u001b\].*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u0007/g, "")
    .replace(/\r/g, "\n");

export const runPtyShellSession = ({
  steps = [],
  env = {},
  timeoutMs = 8_000,
} = {}) =>
  new Promise((resolve, reject) => {
    if (!scriptLauncher) {
      reject(new Error("PTY shell tests are not supported on this machine."));
      return;
    }

    const child = spawn(
      scriptLauncher.command,
      scriptLauncher.argsFor([process.execPath, cliPath]),
      {
        cwd: rootDir,
        env: {
          ...process.env,
          NO_COLOR: "1",
          ...env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let output = "";
    const append = (chunk) => {
      output += chunk.toString();
      if (output.length > 200_000) {
        output = output.slice(-200_000);
      }
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", reject);

    let elapsedMs = 0;
    for (const step of steps) {
      elapsedMs += step.delayMs ?? 0;
      setTimeout(() => {
        if (!child.killed) {
          child.stdin.write(step.data);
        }
      }, elapsedMs);
    }

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`PTY shell session timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        output,
        sanitizedOutput: sanitizePtyOutput(output),
      });
    });
  });
