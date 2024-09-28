import { chromium, Page, Browser } from "@playwright/test";
import { ActionInstruction, ActionInstructionType, INJECT_TEST_ID_KEY } from "~/lib/type";
import { waitInAsync } from "~/lib/utils";
export * from "./mark";

export async function openBrowserWithPage(url: string): Promise<[Browser, Page]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  return [browser, page];
}

export async function operateActionOnPage(instruction: ActionInstruction, page: Page) {
  switch (instruction.type) {
    case ActionInstructionType.Click: {
      try {
        await page
          .locator(`*[${INJECT_TEST_ID_KEY}='${instruction.label}']`)
          .click({ force: true });
      } catch (e) {
        console.log(e);
        return "Label is not Clickable";
      }
      break;
    }
    case ActionInstructionType.Type: {
      try {
        await page
          .locator(`*[${INJECT_TEST_ID_KEY}='${instruction.label}']`)
          .fill(instruction.content, { force: true });
        await page.keyboard.press("Enter");
      } catch (e) {
        console.log(e);
        return "Label is not typeable, is not an <input>, <textarea> or [contenteditable] element, please try to find element again";
      }
      break;
    }
    case ActionInstructionType.Wait: {
      await waitInAsync(10000);
      return;
    }
    default: {
      console.log("Not Implement Yet QQ:", instruction);
      await waitInAsync(10000);
      return;
    }
  }
  // wait for render
  await waitInAsync(3000);
}
