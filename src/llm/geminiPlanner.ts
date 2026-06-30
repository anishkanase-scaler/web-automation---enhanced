import type { AppConfig } from "../config.js";
import type { Logger } from "../utils/logger.js";

export type PlannedAction =
  | { action: "open_browser" }
  | { action: "close_browser" }
  | { action: "navigate_to_url"; url: string }
  | { action: "take_screenshot"; label?: string }
  | { action: "click_on_screen"; x: number; y: number }
  | { action: "double_click"; x: number; y: number }
  | { action: "send_keys"; text: string }
  | { action: "press_key"; key: string }
  | { action: "scroll"; deltaY?: number; deltaX?: number }
  | { action: "go_back" }
  | { action: "go_forward" }
  | { action: "reload" }
  | { action: "wait"; milliseconds?: number }
  | { action: "detect_form_elements" }
  | { action: "fill_field"; field: string; value: string }
  | { action: "focus_field"; field: string }
  | { action: "click_text"; text: string }
  | { action: "click_first_result" }
  | { action: "click_first_youtube_video" }
  | { action: "play_pause_media" }
  | { action: "submit_form" }
  | { action: "search_web"; query: string; engine?: "google" | "bing" | "duckduckgo" }
  | { action: "search_youtube"; query: string }
  | { action: "play_youtube_video"; query: string }
  | { action: "help" }
  | { action: "unknown"; reason: string };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const SHADCN_FORM_URL = "https://ui.shadcn.com/docs/forms/react-hook-form";

export class GeminiPlanner {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly logger: Logger
  ) {}

  get enabled(): boolean {
    return Boolean(this.appConfig.geminiApiKey);
  }

  async plan(userCommand: string): Promise<PlannedAction | null> {
    if (!this.appConfig.geminiApiKey) return null;

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.appConfig.geminiModel)}` +
      `:generateContent?key=${encodeURIComponent(this.appConfig.geminiApiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPlannerPrompt(userCommand) }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      await this.logger.warn("Gemini planner request failed", {
        status: response.status,
        body: body.slice(0, 500)
      });
      return null;
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return null;

    try {
      const planned = JSON.parse(stripCodeFence(text)) as PlannedAction;
      const normalized = normalizePlannedAction(planned);
      await this.logger.info("Gemini planned action", normalized);
      return normalized;
    } catch (error) {
      await this.logger.warn("Could not parse Gemini planner output", {
        text,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}

function buildPlannerPrompt(userCommand: string): string {
  return `You are a browser automation command planner.
Convert the user's command into exactly one JSON object. Do not add markdown.
You are not allowed to invent code or execute anything. Only choose one action from this list:

open_browser: {}
close_browser: {}
navigate_to_url: {"url":"https://example.com"}
take_screenshot: {"label":"before"}
click_on_screen: {"x":500,"y":300}
double_click: {"x":500,"y":300}
send_keys: {"text":"hello"}
press_key: {"key":"Enter"}
scroll: {"deltaY":600,"deltaX":0}
go_back: {}
go_forward: {}
reload: {}
wait: {"milliseconds":1500}
detect_form_elements: {}
fill_field: {"field":"name","value":"Kabee Student"}
focus_field: {"field":"description"}
click_text: {"text":"Submit"}
click_first_result: {}
click_first_youtube_video: {}
play_pause_media: {}
submit_form: {}
search_web: {"query":"playwright typescript","engine":"google"}
search_youtube: {"query":"shadcn react hook form"}
play_youtube_video: {"query":"lofi music"}
help: {}
unknown: {"reason":"short reason"}

Rules:
- If the user says shadcn form page, react hook form page, assignment page, or target page, use url "${SHADCN_FORM_URL}".
- If the user says open netflix, open youtube, open google, open github, open gmail, open amazon, open flipkart, or open chatgpt, use navigate_to_url with the correct public website URL.
- If they ask to search YouTube, use search_youtube.
- If they ask to play a video/song/tutorial on YouTube, use play_youtube_video with the requested query.
- If they ask to play, pause, resume, or stop media on the current page, use play_pause_media.
- If they ask to click/open the first result, use click_first_result. On YouTube results, use click_first_youtube_video.
- If they ask to go back, go forward, reload, wait, or press a keyboard key, use the matching action.
- If they ask to Google/search the web, use search_web.
- If they mention coordinates, extract x and y as numbers.
- If they ask to fill or enter a value into a named form field, use fill_field.
- If they ask to click/focus a named form field, use focus_field.
- If they ask to click a button/link/text by visible words, use click_text.
- Return only valid JSON like {"action":"open_browser"}.

User command: ${JSON.stringify(userCommand)}`;
}

function normalizePlannedAction(action: PlannedAction): PlannedAction {
  if (action.action === "navigate_to_url") {
    return { ...action, url: normalizeUrl(action.url) };
  }
  if (action.action === "scroll") {
    return { ...action, deltaY: action.deltaY ?? 600, deltaX: action.deltaX ?? 0 };
  }
  if (action.action === "wait") {
    return { ...action, milliseconds: action.milliseconds ?? 1500 };
  }
  if (action.action === "search_web") {
    return { ...action, engine: action.engine ?? "google" };
  }
  return action;
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
}