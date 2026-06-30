import readline from "node:readline/promises";
import { config } from "../config.js";
import { GeminiPlanner, type PlannedAction } from "../llm/geminiPlanner.js";
import { stdin as input, stdout as output } from "node:process";
import type { AutomationAgent } from "../agent/automationAgent.js";
import type { BrowserTools } from "../tools/browserTools.js";
import type { Logger } from "../utils/logger.js";

const SHADCN_FORM_URL = "https://ui.shadcn.com/docs/forms/react-hook-form";
const SITE_SHORTCUTS = new Map<string, string>([
  ["google", "https://www.google.com"],
  ["youtube", "https://www.youtube.com"],
  ["netflix", "https://www.netflix.com"],
  ["github", "https://github.com"],
  ["gmail", "https://mail.google.com"],
  ["amazon", "https://www.amazon.com"],
  ["flipkart", "https://www.flipkart.com"],
  ["chatgpt", "https://chatgpt.com"]
]);
const SITE_SEARCH_URLS = new Map<string, string>([
  ["amazon", "https://www.amazon.com/s?k="],
  ["flipkart", "https://www.flipkart.com/search?q="],
  ["youtube", "https://www.youtube.com/results?search_query="],
  ["google", "https://www.google.com/search?q="],
  ["github", "https://github.com/search?q="]
]);
const EXACT_COMMANDS = new Set([
  "help",
  "open_browser",
  "navigate_to_url",
  "take_screenshot",
  "click_on_screen",
  "send_keys",
  "press_key",
  "scroll",
  "go_back",
  "go_forward",
  "reload",
  "wait",
  "double_click",
  "detect_form_elements",
  "fill_field",
  "close_browser",
  "click_first_result",
  "click_first_youtube_video",
  "play_pause_media",
  "play_youtube_video"
]);

export async function runInteractiveShell(
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger
): Promise<void> {
  const rl = readline.createInterface({ input, output, prompt: "agent> " });
  const showPrompt = input.isTTY === true;
  const planner = new GeminiPlanner(config, logger);

  console.log("\nNatural Language Website Automation Agent");
  console.log("Type commands normally, for example: open browser, go to shadcn form page, fill name with Kabee. Type help for examples.");
  console.log(planner.enabled ? "Gemini planner: enabled.\n" : "Gemini planner: disabled, using local parser. Add GEMINI_API_KEY in .env to enable it.\n");
  if (showPrompt) rl.prompt();

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) {
        if (showPrompt) rl.prompt();
        continue;
      }

      const [command, ...args] = splitCommandLine(line);

      try {
        if (command === "exit" || command === "quit") break;
        if (EXACT_COMMANDS.has(command)) {
          await runExactCommand(command, args, tools, agent, logger);
        } else if (shouldUseLocalParserFirst(line)) {
          await runNaturalCommand(line, tools, agent, logger);
        } else {
          const planned = await planner.plan(line);
          if (planned && planned.action !== "unknown") {
            await runPlannedAction(planned, tools, agent, logger);
          } else {
            await runNaturalCommand(line, tools, agent, logger);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logger.error("Interactive command failed", { line, message });
        console.log(`Error: ${message}`);
      }

      if (showPrompt) rl.prompt();
    }
  } finally {
    rl.close();
    await tools.close();
  }
}

function shouldUseLocalParserFirst(line: string): boolean {
  return /\b(open|go to|navigate|visit|load|search|google|bing|duckduckgo|youtube|netflix|github|gmail|amazon|flipkart|chatgpt|screenshot|screen shot|capture|snapshot|fill|type|write|click|double click|scroll|press|hit|back|forward|reload|refresh|wait|pause|play|resume|submit|detect|show|list|find)\b/i.test(line);
}
async function runPlannedAction(
  planned: PlannedAction,
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger
): Promise<void> {
  switch (planned.action) {
    case "open_browser":
      await tools.open_browser();
      console.log("Browser opened.");
      return;
    case "close_browser":
      await tools.close();
      console.log("Browser closed.");
      return;
    case "navigate_to_url":
      await ensureBrowserOpen(tools);
      await tools.navigate_to_url(planned.url);
      console.log(`Navigated to ${planned.url}`);
      return;
    case "take_screenshot": {
      await ensureBrowserOpen(tools);
      const filePath = await tools.take_screenshot(planned.label ?? "gemini-command");
      console.log(`Screenshot saved: ${filePath}`);
      return;
    }
    case "click_on_screen":
      await tools.click_on_screen(planned.x, planned.y);
      console.log(`Clicked at (${planned.x}, ${planned.y}).`);
      return;
    case "double_click":
      await tools.double_click(planned.x, planned.y);
      console.log(`Double clicked at (${planned.x}, ${planned.y}).`);
      return;
    case "send_keys":
      await tools.send_keys(planned.text);
      console.log(`Typed ${planned.text.length} characters.`);
      return;
    case "press_key":
      await tools.press_key(planned.key);
      console.log(`Pressed ${planned.key}.`);
      return;
    case "scroll":
      await tools.scroll(planned.deltaY ?? 600, planned.deltaX ?? 0);
      console.log(`Scrolled by deltaY=${planned.deltaY ?? 600}, deltaX=${planned.deltaX ?? 0}.`);
      return;
    case "go_back":
      await tools.go_back();
      console.log("Went back.");
      return;
    case "go_forward":
      await tools.go_forward();
      console.log("Went forward.");
      return;
    case "reload":
      await tools.reload();
      console.log("Reloaded page.");
      return;
    case "wait":
      await tools.wait(planned.milliseconds ?? 1500);
      console.log(`Waited ${planned.milliseconds ?? 1500}ms.`);
      return;
    case "detect_form_elements":
      await printDetectedElements(agent);
      return;
    case "fill_field":
      await fillField(agent, expandFieldAliases(planned.field), planned.value);
      return;
    case "focus_field": {
      const result = await agent.focusBestMatchingField(expandFieldAliases(planned.field));
      console.log(result.filled ? `Focused ${planned.field} using ${result.matchedBy}.` : `Could not find ${planned.field}.`);
      return;
    }
    case "click_text": {
      const clicked = await agent.clickElementByText(new RegExp(escapeRegExp(planned.text), "i"));
      console.log(clicked ? `Clicked text: ${planned.text}` : `Could not find visible text: ${planned.text}`);
      return;
    }
    case "click_first_result": {
      const clicked = await agent.clickFirstSearchResult();
      console.log(clicked ? "Clicked the first result." : "Could not find a first result to click.");
      return;
    }
    case "click_first_youtube_video": {
      const clicked = await agent.clickFirstYouTubeVideo();
      console.log(clicked ? "Clicked the first YouTube video." : "Could not find a YouTube video to click.");
      return;
    }
    case "play_pause_media":
      await agent.playOrPauseMedia();
      console.log("Toggled playback.");
      return;
    case "submit_form": {
      const submitted = await agent.submitLikelyForm();
      console.log(submitted ? "Submitted the likely form." : "Could not find a submit button.");
      return;
    }
    case "search_web": {
      const engine = planned.engine ?? "google";
      const urls = {
        google: "https://www.google.com/search?q=",
        bing: "https://www.bing.com/search?q=",
        duckduckgo: "https://duckduckgo.com/?q="
      } as const;
      await ensureBrowserOpen(tools);
      await tools.navigate_to_url(`${urls[engine]}${encodeURIComponent(planned.query)}`);
      await logger.info("Gemini command: web search", planned);
      console.log(`Searched ${engine} for: ${planned.query}`);
      return;
    }
    case "search_youtube":
      await ensureBrowserOpen(tools);
      await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(planned.query)}`);
      await logger.info("Gemini command: YouTube search", planned);
      console.log(`Searched YouTube for: ${planned.query}`);
      return;
    case "play_youtube_video":
      await ensureBrowserOpen(tools);
      await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(planned.query)}`);
      if (await agent.clickFirstYouTubeVideo()) {
        console.log(`Playing first YouTube result for: ${planned.query}`);
      } else {
        console.log(`Searched YouTube, but could not click a video for: ${planned.query}`);
      }
      return;
    case "help":
      printInteractiveHelp();
      return;
    case "unknown":
      console.log(`Gemini could not map that command: ${planned.reason}`);
      return;
  }
}async function runExactCommand(
  command: string,
  args: string[],
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger
): Promise<void> {
  switch (command) {
    case "help":
      printInteractiveHelp();
      return;
    case "open_browser":
      await tools.open_browser();
      console.log("Browser opened.");
      return;
    case "navigate_to_url": {
      const url = requireArg(args, 0, "URL is required.");
      await ensureBrowserOpen(tools);
      await tools.navigate_to_url(normalizeUrl(url));
      console.log(`Navigated to ${normalizeUrl(url)}`);
      return;
    }
    case "take_screenshot": {
      const filePath = await tools.take_screenshot(args[0] ?? "interactive");
      console.log(`Screenshot saved: ${filePath}`);
      return;
    }
    case "click_on_screen": {
      const x = numberArg(args, 0, "x coordinate is required.");
      const y = numberArg(args, 1, "y coordinate is required.");
      await tools.click_on_screen(x, y);
      console.log(`Clicked at (${x}, ${y}).`);
      return;
    }
    case "double_click": {
      const x = numberArg(args, 0, "x coordinate is required.");
      const y = numberArg(args, 1, "y coordinate is required.");
      await tools.double_click(x, y);
      console.log(`Double clicked at (${x}, ${y}).`);
      return;
    }
    case "send_keys": {
      const text = args.join(" ");
      if (!text) throw new Error("Text is required.");
      await tools.send_keys(text);
      console.log(`Typed ${text.length} characters.`);
      return;
    }
    case "press_key": {
      const key = requireArg(args, 0, "Key is required, for example Enter or Escape.");
      await tools.press_key(key);
      console.log(`Pressed ${key}.`);
      return;
    }
    case "scroll": {
      const deltaY = args[0] === undefined ? 600 : numberArg(args, 0, "deltaY must be a number.");
      const deltaX = args[1] === undefined ? 0 : numberArg(args, 1, "deltaX must be a number.");
      await tools.scroll(deltaY, deltaX);
      console.log(`Scrolled by deltaY=${deltaY}, deltaX=${deltaX}.`);
      return;
    }
    case "go_back":
      await tools.go_back();
      console.log("Went back.");
      return;
    case "go_forward":
      await tools.go_forward();
      console.log("Went forward.");
      return;
    case "reload":
      await tools.reload();
      console.log("Reloaded page.");
      return;
    case "wait": {
      const ms = args[0] === undefined ? 1500 : numberArg(args, 0, "Milliseconds must be a number.");
      await tools.wait(ms);
      console.log(`Waited ${ms}ms.`);
      return;
    }
    case "detect_form_elements":
      await printDetectedElements(agent);
      return;
    case "fill_field": {
      const label = requireArg(args, 0, "Field label is required.");
      const value = args.slice(1).join(" ");
      if (!value) throw new Error("Field value is required.");
      await fillField(agent, [label], value);
      return;
    }
    case "click_first_result": {
      const clicked = await agent.clickFirstSearchResult();
      console.log(clicked ? "Clicked the first result." : "Could not find a first result to click.");
      return;
    }
    case "click_first_youtube_video": {
      const clicked = await agent.clickFirstYouTubeVideo();
      console.log(clicked ? "Clicked the first YouTube video." : "Could not find a YouTube video to click.");
      return;
    }
    case "play_pause_media":
      await agent.playOrPauseMedia();
      console.log("Toggled playback.");
      return;
    case "play_youtube_video": {
      const query = args.join(" ");
      if (!query) throw new Error("Video search query is required.");
      await ensureBrowserOpen(tools);
      await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      const clicked = await agent.clickFirstYouTubeVideo();
      console.log(clicked ? `Playing first YouTube result for: ${query}` : `Could not find a YouTube video for: ${query}`);
      return;
    }
    case "close_browser":
      await tools.close();
      console.log("Browser closed.");
      return;
    default:
      await logger.warn("Unknown exact command", { command });
      console.log(`Unknown command: ${command}. Type help for examples.`);
  }
}

async function runNaturalCommand(
  line: string,
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger
): Promise<void> {
  const lower = line.toLowerCase();

  if (/\b(help|what can you do|examples)\b/.test(lower)) {
    printInteractiveHelp();
    return;
  }

  if (/\b(open|launch|start)\b.*\bbrowser\b/.test(lower)) {
    await tools.open_browser();
    console.log("Browser opened.");
    return;
  }

  if (/\b(close|stop|shutdown)\b.*\bbrowser\b/.test(lower)) {
    await tools.close();
    console.log("Browser closed.");
    return;
  }

  if (/\b(go back|back page|previous page)\b/.test(lower)) {
    await tools.go_back();
    console.log("Went back.");
    return;
  }

  if (/\b(go forward|forward page|next page)\b/.test(lower)) {
    await tools.go_forward();
    console.log("Went forward.");
    return;
  }

  if (/\b(reload|refresh)\b/.test(lower)) {
    await tools.reload();
    console.log("Reloaded page.");
    return;
  }

  const waitMs = extractWaitAmount(line);
  if (waitMs !== null) {
    await tools.wait(waitMs);
    console.log(`Waited ${waitMs}ms.`);
    return;
  }

  const key = extractPressKey(line);
  if (key) {
    await tools.press_key(key);
    console.log(`Pressed ${key}.`);
    return;
  }

  const searchThenPlay = extractSearchThenPlayFirst(line);
  if (searchThenPlay) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchThenPlay)}`);
    const clicked = await agent.clickFirstYouTubeVideo();
    console.log(clicked ? `Playing first YouTube result for: ${searchThenPlay}` : `Searched YouTube, but could not click a video for: ${searchThenPlay}`);
    return;
  }

  const playQuery = extractPlayYouTubeQuery(line);
  if (playQuery) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(playQuery)}`);
    const clicked = await agent.clickFirstYouTubeVideo();
    console.log(clicked ? `Playing first YouTube result for: ${playQuery}` : `Could not find a YouTube video for: ${playQuery}`);
    return;
  }

  if (/\b(play|pause|resume|stop)\b.*\b(video|media|song|music)\b/.test(lower) || /\b(pause|resume)\b$/.test(lower)) {
    await agent.playOrPauseMedia();
    console.log("Toggled playback.");
    return;
  }

  if (/\b(click|open)\b.*\b(first|top)\b.*\b(youtube\s+)?(video|result)\b/.test(lower)) {
    const clicked = /youtube|video/.test(lower) ? await agent.clickFirstYouTubeVideo() : await agent.clickFirstSearchResult();
    console.log(clicked ? "Clicked the first result." : "Could not find a first result to click.");
    return;
  }

  if (/\b(screenshot|screen shot|capture|snapshot)\b/.test(lower)) {
    await ensureBrowserOpen(tools);
    const label = extractAfterWords(line, ["called", "named", "as"]) ?? "natural-command";
    const filePath = await tools.take_screenshot(slug(label));
    console.log(`Screenshot saved: ${filePath}`);
    return;
  }

  if (/\b(detect|find|list|show)\b.*\b(form|fields?|inputs?|elements?)\b/.test(lower)) {
    await printDetectedElements(agent);
    return;
  }

  const fill = extractFillCommand(line);
  if (fill) {
    await fillField(agent, expandFieldAliases(fill.field), fill.value);
    return;
  }

  const siteSearch = extractSiteSearch(line);
  if (siteSearch) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(`${siteSearch.url}${encodeURIComponent(siteSearch.query)}`);
    await logger.info("Natural command: site search", siteSearch);
    console.log(`Searched ${siteSearch.site} for: ${siteSearch.query}`);
    return;
  }

  const chromeGoogleSearch = extractGoogleChromeSearch(line);
  if (chromeGoogleSearch) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(`https://www.google.com/search?q=${encodeURIComponent(chromeGoogleSearch)}`);
    await logger.info("Natural command: Google Chrome search", { query: chromeGoogleSearch });
    console.log(`Searched google for: ${chromeGoogleSearch}`);
    return;
  }

  const youtubeQuery = extractYouTubeQuery(line);
  if (youtubeQuery) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(`https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`);
    await logger.info("Natural command: YouTube search", { query: youtubeQuery });
    console.log(`Searched YouTube for: ${youtubeQuery}`);
    return;
  }

  const webSearch = extractWebSearch(line);
  if (webSearch) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(`${webSearch.url}${encodeURIComponent(webSearch.query)}`);
    await logger.info("Natural command: web search", webSearch);
    console.log(`Searched ${webSearch.engine} for: ${webSearch.query}`);
    return;
  }

  const url = extractNavigationUrl(line);
  if (url) {
    await ensureBrowserOpen(tools);
    await tools.navigate_to_url(url);
    console.log(`Navigated to ${url}`);
    return;
  }

  const clickCoordinates = extractCoordinateCommand(line, /\bclick\b/i);
  if (clickCoordinates && !/double\s+click/i.test(line)) {
    await tools.click_on_screen(clickCoordinates.x, clickCoordinates.y);
    console.log(`Clicked at (${clickCoordinates.x}, ${clickCoordinates.y}).`);
    return;
  }

  const doubleClickCoordinates = extractCoordinateCommand(line, /\bdouble\s+click\b/i);
  if (doubleClickCoordinates) {
    await tools.double_click(doubleClickCoordinates.x, doubleClickCoordinates.y);
    console.log(`Double clicked at (${doubleClickCoordinates.x}, ${doubleClickCoordinates.y}).`);
    return;
  }

  const fieldToFocus = extractFieldClick(line);
  if (fieldToFocus) {
    const result = await agent.focusBestMatchingField(expandFieldAliases(fieldToFocus));
    console.log(result.filled ? `Focused ${fieldToFocus} using ${result.matchedBy}.` : `Could not find ${fieldToFocus}.`);
    return;
  }

  const textToClick = extractClickText(line);
  if (textToClick) {
    const clicked = await agent.clickElementByText(new RegExp(escapeRegExp(textToClick), "i"));
    console.log(clicked ? `Clicked text: ${textToClick}` : `Could not find visible text: ${textToClick}`);
    return;
  }

  const textToType = extractTypeText(line);
  if (textToType) {
    await tools.send_keys(textToType);
    console.log(`Typed ${textToType.length} characters.`);
    return;
  }

  const scrollAmount = extractScrollAmount(line);
  if (scrollAmount !== null) {
    await tools.scroll(scrollAmount);
    console.log(`Scrolled by ${scrollAmount}.`);
    return;
  }

  if (/\b(submit|send form|save form)\b/.test(lower)) {
    const submitted = await agent.submitLikelyForm();
    console.log(submitted ? "Submitted the likely form." : "Could not find a submit button.");
    return;
  }

  await logger.warn("Could not understand natural command", { line });
  console.log("I could not map that to a browser action yet. Try: open browser, go to <url>, search for <query>, click at 500 300, type <text>, fill name with <value>, or take screenshot.");
}

function extractNavigationUrl(line: string): string | null {
  const lower = line.toLowerCase();
  if (/\b(shadcn|react hook form|assignment page|form page)\b/.test(lower)) {
    return SHADCN_FORM_URL;
  }

  const shortcut = extractSiteShortcut(lower);
  if (shortcut) return shortcut;

  const urlMatch = line.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
  if (urlMatch && /\b(go|open|navigate|visit|load)\b/i.test(line)) {
    return normalizeUrl(urlMatch[1]);
  }

  return null;
}

function extractSiteShortcut(lowerLine: string): string | null {
  if (!/\b(open|go to|navigate to|visit|load)\b/.test(lowerLine)) return null;
  for (const [name, url] of SITE_SHORTCUTS) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(lowerLine)) return url;
  }
  return null;
}

function extractSiteSearch(line: string): { site: string; url: string; query: string } | null {
  if (/\b(screenshot|screen shot|capture|snapshot)\b/i.test(line)) return null;

  const patterns = [
    /(?:go to|open|visit|navigate to)?\s*([a-z0-9-]+)\s+(?:and\s+)?search\s+(?:for\s+)?(.+)/i,
    /search\s+(?:for\s+)?(.+?)\s+(?:at|on|in)\s+([a-z0-9-]+)(?:\s+(?:website|site|app))?$/i
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) continue;

    const firstPattern = /(?:go to|open|visit|navigate to)?\s*([a-z0-9-]+)\s+(?:and\s+)?search/i.test(match[0]);
    const site = cleanValue(firstPattern ? match[1] : match[2]).toLowerCase();
    const query = cleanSearchQuery(firstPattern ? match[2] : match[1]);
    const url = SITE_SEARCH_URLS.get(site);
    if (url && query) return { site, url, query };
  }

  return null;
}

function extractGoogleChromeSearch(line: string): string | null {
  const patterns = [
    /(?:go to|open)?\s*(?:google chrome|chrome|google)\s*(?:and\s*)?search\s+(?:for\s+)?(.+)/i,
    /search\s+(.+?)\s+(?:at|on|in)\s+(?:google chrome|chrome|google)$/i
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    const query = cleanSearchQuery(match[1]);
    if (query) return query;
  }

  return null;
}

function extractYouTubeQuery(line: string): string | null {
  if (/\b(screenshot|screen shot|capture|snapshot)\b/i.test(line)) return null;
  const match = line.match(/(?:\bsearch\b|\bfind\b|\blook up\b)\s*(?:on\s+)?youtube\s*(?:for\s+)?(.+)|\byoutube\s+search\s*(?:for\s+)?(.+)/i);
  if (!match) return null;
  const query = cleanValue(match[1] ?? match[2] ?? "");
  if (!query || /^(\.com|home|website)$/i.test(query)) return null;
  return query;
}

function extractWebSearch(line: string): { engine: string; url: string; query: string } | null {
  if (/\b(screenshot|screen shot|capture|snapshot)\b/i.test(line)) return null;
  const match = line.match(/^(?:please\s+)?\s*\b(search|google|bing|duckduckgo|look up|find)\b\s*(?:the web\s*)?(?:search\s*)?(?:for\s+)?(.+)/i);
  if (!match) return null;

  const engineWord = match[1].toLowerCase();
  const query = cleanSearchQuery(match[2]);
  if (!query || /^youtube\b/i.test(query)) return null;

  if (engineWord === "bing") return { engine: "bing", url: "https://www.bing.com/search?q=", query };
  if (engineWord === "duckduckgo") return { engine: "duckduckgo", url: "https://duckduckgo.com/?q=", query };
  return { engine: "google", url: "https://www.google.com/search?q=", query };
}

function extractFillCommand(line: string): { field: string; value: string } | null {
  const patterns = [
    /(?:fill|set|put|enter|input)\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(?:with|to|as)\s+(.+)/i,
    /(?:type|write)\s+(.+?)\s+(?:in|into)\s+(?:the\s+)?(.+?)(?:\s+field)?$/i
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    if (/^(type|write)/i.test(match[0])) {
      return { field: cleanFieldName(match[2]), value: cleanValue(match[1]) };
    }
    return { field: cleanFieldName(match[1]), value: cleanValue(match[2]) };
  }

  return null;
}

function extractCoordinateCommand(line: string, verb: RegExp): { x: number; y: number } | null {
  if (!verb.test(line)) return null;
  const numbers = line.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  return { x: Number(numbers[0]), y: Number(numbers[1]) };
}

function extractFieldClick(line: string): string | null {
  const match = line.match(/\b(?:click|focus|select)\b\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+field)?$/i);
  if (!match) return null;
  const field = cleanFieldName(match[1]);
  if (/\d/.test(field) || /button|link|text/i.test(field)) return null;
  return field;
}

function extractClickText(line: string): string | null {
  const match = line.match(/\bclick\b\s+(?:on\s+)?(?:the\s+)?(?:button|link|text)?\s*(.+)$/i);
  if (!match) return null;
  const value = cleanValue(match[1]);
  if (!value || /\d/.test(value)) return null;
  return value;
}

function extractTypeText(line: string): string | null {
  const match = line.match(/\b(?:type|write|send keys|press keys)\b\s+(.+)/i);
  if (!match) return null;
  return cleanValue(match[1]);
}

// Handles compound commands like:
//   "search hello in youtube.com and play first video"
//   "search hello on youtube then open the first result"
// Here "first video" means "click the first result", not "search for first video".
function extractSearchThenPlayFirst(line: string): string | null {
  const match = line.match(
    /\bsearch\b\s+(?:for\s+)?(.+?)\s+(?:(?:in|on)\s+youtube(?:\.com)?\s+)?(?:and\s+|then\s+)?(?:play|open|click|watch)\s+(?:the\s+)?(?:first|top)\b/i
  );
  if (!match) return null;
  const query = cleanSearchQuery(match[1]).replace(/\s+(?:in|on)\s+youtube(?:\.com)?$/i, "").trim();
  if (!query) return null;
  return query;
}

function extractPlayYouTubeQuery(line: string): string | null {
  const match = line.match(/\bplay\b\s+(.+?)(?:\s+on\s+youtube|\s+youtube)?$/i);
  if (!match) return null;
  const query = cleanValue(match[1]);
  // "first/top video/result" is a target to click, not a search term.
  if (!query || /^(video|media|song|music)$/i.test(query) || /^(?:the\s+)?(?:first|top|next)\b/i.test(query)) {
    return null;
  }
  return query;
}

function extractPressKey(line: string): string | null {
  const match = line.match(/\b(?:press|hit)\b\s+(enter|escape|esc|tab|space|backspace|delete|arrowup|arrowdown|arrowleft|arrowright)\b/i);
  if (!match) return null;
  const key = match[1].toLowerCase();
  const map: Record<string, string> = {
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
    space: "Space",
    backspace: "Backspace",
    delete: "Delete",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight"
  };
  return map[key];
}

function extractWaitAmount(line: string): number | null {
  if (!/\b(wait|pause)\b/i.test(line)) return null;
  const number = line.match(/\d+/);
  const value = number ? Number(number[0]) : 1500;
  return /\b(second|seconds|sec|secs)\b/i.test(line) ? value * 1000 : value;
}

function extractScrollAmount(line: string): number | null {
  if (!/\bscroll\b/i.test(line)) return null;
  const number = line.match(/-?\d+/);
  const amount = number ? Number(number[0]) : 600;
  return /\bup\b/i.test(line) ? -Math.abs(amount) : Math.abs(amount);
}

async function ensureBrowserOpen(tools: BrowserTools): Promise<void> {
  try {
    tools.page;
  } catch {
    await tools.open_browser();
  }
}

async function fillField(agent: AutomationAgent, labels: string[], value: string): Promise<void> {
  const result = await agent.fillBestMatchingField(labels, value);
  console.log(result.filled ? `Filled field using ${result.matchedBy}.` : `No matching field found for: ${labels.join(", ")}`);
}

async function printDetectedElements(agent: AutomationAgent): Promise<void> {
  const elements = await agent.detectFormElements();
  console.table(
    elements.map((element, index) => ({
      index,
      tag: element.tag,
      type: element.type,
      label: element.label,
      name: element.name,
      id: element.id,
      x: Math.round(element.x),
      y: Math.round(element.y)
    }))
  );
}

function printInteractiveHelp(): void {
  console.log(`
You can type exact tool commands:
  open_browser
  navigate_to_url https://ui.shadcn.com/docs/forms/react-hook-form
  take_screenshot before
  click_on_screen 680 795
  send_keys Kabee Student
  scroll 600
  press_key Enter
  go_back
  go_forward
  reload
  wait 1500
  double_click 680 795
  click_first_result
  click_first_youtube_video
  play_youtube_video lofi music
  detect_form_elements
  fill_field name Kabee Student

Or normal sentences:
  open the browser
  go to the shadcn form page
  take a screenshot called before
  show me the form fields
  click the name field
  type Kabee Student
  fill description with Automated description from my agent
  scroll down
  search for Playwright TypeScript automation
  search YouTube for shadcn react hook form
  play lofi music on YouTube
  click first video
  click first result
  press Enter
  go back
  reload page
  click at 680 795
  double click at 680 795
  submit the form
  close the browser
  exit
`);
}

function requireArg(args: string[], index: number, message: string): string {
  const value = args[index];
  if (!value) throw new Error(message);
  return value;
}

function numberArg(args: string[], index: number, message: string): number {
  const raw = requireArg(args, index, message);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(message);
  return parsed;
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function splitCommandLine(line: string): string[] {
  const matches = line.match(/"([^"]*)"|'([^']*)'|\S+/g) ?? [];
  return matches.map((match) => {
    if ((match.startsWith('"') && match.endsWith('"')) || (match.startsWith("'") && match.endsWith("'"))) {
      return match.slice(1, -1);
    }
    return match;
  });
}

function expandFieldAliases(field: string): string[] {
  const cleaned = cleanFieldName(field);
  const aliases = new Set([cleaned]);
  if (/\b(name|title|bug)\b/i.test(cleaned)) {
    aliases.add("name");
    aliases.add("bug title");
    aliases.add("title");
  }
  if (/\b(description|details|describe)\b/i.test(cleaned)) {
    aliases.add("description");
    aliases.add("details");
    aliases.add("describe");
  }
  return [...aliases];
}

function cleanFieldName(value: string): string {
  return cleanValue(value)
    .replace(/\b(the|field|input|box|textbox|text area|textarea)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSearchQuery(value: string): string {
  return cleanValue(value)
    .replace(/^(search|look up|find)\s+(for\s+)?/i, "")
    .replace(/^for\s+/i, "")
    .trim();
}

function cleanValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

function extractAfterWords(line: string, words: string[]): string | null {
  for (const word of words) {
    const match = line.match(new RegExp(`\\b${word}\\b\\s+(.+)`, "i"));
    if (match) return cleanValue(match[1]);
  }
  return null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screenshot";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}