import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export class Logger {
  private readonly logFile: string;

  constructor(logDir: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logFile = path.join(logDir, `agent-${stamp}.log`);
  }

  async info(message: string, details?: unknown): Promise<void> {
    await this.write("INFO", message, details);
  }

  async warn(message: string, details?: unknown): Promise<void> {
    await this.write("WARN", message, details);
  }

  async error(message: string, details?: unknown): Promise<void> {
    await this.write("ERROR", message, details);
  }

  private async write(level: string, message: string, details?: unknown): Promise<void> {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      details
    };

    await mkdir(path.dirname(this.logFile), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.logFile, line, "utf8");

    const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;
    console.log(`[${entry.time}] ${level}: ${message}${suffix}`);
  }
}
