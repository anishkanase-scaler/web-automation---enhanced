import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AppConfig } from "../config.js";
import type { Logger } from "../utils/logger.js";

export type BrowserState = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export class BrowserTools {
  private state?: BrowserState;

  constructor(
    private readonly appConfig: AppConfig,
    private readonly logger: Logger
  ) {}

  get page(): Page {
    const state = this.state;
    if (!state || !state.browser.isConnected() || state.page.isClosed()) {
      this.state = undefined;
      throw new Error("Browser is not open. Call open_browser first.");
    }
    return state.page;
  }

  async open_browser(): Promise<Page> {
    if (this.isUsable() && this.state) {
      await this.logger.info("Browser is already open");
      return this.state.page;
    }

    await this.disposeStaleState();
    await this.logger.info("Opening browser", {
      headless: this.appConfig.headless,
      slowMo: this.appConfig.slowMo
    });

    const browser = await chromium.launch({
      headless: this.appConfig.headless,
      slowMo: this.appConfig.slowMo
    });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 850 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();
    page.setDefaultTimeout(this.appConfig.defaultTimeoutMs);
    this.state = { browser, context, page };
    await this.pause();
    return page;
  }

  async navigate_to_url(url: string): Promise<void> {
    await this.open_browser();
    await this.logger.info("Navigating to URL", { url });
    try {
      await this.gotoWithTimeout(url);
    } catch (error) {
      if (!isClosedTargetError(error)) throw error;
      await this.logger.warn("Browser target was closed; reopening and retrying navigation", { url });
      this.state = undefined;
      await this.open_browser();
      await this.gotoWithTimeout(url);
    }
    await this.page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(async () => {
      await this.logger.warn("Network idle timeout ignored; page is still usable");
    });
    await this.pause();
  }

  private async gotoWithTimeout(url: string): Promise<void> {
    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: this.appConfig.defaultTimeoutMs
    }).catch(async (error) => {
      if (isClosedTargetError(error)) throw error;
      await this.logger.warn("Page load timeout or navigation warning ignored; continuing with current page", {
        url,
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }

  async take_screenshot(label = "screenshot"): Promise<string> {
    await this.open_browser();
    await mkdir(this.appConfig.screenshotDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.appConfig.screenshotDir, `${stamp}-${label}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    await this.logger.info("Screenshot captured", { filePath });
    await this.pause();
    return filePath;
  }

  async click_on_screen(x: number, y: number): Promise<void> {
    await this.open_browser();
    await this.logger.info("Clicking screen coordinate", { x, y });
    await this.page.mouse.click(x, y);
    await this.pause();
  }

  async double_click(x: number, y: number): Promise<void> {
    await this.open_browser();
    await this.logger.info("Double clicking screen coordinate", { x, y });
    await this.page.mouse.dblclick(x, y);
    await this.pause();
  }

  async send_keys(text: string): Promise<void> {
    await this.open_browser();
    await this.logger.info("Sending keyboard input", { length: text.length });
    await this.page.keyboard.type(text, { delay: this.appConfig.keyboardDelayMs });
    await this.pause();
  }

  async press_key(key: string): Promise<void> {
    await this.open_browser();
    await this.logger.info("Pressing keyboard key", { key });
    await this.page.keyboard.press(key);
    await this.pause();
  }

  async scroll(deltaY = 600, deltaX = 0): Promise<void> {
    await this.open_browser();
    await this.logger.info("Scrolling page", { deltaX, deltaY });
    await this.page.mouse.wheel(deltaX, deltaY);
    await this.pause();
  }

  async go_back(): Promise<void> {
    await this.open_browser();
    await this.logger.info("Going back");
    await this.page.goBack({ waitUntil: "domcontentloaded" }).catch(async () => {
      await this.logger.warn("Could not go back; there may be no browser history");
    });
    await this.pause();
  }

  async go_forward(): Promise<void> {
    await this.open_browser();
    await this.logger.info("Going forward");
    await this.page.goForward({ waitUntil: "domcontentloaded" }).catch(async () => {
      await this.logger.warn("Could not go forward; there may be no forward history");
    });
    await this.pause();
  }

  async reload(): Promise<void> {
    await this.open_browser();
    await this.logger.info("Reloading page");
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.pause();
  }

  async wait(milliseconds = 1500): Promise<void> {
    await this.open_browser();
    await this.logger.info("Waiting", { milliseconds });
    await this.page.waitForTimeout(milliseconds);
    await this.pause();
  }

  async close(): Promise<void> {
    if (!this.state) return;
    await this.logger.info("Closing browser");
    await this.disposeStaleState();
  }

  private isUsable(): boolean {
    return Boolean(this.state && this.state.browser.isConnected() && !this.state.page.isClosed());
  }

  private async disposeStaleState(): Promise<void> {
    const stale = this.state;
    this.state = undefined;
    if (!stale) return;
    await stale.context.close().catch(() => undefined);
    await stale.browser.close().catch(() => undefined);
  }

  private async pause(): Promise<void> {
    if (this.appConfig.actionDelayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.appConfig.actionDelayMs));
  }
}

function isClosedTargetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /target page, context or browser has been closed|browser has been closed|page has been closed/i.test(message);
}