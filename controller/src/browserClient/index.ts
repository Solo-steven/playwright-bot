import {
  ActionInstruction,
  ActionInstructionAPIResponseBody,
  ActionResult,
  ActionResultAPIResponseBody,
  BrowserSessionState,
} from "./type";
import { waitInAsync } from "../util";

export type BrowserClient = {
  getResult: () => Promise<ActionResult>;
  sendInstruction: (instruction: ActionInstruction) => Promise<void>;
  deleteSession: () => Promise<void>;
};

const browserServerURL = process.env.BROWSER_CLIENT_URL as string;

async function createBrowserSession(url: string): Promise<string> {
  const resp = await fetch(`${browserServerURL}/session/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  }).then((resp) => resp.json());
  const sessionId = resp.sessionId as string;
  return sessionId;
}

export async function createBrowserClient(url: string): Promise<BrowserClient> {
  const browserServerURL = process.env.BROWSER_CLIENT_URL as string;
  const sessionId = await createBrowserSession(url);

  async function getResult() {
    while (1) {
      const resp: ActionResultAPIResponseBody = await fetch(
        `${browserServerURL}/session/screenshot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        },
      ).then((resp) => resp.json());

      switch (resp.type) {
        case "Success": {
          if (resp.result === undefined) {
            throw new Error();
          }
          return resp.result;
        }
        case "Failed": {
          switch (resp.state) {
            case BrowserSessionState.Idle:
            case BrowserSessionState.Running: {
              await waitInAsync(800);
              continue;
            }
            case BrowserSessionState.Result: {
              throw new Error();
            }
            case BrowserSessionState.Finish: {
              throw new Error();
            }
            case BrowserSessionState.Fatal: {
              throw new Error();
            }
          }
        }
        case "NotExist": {
          throw new Error();
        }
      }
    }
    throw new Error();
  }

  async function sendInstruction(actionInstruction: ActionInstruction) {
    while (1) {
      const resp: ActionInstructionAPIResponseBody = await fetch(
        `${browserServerURL}/session/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId, action: actionInstruction }),
        },
      ).then((resp) => resp.json());

      switch (resp.type) {
        case "Success": {
          return;
        }
        case "Failed": {
          switch (resp.state) {
            case BrowserSessionState.Idle:
            case BrowserSessionState.Running:
            case BrowserSessionState.Result: {
              await waitInAsync(800);
              continue;
            }
            case BrowserSessionState.Finish: {
              throw new Error();
            }
            case BrowserSessionState.Fatal: {
              throw new Error();
            }
          }
        }
        case "NotExist": {
          throw new Error();
        }
      }
    }
    throw new Error();
  }
  async function deleteSession() {
    await fetch(`${browserServerURL}/session/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    }).then((resp) => resp.json());
  }

  return {
    getResult,
    sendInstruction,
    deleteSession,
  };
}
