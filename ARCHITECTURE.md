# Architecture

## Goal

The project is a mini browser automation agent inspired by tools like Browser Use. It exposes low-level browser tools and composes them into higher-level autonomous workflows.

## Main Components

### BrowserTools

`src/tools/browserTools.ts` wraps Playwright and implements the assignment-required capabilities:

- `open_browser`
- `navigate_to_url`
- `take_screenshot`
- `click_on_screen`
- `send_keys`
- `scroll`
- `double_click`

These methods are intentionally small and composable, so new tasks can reuse them without changing Playwright setup code.

### GeminiPlanner

`src/llm/geminiPlanner.ts` is an optional LLM planning layer. When `GEMINI_API_KEY` is configured, it sends the user command to Gemini and asks for exactly one JSON action from a fixed allowlist. The project still executes actions only through local Playwright tools, so the model plans but does not directly control code execution.

If Gemini is not configured or the request fails, the interactive shell falls back to local rule-based parsing.

### AutomationAgent

`src/agent/automationAgent.ts` contains the decision-making layer. It detects visible editable elements and extracts useful metadata:

- tag name and input type
- label text
- placeholder
- `name` and `id`
- ARIA role
- screen coordinates

When filling a field, the agent tries increasingly broad strategies:

1. Match by associated label.
2. Match by placeholder.
3. Match by accessible textbox role.
4. Match by `name` or `id` attributes.
5. Fall back to coordinate-based click and typing.

This gives the agent resilience when a page changes labels or markup.

### Tasks

`src/tasks/shadcnFormTask.ts` implements the assignment workflow:

1. Open the browser.
2. Navigate to the shadcn React Hook Form page.
3. Capture an initial screenshot.
4. Detect and log form elements.
5. Fill the `Name`/`Bug Title` field.
6. Fill the `Description` field.
7. Capture a final screenshot.

`src/tasks/searchTask.ts` implements generic search and YouTube search workflows. These show that the agent can be extended beyond a single assignment target.

### Configuration and Logging

`src/config.ts` reads `.env` values for browser behavior, timeouts, screenshot/log directories, and task defaults.

`src/utils/logger.ts` writes JSONL logs to `logs/` and mirrors concise messages to the terminal. This helps during viva because every action and decision is auditable.

## Error Handling

The CLI wraps every task in `try/catch/finally`:

- Failures are logged.
- The browser is closed unless `--keepOpen` is passed.
- Element lookup uses timeouts, visibility checks, editability checks, scrolling, and fallback matching.
- Network idle timeouts are logged as warnings instead of immediately failing, because many modern pages keep background requests open.

## Extending the Agent

To add a new task:

1. Create a file in `src/tasks/`.
2. Use `BrowserTools` for browser actions.
3. Use `AutomationAgent` for element detection and interaction.
4. Add a new command case in `src/index.ts`.
