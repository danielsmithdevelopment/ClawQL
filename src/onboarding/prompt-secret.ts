import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

/** Prompt for a secret; hides echo on Unix TTY when `/dev/tty` is available. */
export async function promptSecret(message: string): Promise<string> {
  if (process.platform !== "win32" && existsSync("/dev/tty") && process.stdin.isTTY) {
    return promptSecretUnixTty(message);
  }
  const rl = createInterface({ input, output });
  try {
    if (!process.stdin.isTTY) {
      output.write(`${message} (piped input — ensure no one is watching)\n`);
    } else {
      output.write("(token echo visible on this platform)\n");
    }
    return (await rl.question(`${message}: `)).trim();
  } finally {
    rl.close();
  }
}

function promptSecretUnixTty(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fd: number | undefined;
    try {
      fd = openSync("/dev/tty", "r+");
      output.write(`${message}: `);
      const chunks: Buffer[] = [];
      const buf = Buffer.alloc(1);
      while (true) {
        const n = readSync(fd, buf, 0, 1, null);
        if (n <= 0) break;
        const c = buf[0]!;
        if (c === 10 || c === 13) break;
        if (c === 3) {
          output.write("^C\n");
          reject(new Error("cancelled"));
          return;
        }
        if (c === 127 || c === 8) {
          if (chunks.length) chunks.pop();
          continue;
        }
        chunks.push(Buffer.from([c]));
      }
      output.write("\n");
      resolve(Buffer.concat(chunks).toString("utf8").trim());
    } catch (e) {
      reject(e);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  });
}
