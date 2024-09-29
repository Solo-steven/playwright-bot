export interface SessionConfig {
  url: string;
  taskDescription: string;
  productInfo?: string;
}

export type SessionResult = Array<{
  inst: ActionInstructionOrError;
  thought: string;
  encodedImage: string;
}>;

export enum LLMSesionState {
  Created = "Created",
  Running = "Running",
  Pause = "Pause",
  Finish = "Finish",
  Deleted = "Deleted",
}

// export type MemorySession = {
//     config: SessionConfig;
//     result: SessionResult;
//     aborter: () => void;
// };

export type ActionInstructionOrError =
  | ActionInstruction
  | {
      type: "Error";
      inst: ActionInstruction;
    };

export enum ActionInstructionType {
  Click = "Click",
  Type = "Type",
  Finish = "Finish",
  Wait = "Wait",
}

export type ActionInstruction =
  | {
      type: ActionInstructionType.Click;
      label: number;
    }
  | {
      type: ActionInstructionType.Type;
      label: number;
      content: string;
    }
  | {
      type: ActionInstructionType.Finish;
    }
  | {
      type: ActionInstructionType.Wait;
    };

export const INJECT_TEST_ID_KEY = "data-e2e-bot-id";

export const BOX_ID_PREIFX = "__e2e-bot-id";
