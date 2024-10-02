
export enum BrowserSessionState {
    Idle = "Idle",
    Running = "Running", // browser running inst
    Result = "Result", // browser finish running inst, set resp, polling to wait for next inst.
    Finish = "Finish", // browser close without error
    Fatal = "Error", // browser close with error
}

export type ActionInstructionAPIResponseBody = {
    type: "Success",
} | {
    type: "Failed",
    state: BrowserSessionState, // not including `Result` state
} | {
    type: "NotExist"
};

export type ActionResultAPIResponseBody =  {
    type: "Success"
    result: ActionResult | undefined
}  | {
    type: "Failed",
    state: BrowserSessionState, // not include running state
}  | {
    type: "NotExist"
};


export enum ActionInstructionType {
    Goto,
    Finish,
    Click,
    Type,
    Wait,
}

export type ActionInstruction =  {
    type: ActionInstructionType.Click,
    label: number
} | {
    type: ActionInstructionType.Type,
    label: number;
    content: string;
} | {
    type: ActionInstructionType.Wait,
} | {
    type: ActionInstructionType.Finish,
}

export type ActionResult = {
    type: "Success";
    base64EncodeString: string;
} | {
    type: "Error";
    content: string;
    base64EncodeString: string;
} 

export const INJECT_TEST_ID_KEY = "data-e2e-bot-id";

export const BOX_ID_PREIFX = "__e2e-bot-id";