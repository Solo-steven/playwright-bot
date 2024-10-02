import { createClient } from "redis";
import { ChildProcess, exec } from "node:child_process";
import { ActionInstruction, ActionResult, BrowserSessionState, ActionInstructionAPIResponseBody, ActionResultAPIResponseBody  } from "./type";

const redisClient = createClient();

export function connectRedis() {
    return redisClient.connect();
}

export function  disconnectRedis() {
    return redisClient.disconnect();
}

type BrowserConfig = {
    url: string;
}

type BrowserSession = {
    id: string;
    config: BrowserConfig;
    childProcess: ChildProcess,
    aborter: boolean;
}

const sessionsRecord: Record<string, BrowserSession> = {};


export async function setActionInstructionToSession(sessionId: string, actionInstructon: ActionInstruction): Promise<ActionInstructionAPIResponseBody> {
    const state = await redisClient.get(`${sessionId}_state`);
    if(typeof state !== "string" || !state) {
        return {
            type: "NotExist"
        }
    }
    switch(state) {
        case BrowserSessionState.Idle:
        case BrowserSessionState.Running:
        case BrowserSessionState.Fatal:
        case BrowserSessionState.Finish: {
            return {
                type: "Failed",
                state,
            }
        }
        case BrowserSessionState.Result: {
            await redisClient.multi()
                .set(`${sessionId}_inst`, JSON.stringify(actionInstructon))
                .set(`${sessionId}_state`, BrowserSessionState.Running)
                .exec()
            ;
            return { type: "Success" };
        }
        default: {
            throw new Error("unreach");
        }
    }
}

export async function getActionResultAPIResponseFromSession(sessionId: string): Promise<ActionResultAPIResponseBody> {
    // validate state
    const state = await redisClient.get(`${sessionId}_state`);
    if(typeof state !== "string" || !state) {
        console.log(state);
        return {
            type: "NotExist"
        }
    }
    switch(state) {
        case BrowserSessionState.Idle:
        case BrowserSessionState.Running: {
            return {
                type: "Failed",
                state,
            }
        }
        case BrowserSessionState.Fatal:
        case BrowserSessionState.Finish: {
            stopSession(sessionId);
            return {
                type: "Failed",
                state,
            }
        }
        case BrowserSessionState.Result: {
           const resp =  await redisClient.getDel(`${sessionId}_resp`);
           if(typeof resp !== "string" || !resp) {
            return {
                type: "Success",
                result: undefined,
            }
           }
           return { type: "Success", result: JSON.parse(resp) as ActionResult };
        }
        default: {
            throw new Error("unreach");
        }
    }
}

export async function createSession(url: string) {
    const id = (100 *Math.random()).toString(32);
    await redisClient.set(`${id}_state`, BrowserSessionState.Idle);
    const childProcess = exec(`SESSION_ID=${id} URL=${url} npx playwright test`);
    // childProcess.stdout?.on('data', (data) => console.log(data));
    // console.log(childProcess.stdout);
    sessionsRecord[id] = {
        id,
        config: { url },
        childProcess,
        aborter: false,
    };
    return id;
}

export function stopSession(id: string) {
    const session = sessionsRecord[id];
    session.childProcess.kill();
    session.aborter = true;
}

export function deleteSession(id: string) {
    stopSession(id);
    delete sessionsRecord[id];
}

export function shotDownAllSession() {
    for(const session of Object.values(sessionsRecord)) {
        session.childProcess.kill();
        session.aborter = true;
    }
}
