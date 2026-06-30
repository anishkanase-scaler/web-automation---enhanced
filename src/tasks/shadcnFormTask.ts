import type { AutomationAgent } from "../agent/automationAgent.js";
import type { config as appConfig } from "../config.js";
import type { BrowserTools } from "../tools/browserTools.js";
import type { Logger } from "../utils/logger.js";

const TARGET_URL = "https://ui.shadcn.com/docs/forms/react-hook-form";

export async function runShadcnFormTask(
  tools: BrowserTools,
  agent: AutomationAgent,
  logger: Logger,
  values: Pick<typeof appConfig, "assignmentName" | "assignmentDescription">
): Promise<void> {
  await tools.open_browser();
  await tools.navigate_to_url(TARGET_URL);
  await tools.take_screenshot("01-loaded-shadcn-page");

  await agent.detectFormElements();

  // The live shadcn example currently uses "Bug Title"; the assignment brief asks for "Name".
  const nameResult = await scrollUntilFilled(agent, tools, ["name", "bug title", "title"], values.assignmentName);
  if (!nameResult) {
    throw new Error("Could not locate or fill the Name/Bug Title field.");
  }

  const descriptionResult = await scrollUntilFilled(
    agent,
    tools,
    ["description", "describe", "details"],
    values.assignmentDescription
  );
  if (!descriptionResult) {
    throw new Error("Could not locate or fill the Description field.");
  }

  await tools.take_screenshot("02-filled-shadcn-form");
  await logger.info("Assignment task completed", {
    url: TARGET_URL,
    name: values.assignmentName,
    descriptionLength: values.assignmentDescription.length
  });
}

async function scrollUntilFilled(
  agent: AutomationAgent,
  tools: BrowserTools,
  labels: string[],
  value: string
): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await agent.fillBestMatchingField(labels, value);
    if (result.filled) return true;
    await tools.scroll(650);
  }
  return false;
}
