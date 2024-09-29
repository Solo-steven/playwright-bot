import { createCookie } from "@remix-run/node";
import OpenAI from "openai";
import {
  ActionInstructionType,
  SessionConfig,
  SessionResult,
  LLMSesionState,
} from "~/lib/type";
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

// All memory store for session, sperate into different Map to avoid
// type check.
// ## Life Cycle of Session
// 1. Create: Only have Config
// 2. Running: Have Config. Result. Messages. Browser and Aboter
// 3. Pause: Have All data as Running state, but there is not job in queue.
// 4. Finish: Only Have Results
// 5. Deleted: Have not nothing.
const SessionConfigInMemoryStore: Map<string, SessionConfig> = new Map();
const SessionResultInMemoryStore: Map<string, SessionResult> = new Map();
const SessionMessagesInMemoryStore: Map<string, Array<OpenAIMessage>> = new Map();
const SessionBrowserInMemoryStore: Map<string, [Browser, Page]> = new Map();
const SessionAborterInMemoryStore: Map<string, () => void> = new Map();
const SessionStopSet = new Set<string>();
let llmJobCount = 0;

function increasLLMJobCount() {
  llmJobCount++;
  Logger.info(`Add a LLM Job. Current Total Job count: ${llmJobCount}`);
}
function decreasLLMJobCount() {
  llmJobCount--;
  Logger.info(`remove a LLM Job. Current Total Job count: ${llmJobCount}`);
}

export function getLLMSessionState(id: string): LLMSesionState {
  const existConfig = SessionConfigInMemoryStore.get(id);
  const existMessage = SessionMessagesInMemoryStore.get(id);
  const existResult = SessionResultInMemoryStore.get(id);
  if (existConfig && !existMessage && !existResult) {
    return LLMSesionState.Created;
  }
  if (existConfig && existMessage && existResult) {
    if (SessionStopSet.has(id)) {
      return LLMSesionState.Pause;
    }
    return LLMSesionState.Running;
  }
  if (existResult && !existMessage && !existConfig) {
    return LLMSesionState.Finish;
  }
  return LLMSesionState.Deleted;
}

/**
 * Store a session config in memory.
 * @param {string} id
 * @param {SessionConfig} config
 */
export function storeSessionConfig(id: string, config: SessionConfig) {
  SessionConfigInMemoryStore.set(id, config);
}
/**
 * Get session config in memory
 * @param id
 * @returns
 */
export function getSessionConfig(id: string): SessionConfig | undefined {
  return SessionConfigInMemoryStore.get(id);
}
/**
 * Get session config in memory
 * @param id
 * @returns
 */
export function getLLMSesionResult(id: string) {
  return SessionResultInMemoryStore.get(id)!;
}
/**
 * Get session messages in memory
 * @param id
 * @returns
 */
export function getLLMSessionMessages(id: string) {
  return SessionMessagesInMemoryStore.get(id);
}
/**
 * Get aborter function in memory
 * @param id
 * @returns
 */
export function getLLMSessionAborter(id: string) {
  return SessionAborterInMemoryStore.get(id);
}
/**
 * Finish a LLM session, clear all data and function callback
 * except the result context
 * in memory.
 * @param id
 */
export async function finishLLMSession(id: string) {
  const aborter = SessionAborterInMemoryStore.get(id);
  if (aborter) aborter();
  SessionAborterInMemoryStore.delete(id);
  SessionConfigInMemoryStore.delete(id);
  SessionMessagesInMemoryStore.delete(id);
  // SessionResultInMemoryStore.delete(id);
  if (SessionBrowserInMemoryStore.get(id)) {
    const [browser] = SessionBrowserInMemoryStore.get(id)!;
    await browser.close();
  }
  SessionBrowserInMemoryStore.delete(id);
  SessionStopSet.delete(id);
  Logger.info(`Finish Job id(${id})`);
}
/**
 * Delete a LLM session, clear result context of session.
 * @param id
 */
export function deleteLLMSession(id: string) {
  SessionResultInMemoryStore.delete(id);
  Logger.info(`Delete Job. Job id: ${id}`);
}

export enum CreateLLMSessionResult {
  Sucess = "sucess",
  TooBusy = "toobusy",
  MissingConfig = "missingconfig",
}
/**
 * Create a LLM session, if there already a session in memory, will abort
 * that session.
 * @param {string} id
 * @returns {boolean}
 */
export async function createLLMSession(id: string): Promise<boolean> {
  const state = getLLMSessionState(id);
  if (state !== LLMSesionState.Created) {
    Logger.info(
      `Try to create a session, but session has already exist, state is ${state}. Job id : ${id}`,
    );
    return false;
  }
  if (llmJobCount > 3) {
    Logger.info(`Try to create a session, but data pipline is too bust. Job id: ${id}.`);
    return false;
  }
  const config = SessionConfigInMemoryStore.get(id)!;
  const results = [] as SessionResult;
  const messages = [] as Array<OpenAIMessage>;
  const { abort, getSingal } = createAborter(() => {
    decreasLLMJobCount();
  });
  SessionResultInMemoryStore.set(id, results);
  SessionMessagesInMemoryStore.set(id, messages);
  SessionAborterInMemoryStore.set(id, abort);
  const [browser, page] = await openBrowserWithPage(config.url);
  SessionBrowserInMemoryStore.set(id, [browser, page]);
  createBackgroundLLMJob(
    id,
    browser,
    page,
    config.taskDescription,
    messages,
    results,
    getSingal,
  );
  increasLLMJobCount();
  Logger.info(`Successfully created Job. Job id: ${id}.`);
  return true;
}
/**
 * Restart a LLM generation session with given id, if there already
 * a session in memory, will abort that session.
 * @param {string} id
 * @returns {boolean} is sucess or not
 */
export async function restartLLMSession(id: string): Promise<boolean> {
  const state = getLLMSessionState(id);
  if (state !== LLMSesionState.Pause) {
    switch (state) {
      case LLMSesionState.Running: {
        Logger.info(
          `Try to restart a session, the session exist but still running. Job id: ${id}.`,
        );
        return false;
      }
      case LLMSesionState.Created: {
        Logger.info(
          `Try to restart a session, but the session not completed create yet. Job id: ${id}.`,
        );
        return false;
      }
      case LLMSesionState.Deleted: {
        Logger.info(`Try to restart a session, but the has been deleted. Job id: ${id}.`);
        return false;
      }
      case LLMSesionState.Finish: {
        Logger.info(`Try to restart a session, but the session is finished. Job id: ${id}.`);
        return false;
      }
    }
  }
  if (llmJobCount > 3) {
    Logger.info(`Try to restart a session, but data pipline is too bust. Job id: ${id}.`);
    return false;
  }
  const config = SessionConfigInMemoryStore.get(id)!;
  const results = SessionResultInMemoryStore.get(id)!;
  const messages = SessionMessagesInMemoryStore.get(id)!;
  let browserAndPage = SessionBrowserInMemoryStore.get(id)!;
  const { abort, getSingal } = createAborter(() => {
    decreasLLMJobCount();
  });
  SessionAborterInMemoryStore.set(id, abort);
  const [browser, page] = browserAndPage;
  if (!browser.isConnected()) {
    browserAndPage = await openBrowserWithPage(config.url);
    SessionBrowserInMemoryStore.set(id, browserAndPage);
  }
  createBackgroundLLMJob(
    id,
    browser,
    page,
    config.taskDescription,
    messages,
    results,
    getSingal,
  );
  increasLLMJobCount();
  Logger.info(`Successfully restart Job. Job id: ${id}.`);
  SessionStopSet.delete(id);
  return true;
}
/**
 * Stop a LLM session, call aborter to stop job, keep context in memory.
 * @param {string} id
 */
export function stopLLMSession(id: string) {
  const aborter = SessionAborterInMemoryStore.get(id);
  if (aborter) {
    Logger.info(`Stop Job With Id (${id}.)`);
    aborter();
  } else {
    Logger.info(`Wish to stop job, but there is no aborter. With Id (${id})`);
  }
  SessionStopSet.add(id);
}

//  export function shotdownLLMSession() {
//   Logger.info("Start Graceful Shotdown process.");
//   for(const aborter of SessionAborterInMemoryStore.values()) {
//     aborter();
//   }
//   for(const [browser] of SessionBrowserInMemoryStore.values()) {
//     browser.close();
//   }
//   Logger.info("Finish Graceful Shotdown process. Siganl All async task to stop");
// }
// process.on("SIGKILL", shotdownLLMSession);
/**
 * Create a background task with memory data,
 * @param config
 * @param messages
 * @param results
 * @param getSingal
 */
async function createBackgroundLLMJob(
  id: string,
  browser: Browser,
  page: Page,
  taskDescription: string,
  messages: Array<OpenAIMessage>,
  results: SessionResult,
  getSingal: () => boolean,
) {
  let iterKey = messages.length;
  const currntIterMutationRef = {
    mutateMsgRef: [] as Array<OpenAIMessage>,
    mutateResultRefs: [] as SessionResult,
  };
  if (messages.length === 0) {
    messages.push(createSystemMessage() as OpenAI.Chat.Completions.ChatCompletionMessage);
    iterKey = 0;
  }
  const pushMessageToContext = (msg: OpenAIMessage) => {
    messages.push(msg);
    currntIterMutationRef.mutateMsgRef.push(msg);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushMessageResultToContext = (result: any) => {
    results.push(result);
    currntIterMutationRef.mutateResultRefs.push(result);
  };
  try {
    // eslint-disable-next-line no-constant-condition
    while (1) {
      if (getSingal()) {
        currntIterMutationRef.mutateMsgRef.forEach((msg) =>
          messages.filter((m) => m !== msg),
        );
        currntIterMutationRef.mutateResultRefs.forEach((result) =>
          results.filter((r) => r !== result),
        );
        currntIterMutationRef.mutateMsgRef = [];
        currntIterMutationRef.mutateResultRefs = [];
        break;
      } else {
        currntIterMutationRef.mutateMsgRef = [];
        currntIterMutationRef.mutateResultRefs = [];
      }
      // mark and screenshot
      const indexs = await markPage(page);
      const buffer = await page.screenshot({ fullPage: true });
      const based64Image = buffer.toString("base64");
      if (iterKey != 0) {
        const currenrMsg = createContinueUserMessage(based64Image);
        pushMessageToContext(currenrMsg);
      } else {
        const initMessage = createInitUserMessage(taskDescription, based64Image);
        pushMessageToContext(initMessage);
      }
      // get instruction and do it
      const resp = await sendMessage(messages);
      const [thought, instruction] = parseInstruction(resp.choices[0]);
      console.log(thought, instruction);
      pushMessageToContext(resp.choices[0].message);
      if (instruction.type === ActionInstructionType.Finish) {
        pushMessageResultToContext({
          inst: instruction,
          thought,
          encodedImage: based64Image,
        });
        break;
      }
      const errorReason = await operateActionOnPage(instruction, page);
      if (errorReason) {
        await clearMark(page, indexs);
        pushMessageResultToContext({
          inst: { type: "Error", inst: instruction },
          thought,
          encodedImage: based64Image,
        });
        pushMessageResultToContext({
          role: "user",
          content: errorReason,
        } as OpenAIMessage);
        iterKey++;
        continue;
      }
      pushMessageResultToContext({
        inst: instruction,
        thought,
        encodedImage: based64Image,
      });
      iterKey++;
      // clear mark for next page
      await clearMark(page, indexs);
    }
  } catch (e) {
    console.error(e);
    await browser.close();
    if (getLLMSessionState(id) === LLMSesionState.Running) {
      stopLLMSession(id);
      decreasLLMJobCount();
    }
  }
}
