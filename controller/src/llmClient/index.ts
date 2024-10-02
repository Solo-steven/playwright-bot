import OpenAI from "openai";
import { prompt } from "./prompt";
export type LLMMessage = 
    OpenAI.Chat.Completions.ChatCompletionMessage | 
    OpenAI.Chat.Completions.ChatCompletionSystemMessageParam | 
    OpenAI.Chat.Completions.ChatCompletionUserMessageParam;

export type LLMCompleteion = OpenAI.Chat.ChatCompletion;

export type LLMClient = {
    chatComplete: (messages: Array<LLMMessage>) => Promise<LLMCompleteion>;
}

export function createLLMClient(): LLMClient {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_APIKEY
    });

    async function chatComplete(messages: Array<LLMMessage>) {
        return await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [ {
                role: "system",
                content: prompt(),
            },  ...messages]
        });
    }

    return {
        chatComplete
    }
}