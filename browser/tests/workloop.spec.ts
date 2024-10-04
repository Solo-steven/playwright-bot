import { test } from "@playwright/test";
import { createClient } from "redis";
import {
  ActionInstruction,
  ActionResult,
  ActionInstructionType,
  BrowserSessionState,
} from "../src/type";
import { INJECT_TEST_ID_KEY, markPage, clearMark } from "./mark";

const redisClient = createClient();

export async function waitInAsync(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, time);
  });
}

async function waitActionInstruction(sessionId: string): Promise<ActionInstruction> {
  //eslint-disable-next-line no-constant-condition
  while (1) {
    const value = await redisClient.getDel(`${sessionId}_inst`);
    if (value) {
      await redisClient.set(`${sessionId}_state`, BrowserSessionState.Running);
      return JSON.parse(value) as ActionInstruction;
    }
    await waitInAsync(500);
  }
  throw new Error("[Unreach]");
}

async function setActionResult(
  sessionId: string,
  base64Image: string,
  errorMsg: string,
) {
  if (errorMsg) {
    const errorResp: ActionResult = {
      type: "Error",
      content: errorMsg,
      base64EncodeString: base64Image,
    };
    await redisClient.set(`${sessionId}_resp`, JSON.stringify(errorResp));
    await redisClient
      .multi()
      .set(`${sessionId}_state`, BrowserSessionState.Result)
      .set(`${sessionId}_resp`, JSON.stringify(errorResp))
      .exec();
  } else {
    const actionResp: ActionResult = {
      type: "Success",
      base64EncodeString: base64Image,
    };
    await redisClient
      .multi()
      .set(`${sessionId}_state`, BrowserSessionState.Result)
      .set(`${sessionId}_resp`, JSON.stringify(actionResp))
      .exec();
  }
}

async function setToFatlState(sessionId: string, _reason: string) {
  await redisClient
    .multi()
    .set(`${sessionId}_state`, BrowserSessionState.Fatal)
    .del(`${sessionId}_resp`)
    .exec();
}

async function setToFinishState(sessionId: string) {
  await redisClient
    .multi()
    .set(`${sessionId}_state`, BrowserSessionState.Finish)
    .del(`${sessionId}_resp`)
    .exec();
}

const MIN = 60 * 1000;

test("workloop test", async ({ page }) => {
  test.setTimeout(5 * MIN);
  await redisClient.connect();
  const url = process.env.URL as string;
  const sessionId = process.env.SESSION_ID as string;
  try {
    await page.goto(url);
    let errorMsg = "";
    //eslint-disable-next-line no-constant-condition
    loop: while (1) {
      const labelsCount = await markPage(page);
      const screenShotBuffer = await page.screenshot();
      await setActionResult(sessionId, screenShotBuffer.toString("base64"), errorMsg);
      errorMsg = "";
      const instruction = await waitActionInstruction(sessionId);
      switch (instruction.type) {
        case ActionInstructionType.Wait: {
          await waitInAsync(10000);
          break;
        }
        case ActionInstructionType.Finish: {
          await setToFinishState(sessionId);
          console.log("Finish");
          break loop;
        }
        case ActionInstructionType.Click: {
          try {
            await page
              .locator(`*[${INJECT_TEST_ID_KEY}='${instruction.label}']`)
              .click({ force: true });
          } catch (e) {
            console.log(e);
            errorMsg = "Element is not clickable";
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
            errorMsg = "Element Is not Input ";
          }
          break;
        }
        default: {
          console.log("?????");
        }
      }
      // wait for render.
      await waitInAsync(3000);
      await clearMark(page, labelsCount);
    }
  } catch (e) {
    console.log(e);
    await setToFatlState(sessionId, "Fatal when running playwright");
  }
  await redisClient.disconnect();
});
