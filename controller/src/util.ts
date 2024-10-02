import { ActionInstruction, ActionResult } from "./browserClient/type";
import { LLMMessage, LLMCompleteion } from "./llmClient";
import fs from "node:fs/promises";


export async function waitInAsync(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, time);
  });
}

export async function getLLMMessageFromActionResult(result: ActionResult, taskDescription: string | undefined, time: number): Promise<LLMMessage> {
    await fs.writeFile(`./test-${time}.png`, result.base64EncodeString, { encoding: "base64" });
    switch(result.type) {
        case "Success": {
            return {
                role: "user",
                content:[
                    {
                      type: "text",
                      text:  !taskDescription ? "There is next image, what should we do next ?" : taskDescription,
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${result.base64EncodeString}`,
                        detail: "high",
                      },
                    },
                ],
            }
        }
        case "Error": {
            return {
                role: "user",
                content:[
                    {
                      type: "text",
                      text: `${result.content}, there is image, what should we do next instead ?`,
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${result.base64EncodeString}`,
                        detail: "high",
                      },
                    },
                ],
            }
        }
    }
}

const ThoughtStringRegex = new RegExp("Thought");
const ActionStringRegex = new RegExp("Action");

export function getThoughtAndActionInstructionFronLLMCompletions(completions: LLMCompleteion): [string, ActionInstruction] {
    const completionsContent = completions.choices[0].message.content!;
    const [thoughtInString, actionInstInString] = completionsContent?.split(ActionStringRegex);
    const thought = thoughtInString.split(ThoughtStringRegex)[1].slice(1);
    
    return [thought, JSON.parse(actionInstInString.slice(1))]
}

export function getMessageFromLLMCompletions(completions: LLMCompleteion): LLMMessage {
    return {
        role: completions.choices[0].message.role,
        content: completions.choices[0].message.content || "",
        refusal: completions.choices[0].message.refusal
    }
}