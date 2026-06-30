import { config } from "./config.js";
import { AutomationAgent } from "./agent/automationAgent.js";
import { runInteractiveShell } from "./cli/interactiveShell.js";
import { BrowserTools } from "./tools/browserTools.js";
import { runSearchTask, runYouTubeSearchTask } from "./tasks/searchTask.js";
import { runShadcnFormTask } from "./tasks/shadcnFormTask.js";
import { Logger } from "./utils/logger.js";

type Command = "agent" | "assignment" | "search" | "youtube" | "help";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = (args[0] ?? "agent") as Command;
  const options = parseOptions(args.slice(1));

  if (command === "help" || options.help === "true") {
    printHelp();
    return;
  }

  const logger = new Logger(config.logDir);
  const tools = new BrowserTools(config, logger);
  const agent = new AutomationAgent(tools, logger);

  try {
    switch (command) {
      case "agent":
        await runInteractiveShell(tools, agent, logger);
        break;
      case "assignment":
        await runShadcnFormTask(tools, agent, logger, {
          assignmentName: options.name ?? config.assignmentName,
          assignmentDescription: options.description ?? config.assignmentDescription
        });
        break;
      case "search":
        await runSearchTask(
          tools,
          agent,
          logger,
          options.query ?? config.searchQuery,
          searchEngineOption(options.engine)
        );
        break;
      case "youtube":
        await runYouTubeSearchTask(tools, agent, logger, options.query ?? config.youtubeQuery);
        break;
      default:
        printHelp();
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    await logger.error("Task failed", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (command !== "agent" && options.keepOpen !== "true") {
      await tools.close();
    }
  }
}

function parseOptions(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = "true";
    }
  }
  return result;
}

function searchEngineOption(value: string | undefined): typeof config.searchEngine {
  if (value === "bing" || value === "duckduckgo" || value === "google") return value;
  return config.searchEngine;
}

function printHelp(): void {
  console.log(`
Website Automation Agent

Commands:
  npm run agent
  npm run task:assignment
  npm run search -- --query "Playwright TypeScript" --engine google
  npm run youtube -- --query "shadcn react hook form"

Interactive commands inside npm run agent:
  open_browser
  navigate_to_url <url>
  take_screenshot [label]
  click_on_screen <x> <y>
  send_keys <text>
  scroll [deltaY] [deltaX]
  double_click <x> <y>

Options:
  --name "Kabee Student"             Name/Bug Title value for the assignment task
  --description "..."                Description value for the assignment task
  --query "..."                      Search or YouTube query
  --engine google|bing|duckduckgo    Search engine
  --keepOpen                         Leave the browser open after the task
`);
}

main().catch(() => {
  process.exitCode = 1;
});
