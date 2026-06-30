import "dotenv/config";

export type AppConfig = {
  headless: boolean;
  slowMo: number;
  actionDelayMs: number;
  keyboardDelayMs: number;
  defaultTimeoutMs: number;
  screenshotDir: string;
  logDir: string;
  geminiApiKey?: string;
  geminiModel: string;
  assignmentName: string;
  assignmentDescription: string;
  searchEngine: "google" | "bing" | "duckduckgo";
  searchQuery: string;
  youtubeQuery: string;
};

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function searchEngineFromEnv(value: string | undefined): AppConfig["searchEngine"] {
  if (value === "bing" || value === "duckduckgo") return value;
  return "google";
}

function optionalSecretFromEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "your_gemini_api_key_here") return undefined;
  return trimmed;
}

export const config: AppConfig = {
  headless: boolFromEnv(process.env.HEADLESS, false),
  slowMo: numberFromEnv(process.env.BROWSER_SLOW_MO, 250),
  actionDelayMs: numberFromEnv(process.env.ACTION_DELAY_MS, 700),
  keyboardDelayMs: numberFromEnv(process.env.KEYBOARD_DELAY_MS, 35),
  defaultTimeoutMs: numberFromEnv(process.env.DEFAULT_TIMEOUT_MS, 15_000),
  screenshotDir: process.env.SCREENSHOT_DIR ?? "screenshots",
  logDir: process.env.LOG_DIR ?? "logs",
  geminiApiKey: optionalSecretFromEnv(process.env.GEMINI_API_KEY),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  assignmentName: process.env.ASSIGNMENT_NAME ?? "Kabee Student",
  assignmentDescription:
    process.env.ASSIGNMENT_DESCRIPTION ??
    "Steps: open login, tap button; expected dashboard; actual nothing happens on mobile.",
  searchEngine: searchEngineFromEnv(process.env.SEARCH_ENGINE),
  searchQuery: process.env.SEARCH_QUERY ?? "Playwright browser automation TypeScript",
  youtubeQuery: process.env.YOUTUBE_QUERY ?? "TypeScript Playwright automation tutorial"
};