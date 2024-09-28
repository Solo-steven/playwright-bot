import { createCookie } from "@remix-run/node";
import OpenAI from "openai";
import { ActionInstructionType, SessionConfig, SessionResult } from "~/lib/type";
import {
  OpenAIMessage,
  sendMessage,
  parseInstruction,
  createInitUserMessage,
  createSystemMessage,
  createContinueUserMessage,
} from "./llm";
import { openBrowserWithPage, operateActionOnPage, clearMark, markPage } from "./browser";
import { createAborter } from "./utils";
import { Logger } from "./logger";
import { Browser, Page } from "@playwright/test";
// function unwrap<T>(value: T | undefined): T {
//     return value!;
// }
export const sessionCookie = createCookie("session-id", {
  secrets: [process.env.COOKIE_KEY || "default-kkkeey"],
});

export async function getCookieIdFromRequest(req: Request) {
  const cookieHeadser = req.headers.get("Cookie");
  const id: string | null = await sessionCookie.parse(cookieHeadser);
  return id;
}

export async function clearCookieHeader() {
  return {
    "Set-Cookie": `${sessionCookie.name}=${new Date().toUTCString()};max-age=0`,
  };
}

const SessionConfigInMemoryStore: Map<string, SessionConfig> = new Map();
const SessionResultInMemoryStore: Map<string, SessionResult> = new Map();
const SessionMessagesInMemoryStore: Map<string, Array<OpenAIMessage>> = new Map();
const SessionBrowserInMemoryStore: Map<string, [Browser, Page]> = new Map();
const SessionAborterInMemoryStore: Map<string, () => void> = new Map();
let llmJobCount = 0;

/**
 *
 * @param id
 * @param config
 */
export function storeSessionConfig(id: string, config: SessionConfig) {
  SessionConfigInMemoryStore.set(id, config);
}
/**
 *
 * @param id
 * @returns
 */
export function getSessionConfig(id: string): SessionConfig | undefined {
  return SessionConfigInMemoryStore.get(id);
}
/**
 *
 * @param id
 * @returns
 */
export function getLLMSesionResult(id: string) {
  return SessionResultInMemoryStore.get(id)!;
}
/**
 *
 * @param id
 * @returns
 */
export function getLLMSessionMessages(id: string) {
  return SessionMessagesInMemoryStore.get(id);
}
/**
 *
 * @param id
 * @returns
 */
export function getLLMSessionAborter(id: string) {
  return SessionAborterInMemoryStore.get(id);
}
/**
 *
 * @param id
 */
export async function finishLLMSession(id: string) {
  const aborter = SessionAborterInMemoryStore.get(id);
  if (aborter) aborter();
  SessionAborterInMemoryStore.delete(id);
  SessionConfigInMemoryStore.delete(id);
  SessionMessagesInMemoryStore.delete(id);
  SessionResultInMemoryStore.delete(id);
  if(SessionBrowserInMemoryStore.get(id)) {
    const [browser] = SessionBrowserInMemoryStore.get(id)!;
    await browser.close();
  }
  SessionBrowserInMemoryStore.delete(id);
  Logger.info(`Finish Job id(${id})`);
}

export enum CreateLLMSessionResult {
  Sucess = "sucess",
  TooBusy = "toobusy",
  MissingConfig = "missingconfig",
}


function validateLLMSessionRequirement(id: string) {
  if (llmJobCount > 3) {
    Logger.info(`Data pipline too busy, with Id (${id}). `);
    return CreateLLMSessionResult.TooBusy;
  }
  const config = getSessionConfig(id);
  if (!config) {
    Logger.info(`Id(${id}) can not find config, session should not exist.`);
    finishLLMSession(id);
    return CreateLLMSessionResult.MissingConfig;
  }
  if (SessionResultInMemoryStore.get(id)) {
    const aborter = SessionAborterInMemoryStore.get(id);
    if (aborter) {
      aborter();
    }
    Logger.info(`Job should already exist, Restart it, with Id(${id}).`);
  } else {
    Logger.info(`Create Job With Id (${id}).`);
  }
  return config;
}

/**
 *
 * @param id
 * @returns
 */
export async function createLLMSession(id: string) {
  const possibleConfig = validateLLMSessionRequirement(id);
  if(typeof possibleConfig == "string") {
    return possibleConfig;
  }
  const config = possibleConfig;
  const results = ([] as SessionResult);
  const messages = ([] as Array<OpenAIMessage>);
  const { abort, getSingal } = createAborter();
  SessionResultInMemoryStore.set(id, results);
  SessionMessagesInMemoryStore.set(id, messages);
  SessionAborterInMemoryStore.set(id, () => {
    llmJobCount--;
    abort();
  });
  const [browser, page] = await openBrowserWithPage(config.url);
  SessionBrowserInMemoryStore.set(id, [browser, page]);
  createBackgroundLLMJob(browser, page, config.taskDescription, messages, results, getSingal);
  llmJobCount++;
  return CreateLLMSessionResult.Sucess;
}
/**
 * 
 * @param id 
 * @returns 
 */
export async function restartLLMSession(id: string) {
  const possibleConfig = validateLLMSessionRequirement(id);
  if(typeof possibleConfig == "string") {
    return possibleConfig;
  }
  const config = possibleConfig;
  const results = SessionResultInMemoryStore.get(id)!;
  const messages = SessionMessagesInMemoryStore.get(id)!;
  const browserAndPage = SessionBrowserInMemoryStore.get(id);
  const { abort, getSingal } = createAborter();
  SessionAborterInMemoryStore.set(id, () => {
    llmJobCount--;
    abort();
  });
  let browser: Browser, page: Page;
  if(browserAndPage) {
    [browser, page] = browserAndPage;
  }else {
    Logger.info(`Job ${id} restart, but dose not have browser and page instance.`, browserAndPage);
    [browser, page] = await openBrowserWithPage(config.url);
  }
  createBackgroundLLMJob(browser, page, config.taskDescription, messages, results, getSingal);
  llmJobCount ++;
  return CreateLLMSessionResult.Sucess;
}

export function stopLLMSession(id: string) {
  const aborter = SessionAborterInMemoryStore.get(id);
  if (aborter) {
    Logger.info(`Stop Job With Id (${id}.)`);
    aborter();
  } else {
    Logger.info(`Wish to stop job, but there is no aborter. With Id (${id})`);
  }
}
/**
 *
 * @param config
 * @param messages
 * @param results
 * @param getSingal
 */
async function createBackgroundLLMJob(
  browser: Browser,
  page: Page,
  taskDescription: string,
  messages: Array<OpenAIMessage>,
  results: SessionResult,
  getSingal: () => boolean,
) {
  let iterKey = messages.length;
  if (messages.length === 0) {
    messages.push(createSystemMessage() as OpenAI.Chat.Completions.ChatCompletionMessage);
    iterKey = 0;
  }
  try {
    // eslint-disable-next-line no-constant-condition
    while (1) {
      if (getSingal()) {
        break;
      }
      // mark and screenshot
      const indexs = await markPage(page);
      const buffer = await page.screenshot({ fullPage: true });
      const based64Image = buffer.toString("base64");
      if (iterKey != 0) {
        const currenrMsg = createContinueUserMessage(based64Image);
        messages.push(currenrMsg);
      } else {
        const initMessage = createInitUserMessage(taskDescription, based64Image);
        messages.push(initMessage);
      }
      // get instruction and do it
      const resp = await sendMessage(messages);
      messages.push(resp.choices[0].message);
      console.log(resp.choices[0].message);
      const instruction = parseInstruction(resp.choices[0]);
      if (instruction.type === ActionInstructionType.Final) {
        results.push({
          inst: instruction,
          encodedImage: based64Image,
        });
        break;
      }
      const errorReason = await operateActionOnPage(instruction, page);
      if (errorReason) {
        await clearMark(page, indexs);
        results.push({
          inst: { type: "Error", inst: instruction },
          encodedImage: based64Image,
        });
        messages.push({
          role: "user",
          content: errorReason,
        } as OpenAIMessage);
        iterKey++;
        continue;
      }
      results.push({
        inst: instruction,
        encodedImage: based64Image,
      });
      iterKey++;
      // clear mark for next page
      await clearMark(page, indexs);
    }
  } catch (e) {
    console.error(e);
    await browser.close();
  }
}
