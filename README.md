# Website Automation Agent

TypeScript + Playwright automation agent for Assignment 04. It can be used in two ways:

1. Interactive mode, where you type each browser tool command yourself.
2. Full task mode, where the assignment workflow runs automatically from start to finish.

For viva demonstration, use interactive mode first because it clearly shows every required capability.

## Features

- Required tools: `open_browser`, `navigate_to_url`, `take_screenshot`, `click_on_screen(x, y)`, `send_keys`, `scroll`, and `double_click`.
- Interactive command shell where every browser action runs only when the user asks.
- Optional Gemini API planner through `GEMINI_API_KEY`, so the agent can interpret flexible natural-language commands.
- Visible pacing through `BROWSER_SLOW_MO`, `ACTION_DELAY_MS`, and `KEYBOARD_DELAY_MS`.
- Intelligent form detection using labels, placeholders, roles, names, IDs, visibility checks, and coordinate fallback.
- Assignment task for `https://ui.shadcn.com/docs/forms/react-hook-form`.
- Generic Google/Bing/DuckDuckGo search task.
- Generic YouTube search task.
- Logs in `logs/` and screenshots in `screenshots/`.
- Environment-based configuration through `.env`.

## Setup

```bash
npm install
```

Optional:

```bash
copy .env.example .env
```

Edit `.env` if you want custom browser speed, timeout, screenshot folder, Gemini settings, or form values.


## Gemini API Setup

Create `.env` from `.env.example`:

```bash
copy .env.example .env
```

Then put your Gemini key in `.env`:

```text
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Do not paste the real key into TypeScript files. `.env` is ignored by git, so it is the correct place for secrets.

With the key set, `npm run agent` uses Gemini first to convert your natural sentence into one safe browser action. If Gemini is unavailable or the key is missing, the local parser still handles common commands.
## Recommended Viva Demo: Natural Language Interactive Mode

Start the manual agent shell:

```bash
npm run agent
```

Then type natural commands one by one. With `GEMINI_API_KEY` set, these are interpreted by Gemini; otherwise the local fallback parser handles common commands:

```text
open the browser
go to the shadcn form page
take a screenshot called before
show me the form fields
fill name with Kabee Student
fill description with Automated description typed through my agent
take a screenshot called after
exit
```

You can also use coordinates if you want to demonstrate the exact low-level tools:

```text
click at 680 795
type Kabee Student
scroll down
double click at 680 795
```

The agent understands both exact tool commands and normal sentences.

Exact tool commands:

```text
open_browser
navigate_to_url <url>
take_screenshot [label]
click_on_screen <x> <y>
send_keys <text>
scroll [deltaY] [deltaX]
double_click <x> <y>
detect_form_elements
fill_field <label> <value>
close_browser
exit
```

Tip: run `detect_form_elements` or say `show me the form fields` after loading the page. It prints element labels and approximate coordinates, so you can choose where to click.
Natural language examples:

```text
open browser
navigate to https://ui.shadcn.com/docs/forms/react-hook-form
go to the shadcn form page
take screenshot called before
find the form elements
click the name field
type Kabee Student
fill description with This was entered by the automation agent
search for Playwright TypeScript automation
search YouTube for shadcn react hook form
close browser
```



## General Web Browsing Commands

The interactive agent now supports broader browsing tasks:

```text
open youtube
open netflix
open google
go to https://example.com
google search for Playwright official documentation
click first result
search youtube for shadcn react hook form
play shadcn react hook form on youtube
pause video
press Enter
go back
go forward
reload page
wait 3000
scroll down
click text Sign in
click at 500 300
```

For YouTube playback, this is the safest viva command:

```text
play shadcn react hook form on youtube
```

It searches YouTube, opens the first video result, then you can use:

```text
pause video
resume video
```
## Viva-Ready Commands

These were verified through `npm run agent`:

```text
open youtube
take screenshot called viva-youtube-open
open netflix
take screenshot called viva-netflix-open
google search for Playwright TypeScript automation
take screenshot called viva-google-search
search youtube for shadcn react hook form
take screenshot called viva-youtube-search
exit
```

For the assignment form task in natural language:

```text
open browser
go to the shadcn form page
fill name with Kabee Student
fill description with Completed through natural language command mode
take screenshot called natural-fill-final
exit
```
## Full Automatic Assignment Task

This command does the whole assignment workflow in one go. Use it as proof that the agent can complete the target task autonomously.

```bash
npm run task:assignment
```

Custom values:

```bash
npm run task:assignment -- --name "Kabee Student" --description "This is an automated description filled by the agent."
```

The live shadcn page currently labels the first demo field as `Bug Title`, while the assignment calls it `Name`. The agent handles both names so the demo remains robust.

## Run Generic Search

```bash
npm run search -- --query "Playwright TypeScript browser automation" --engine google
```

Supported engines:

- `google`
- `bing`
- `duckduckgo`

## Run YouTube Search

```bash
npm run youtube -- --query "React Hook Form shadcn tutorial"
```

## Slow Down or Speed Up the Browser

Create `.env` from `.env.example`, then change:

```text
BROWSER_SLOW_MO=250
ACTION_DELAY_MS=700
KEYBOARD_DELAY_MS=35
```

Increase these values for a slower live demonstration. Set them to lower values for faster testing.

## Validate TypeScript

```bash
npm run check
```

## Project Structure

```text
src/
  agent/
    automationAgent.ts      # Agent intelligence and element detection
  cli/
    interactiveShell.ts     # Natural-language and command-by-command browser control
  llm/
    geminiPlanner.ts        # Gemini API command planner
  tasks/
    shadcnFormTask.ts       # Assignment workflow
    searchTask.ts           # Browser and YouTube search workflows
  tools/
    browserTools.ts         # Required browser tool capabilities
  utils/
    logger.ts               # JSONL logging
  config.ts                 # Environment configuration
  index.ts                  # CLI entrypoint
```
