import type { AutomationAgent } from "../agent/automationAgent.js";
import type { AppConfig } from "../config.js";
import type { BrowserTools } from "../tools/browserTools.js";
import type { Logger } from "../utils/logger.js";

const SEARCH_URLS: Record<AppConfig["searchEngine"], string> = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q="
};

export async function runSearchTask(
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger,
  query: string,
  engine: AppConfig["searchEngine"]
): Promise<void> {
  await tools.open_browser();
  await tools.navigate_to_url(`${SEARCH_URLS[engine]}${encodeURIComponent(query)}`);
  await tools.take_screenshot(`search-${engine}`);

  const title = await agent.page.title();
  await logger.info("Search task completed", { engine, query, title });
}

export async function runYouTubeSearchTask(
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger,
  query: string
): Promise<void> {
  await tools.open_browser();
  await tools.navigate_to_url("https://www.youtube.com/");

  const searchBox = agent.page.getByRole("combobox", { name: /search/i }).first();
  if ((await searchBox.count()) > 0) {
    await searchBox.fill(query);
    await searchBox.press("Enter");
  } else {
    await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
  }

  await agent.page.waitForLoadState("domcontentloaded");
  await tools.take_screenshot("youtube-search");
  await logger.info("YouTube search task completed", { query, title: await agent.page.title() });
}
