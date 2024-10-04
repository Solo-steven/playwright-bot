import { v4 as uuidv4 } from "uuid";
import { createLLMClient, LLMClient, LLMMessage } from "./llmClient";
import { createBrowserClient, BrowserClient } from "./browserClient";
import {
  getLLMMessageFromActionResult,
  getMessageFromLLMCompletions,
  getThoughtAndActionInstructionFronLLMCompletions,
  saveBased64ImageIntoBucket,
} from "./util";
import { ActionInstructionType } from "./browserClient/type";
import { BucketClient, BucketClientConfig, createBucketClient } from "./BucketClient";

export type SessionConfig = {
  url: string;
  taskDescription: string;
  maxIter: number;
} & BucketClientConfig;
export enum SessionState {
  Running = "Running",
  Finish = "Finish",
  Error = "Error",
}

export type Session = {
  state: SessionState;
  sessionId: string;
  config: SessionConfig;
  messages: Array<LLMMessage>;
  llmClient: LLMClient;
  browserClient: BrowserClient;
  bucketClient: BucketClient;
};
export async function createSession(config: SessionConfig): Promise<Session> {
  const sessionId = uuidv4();
  return {
    state: SessionState.Running,
    sessionId,
    messages: [],
    llmClient: createLLMClient(sessionId),
    bucketClient: createBucketClient({
      bucketName: config.bucketName,
      credentials: config.credentials,
    }),
    config,
    browserClient: await createBrowserClient(config.url),
  };
}

export async function createSessionWorker(session: Session) {
  let iterTime = 0;
  try {
    // es-
    while (iterTime <= session.config.maxIter) {
      const result = await session.browserClient.getResult();
      const url = await saveBased64ImageIntoBucket(session, result, iterTime);
      const browserMsg = await getLLMMessageFromActionResult(
        result,
        url,
        iterTime,
        session.config.taskDescription,
      );
      session.messages.push(browserMsg);
      const completions = await session.llmClient.chatComplete(session.messages);
      const [_, actionInstruction] =
        getThoughtAndActionInstructionFronLLMCompletions(completions);
      console.log(_, actionInstruction);
      if (actionInstruction.type === ActionInstructionType.Finish) {
        break;
      }
      const llmMessage = getMessageFromLLMCompletions(completions);
      session.messages.push(llmMessage);
      await session.browserClient.sendInstruction(actionInstruction);
      iterTime++;
    }
  } catch (e) {
    session.state = SessionState.Error;
    await session.llmClient.flushAsync();
    await session.browserClient.deleteSession();
    return;
  }
  await session.browserClient.deleteSession();
  await session.llmClient.flushAsync();
  session.state = SessionState.Finish;
}
