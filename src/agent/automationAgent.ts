import type { Locator, Page } from "playwright";
import type { BrowserTools } from "../tools/browserTools.js";
import type { Logger } from "../utils/logger.js";

export type DetectedElement = {
  tag: string;
  type: string;
  label: string;
  placeholder: string;
  name: string;
  id: string;
  role: string | null;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type FillResult = {
  filled: boolean;
  matchedBy?: string;
};

export class AutomationAgent {
  constructor(
    private readonly tools: BrowserTools,
    private readonly logger: Logger
  ) {}

  get page(): Page {
    return this.tools.page;
  }

  async detectFormElements(): Promise<DetectedElement[]> {
    const elements = (await this.page.evaluate(`(() => {
      const labelFor = (el) => {
        const aria = el.getAttribute("aria-label") || "";
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          const labelText = labelledBy
            .split(/\\s+/)
            .map((id) => {
              const labelledElement = document.getElementById(id);
              return labelledElement && labelledElement.textContent
                ? labelledElement.textContent.trim()
                : "";
            })
            .filter(Boolean)
            .join(" ");
          if (labelText) return labelText;
        }
        if ("labels" in el && el.labels && el.labels.length > 0) {
          return Array.from(el.labels)
            .map((label) => label.textContent ? label.textContent.trim() : "")
            .filter(Boolean)
            .join(" ");
        }
        if (aria) return aria;

        const id = el.getAttribute("id");
        if (id) {
          const explicit = document.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (explicit && explicit.textContent && explicit.textContent.trim()) {
            return explicit.textContent.trim();
          }
        }
        const parentLabel = el.closest("label");
        if (parentLabel && parentLabel.textContent && parentLabel.textContent.trim()) {
          return parentLabel.textContent.trim();
        }
        return "";
      };

      return Array.from(
        document.querySelectorAll("input, textarea, select, [contenteditable='true']")
      )
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            type: element.type || "",
            label: labelFor(element),
            placeholder: element.placeholder || "",
            name: element.name || "",
            id: element.id || "",
            role: element.getAttribute("role"),
            text: element.textContent ? element.textContent.trim() : "",
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height
          };
        });
    })()`)) as DetectedElement[];

    await this.logger.info("Detected editable form elements", { elements });
    return elements;
  }

  async fillBestMatchingField(labels: string[], value: string): Promise<FillResult> {
    const result = await this.useBestMatchingField(labels, async (candidate, strategy) => {
      await candidate.fill(value);
      const actual = await candidate.inputValue().catch(() => value);
      if (actual === value) {
        await this.logger.info("Filled field", { strategy, valueLength: value.length });
        return true;
      }
      return false;
    });

    if (result.filled) return result;

    if (await this.coordinateFallbackFill(labels, value)) {
      return { filled: true, matchedBy: "coordinate fallback" };
    }

    await this.logger.warn("Unable to fill requested field", { labels });
    return { filled: false };
  }

  async focusBestMatchingField(labels: string[]): Promise<FillResult> {
    const result = await this.useBestMatchingField(labels, async (candidate, strategy) => {
      await candidate.click();
      await this.logger.info("Focused field", { strategy, labels });
      return true;
    });

    if (result.filled) return result;

    if (await this.coordinateFallbackClick(labels)) {
      return { filled: true, matchedBy: "coordinate fallback" };
    }

    await this.logger.warn("Unable to focus requested field", { labels });
    return { filled: false };
  }

  async clickElementByText(text: string | RegExp): Promise<boolean> {
    const locator = this.page.getByText(text).first();
    if ((await locator.count()) === 0) return false;
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    await this.logger.info("Clicked element by text", { text: String(text) });
    return true;
  }

  async submitLikelyForm(): Promise<boolean> {
    const candidates = [
      this.page.getByRole("button", { name: /submit|save|send|report/i }),
      this.page.locator("button[type='submit'], input[type='submit']")
    ];

    for (const locator of candidates) {
      const item = locator.first();
      if ((await item.count()) === 0) continue;
      if (!(await item.isVisible().catch(() => false))) continue;
      await item.scrollIntoViewIfNeeded();
      await item.click();
      await this.logger.info("Submitted likely form");
      return true;
    }

    await this.logger.warn("No submit button found");
    return false;
  }


  async clickFirstYouTubeVideo(): Promise<boolean> {
    const candidates = [
      this.page.locator('ytd-video-renderer a#video-title').first(),
      this.page.locator('a#video-title').first(),
      this.page.locator('a[href*="/watch?v="]').first()
    ];

    for (const candidate of candidates) {
      if ((await candidate.count().catch(() => 0)) === 0) continue;
      if (!(await candidate.isVisible().catch(() => false))) continue;
      await candidate.scrollIntoViewIfNeeded();
      await candidate.click();
      await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await this.logger.info("Clicked first YouTube video");
      return true;
    }

    await this.logger.warn("No YouTube video result found");
    return false;
  }

  async clickFirstSearchResult(): Promise<boolean> {
    const clicked = (await this.page.evaluate(`(() => {
      const blockedHosts = [
        "google.com/search",
        "google.co.in/search",
        "bing.com/search",
        "duckduckgo.com/?q=",
        "youtube.com/results",
        "accounts.google",
        "support.google",
        "policies.google"
      ];

      const visible = (anchor) => {
        const rect = anchor.getBoundingClientRect();
        const style = window.getComputedStyle(anchor);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const realResult = (anchor) => {
        const href = anchor.href || anchor.getAttribute("href") || "";
        const text = (anchor.textContent || "").trim();
        if (!href || !text || text.length < 4) return false;
        if (href.startsWith("javascript:")) return false;
        return !blockedHosts.some((host) => href.toLowerCase().includes(host));
      };

      const anchors = Array.from(document.querySelectorAll("a"));
      const preferred = anchors.find((anchor) => anchor.querySelector("h3") && visible(anchor) && realResult(anchor));
      const fallback = anchors.find((anchor) => visible(anchor) && realResult(anchor));
      const target = preferred || fallback;
      if (!target) return false;

      target.scrollIntoView({ block: "center", inline: "center" });
      target.click();
      return true;
    })()`)) as boolean;

    if (!clicked) {
      const url = this.page.url();
      const query = await this.currentSearchQuery(url);
      if (query && /google\./i.test(url)) {
        await this.logger.warn("No Google result found; retrying through DuckDuckGo", { query });
        await this.tools.navigate_to_url(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
        return this.clickFirstSearchResult();
      }
      await this.logger.warn("No search result found");
      return false;
    }

    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await this.logger.info("Clicked first search result");
    return true;
  }
  private async currentSearchQuery(url: string): Promise<string | null> {
    const queryFromField = await this.page
      .locator("textarea[name=\"q\"], input[name=\"q\"]")
      .first()
      .inputValue()
      .catch(() => "");
    if (queryFromField.trim()) return queryFromField.trim();

    const queryFromUrl = searchQueryFromUrl(url);
    if (!queryFromUrl || queryFromUrl.length > 120 || !/[a-zA-Z]/.test(queryFromUrl)) return null;
    return queryFromUrl;
  }

  async playOrPauseMedia(): Promise<void> {
    await this.page.keyboard.press("Space");
    await this.logger.info("Toggled media playback with Space");
  }
  private async useBestMatchingField(
    labels: string[],
    action: (candidate: Locator, strategy: string) => Promise<boolean>
  ): Promise<FillResult> {
    const matchers = labels.map((label) => new RegExp(escapeRegExp(label), "i"));
    const strategies: Array<[string, () => Locator[]]> = [
      ["label", () => matchers.map((matcher) => this.page.getByLabel(matcher))],
      ["placeholder", () => matchers.map((matcher) => this.page.getByPlaceholder(matcher))],
      ["role textbox", () => matchers.map((matcher) => this.page.getByRole("textbox", { name: matcher }))],
      [
        "attribute",
        () =>
          labels.map((label) =>
            this.page.locator(
              `input[name*="${cssAttr(label)}" i], textarea[name*="${cssAttr(label)}" i], ` +
                `input[id*="${cssAttr(label)}" i], textarea[id*="${cssAttr(label)}" i]`
            )
          )
      ]
    ];

    for (const [strategy, locatorFactory] of strategies) {
      for (const locator of locatorFactory()) {
        const count = await locator.count().catch(() => 0);
        for (let index = 0; index < count; index += 1) {
          const candidate = locator.nth(index);
          if (!(await candidate.isVisible().catch(() => false))) continue;
          if (!(await candidate.isEditable().catch(() => false))) continue;
          await candidate.scrollIntoViewIfNeeded();
          if (await action(candidate, strategy)) {
            return { filled: true, matchedBy: strategy };
          }
        }
      }
    }

    return { filled: false };
  }

  private async coordinateFallbackFill(labels: string[], value: string): Promise<boolean> {
    const clicked = await this.coordinateFallbackClick(labels);
    if (!clicked) return false;
    await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await this.tools.send_keys(value);
    await this.logger.info("Filled field using coordinates", { labels });
    return true;
  }

  private async coordinateFallbackClick(labels: string[]): Promise<boolean> {
    const elements = await this.detectFormElements();
    const normalizedLabels = labels.map(normalize);
    const candidate = elements.find((element) => {
      const haystack = normalize(
        [element.label, element.placeholder, element.name, element.id, element.text].join(" ")
      );
      return normalizedLabels.some((label) => haystack.includes(label));
    });

    if (!candidate) return false;

    await this.page.evaluate("(y) => window.scrollTo({ top: Math.max(0, y - 240), behavior: 'instant' })", candidate.y);
    await this.tools.click_on_screen(candidate.x + candidate.width / 2, candidate.y + candidate.height / 2);
    await this.logger.info("Focused field using coordinates", { labels });
    return true;
  }
}

function searchQueryFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("q");
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cssAttr(value: string): string {
  return value.replace(/["\\]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}