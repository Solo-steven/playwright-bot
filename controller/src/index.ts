import 'dotenv/config';
import { createLLMClient, LLMClient, LLMMessage } from "./llmClient";
import { createBrowserClient, BrowserClient } from "./browserClient";
import { getLLMMessageFromActionResult, getMessageFromLLMCompletions, getThoughtAndActionInstructionFronLLMCompletions } from "./util";
import { ActionInstructionType } from "./browserClient/type";

type SessionConfig = {
    url: string;
    taskDescription: string;
}

type Session = {
    sessionId: string;
    config: SessionConfig;
    messages: Array<LLMMessage>;
    llmClient: LLMClient;
    browserClient: BrowserClient
}


async function createCodeGenSession(config: SessionConfig): Promise<Session> {
    return {
        sessionId: "1",
        messages: [],
        llmClient: createLLMClient(),
        config,
        browserClient: await createBrowserClient(config.url),

    }
}


async function testSession() {
    const config = {
        url: "https://google.com",
        taskDescription: "Go to Yahoo news page and click a random article."
    };
    const session = await createCodeGenSession(config);
    
    try {
        // loop
        let iterTime = 0
        //while(1) {
            {
                const result = await session.browserClient.getResult();
                const browserMsg = await getLLMMessageFromActionResult(result, iterTime === 0 ? config.taskDescription: undefined, iterTime);
                session.messages.push(browserMsg);
                const completions = await session.llmClient.chatComplete(session.messages);
                const [though, actionInstruction] = getThoughtAndActionInstructionFronLLMCompletions(completions);
                console.log("1:",though, actionInstruction);
                if(actionInstruction.type === ActionInstructionType.Finish) {
                    
                }
                const llmMessage = getMessageFromLLMCompletions(completions);
                session.messages.push(llmMessage);
                await session.browserClient.sendInstruction(actionInstruction);
            }
            iterTime ++
            {
                const result = await session.browserClient.getResult();
                const browserMsg = await getLLMMessageFromActionResult(result, iterTime === 0 ? config.taskDescription: undefined, iterTime);
                session.messages.push(browserMsg);
                const completions = await session.llmClient.chatComplete(session.messages);
                const [though, actionInstruction] = getThoughtAndActionInstructionFronLLMCompletions(completions);
                console.log("2:",though, actionInstruction);
            }
        // }
    } catch(e) {
        console.log(e);
    }
    await session.browserClient.deleteSession();

}

testSession();