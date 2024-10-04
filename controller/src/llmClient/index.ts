import OpenAI from "openai";
import { observeOpenAI } from "langfuse";
import { prompt } from "./prompt";
export type LLMMessage =
  | OpenAI.Chat.Completions.ChatCompletionMessage
  | OpenAI.Chat.Completions.ChatCompletionSystemMessageParam
  | OpenAI.Chat.Completions.ChatCompletionUserMessageParam;

export type LLMCompleteion = OpenAI.Chat.ChatCompletion;

export type LLMClient = {
  chatComplete: (messages: Array<LLMMessage>) => Promise<LLMCompleteion>;
  flushAsync: () => Promise<void>;
};

export function createLLMClient(sessionId: string): LLMClient {
  const openai = observeOpenAI(
    new OpenAI({
      apiKey: process.env.OPENAI_APIKEY,
    }),
    {
      sessionId,
    },
  );

  async function chatComplete(messages: Array<LLMMessage>) {
    return await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: prompt(),
        },
        ...messages,
      ],
    });
  }
  async function flushAsync() {
    return openai.flushAsync();
  }

  return {
    chatComplete,
    flushAsync,
  };
}
