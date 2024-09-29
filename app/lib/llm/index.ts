import OpenAI from "openai";
import { ActionInstruction } from "~/lib/type";
import { prompt } from "./prompt";

const ActionInstructionStartRegex = new RegExp("Action");
const ActionInstructionThoughtStartRegex = new RegExp("Thought");

const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
});

export type OpenAIMessage =
  | OpenAI.Chat.Completions.ChatCompletionMessage
  | OpenAI.Chat.Completions.ChatCompletionUserMessageParam
  | OpenAI.Chat.Completions.ChatCompletionSystemMessageParam;

export function sendMessage(messages: Array<OpenAIMessage>) {
  return client.chat.completions.create({
    messages,
    model: "gpt-4o-mini",
  });
}

/**
 * Parse the LLM response, please sync this function with the format of our prompt.
 * current format:
 * ```
 * Thought: <string> <change-line> Action: <json-string>
 * ```
 * @param choices
 * @returns
 */
export function parseInstruction(
  choices: OpenAI.Chat.Completions.ChatCompletion.Choice,
): [string, ActionInstruction] {
  const content = choices.message.content;
  if (!content) {
    throw new Error("Unexpect");
  }
  const contentArray = content.split(ActionInstructionStartRegex);
  const thought = contentArray[0].split(ActionInstructionThoughtStartRegex)[1].slice(1); // lice(1) is to remove `:` punc.
  const instrucionInString = contentArray[1].slice(1); // slice(1) is to remove `:` punc.
  const structalInstruction = JSON.parse(instrucionInString);
  return [thought, structalInstruction];
}

export function createSystemMessage() {
  return {
    role: "system",
    refusal: null,
    content: prompt(),
  };
}

export function createInitUserMessage(
  action: string,
  based64Image: string,
): OpenAI.Chat.Completions.ChatCompletionUserMessageParam {
  return {
    role: "user" as const as "user",
    content: [
      {
        type: "text",
        text: action,
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${based64Image}`,
          detail: "high",
        },
      },
    ],
  };
}

export function createContinueUserMessage(
  based64Image: string,
): OpenAI.Chat.Completions.ChatCompletionUserMessageParam {
  return {
    role: "user" as const as "user",
    content: [
      {
        type: "text",
        text: "There is next image, what should we do next ?",
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${based64Image}`,
          detail: "high",
        },
      },
    ],
  };
}
