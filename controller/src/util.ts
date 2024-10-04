import { ActionInstruction, ActionResult } from "./browserClient/type";
import { LLMMessage, LLMCompleteion } from "./llmClient";
import { Session } from "./session";

export async function waitInAsync(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, time);
  });
}

export async function saveBased64ImageIntoBucket(
  session: Session,
  result: ActionResult,
  iterTime: number,
) {
  const sessionId = session.sessionId;
  const { bucketName } = session.config;
  await session.bucketClient.uploadBased64Image(
    `${sessionId}/iter-${iterTime}.png`,
    result.base64EncodeString,
  );
  const url = `https://storage.googleapis.com/${bucketName}/${sessionId}/iter-${iterTime}.png`;
  return url;
}

export async function getLLMMessageFromActionResult(
  result: ActionResult,
  url: string,
  iterTime: number,
  taskDescription: string,
): Promise<LLMMessage> {
  switch (result.type) {
    case "Success": {
      return {
        role: "user",
        content: [
          {
            type: "text",
            text:
              iterTime !== 0
                ? "There is Observation image, what should we do next ?"
                : taskDescription,
          },
          {
            type: "image_url",
            image_url: {
              url,
              detail: "high",
            },
          },
        ],
      };
    }
    case "Error": {
      return {
        role: "user",
        content: [
          {
            type: "text",
            text: `${result.content}, there is image, what should we do next instead ?`,
          },
          {
            type: "image_url",
            image_url: {
              url,
              detail: "high",
            },
          },
        ],
      };
    }
  }
}

const ThoughtStringRegex = new RegExp("Thought");
const ActionStringRegex = new RegExp("Action");

export function getThoughtAndActionInstructionFronLLMCompletions(
  completions: LLMCompleteion,
): [string, ActionInstruction] {
  const completionsContent = completions.choices[0].message.content!;
  const [thoughtInString, actionInstInString] =
    completionsContent.split(ActionStringRegex);
  const thought = thoughtInString.split(ThoughtStringRegex)[1].slice(1);

  return [thought, JSON.parse(actionInstInString.slice(1))];
}

export function getMessageFromLLMCompletions(completions: LLMCompleteion): LLMMessage {
  return {
    role: completions.choices[0].message.role,
    content: completions.choices[0].message.content || "",
    refusal: completions.choices[0].message.refusal,
  };
}
