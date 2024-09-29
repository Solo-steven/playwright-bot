import {
  MetaFunction,
  ActionFunctionArgs,
  LoaderFunctionArgs,
  redirect,
  json,
} from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import Message from "~/components/Message";
import {
  createLLMSession,
  stopLLMSession,
  getLLMSessionMessages,
  getCookieIdFromRequest,
  clearCookieHeader,
  restartLLMSession,
  finishLLMSession,
  getLLMSessionState,
  getLLMSesionResult,
} from "~/lib/session";
import { OpenAIMessage } from "~/lib/llm";
import { ActionInstructionType, LLMSesionState } from "~/lib/type";
import { Logger } from "~/lib/logger";

const ACTION = {
  KEY: "_action",
  POLLING: "CHAT_ACTION/POLLING",
  STOP: "CHAT_ACTION/STOP",
  RESTART: "CHAT_ACTION/RESTART",
  ADDMSG: "CHAT_ACTION/ADD_MSG",
  FINISH: "CHAT_ACTION/FINISH",
};

export const meta: MetaFunction = () => {
  return [
    { title: "E2E bot" },
    { name: "description", content: "Create E2E testing with LLM" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const id: string | null = await getCookieIdFromRequest(request);
  if (!id) {
    Logger.info("Someone Try to access without create session.");
    throw redirect("/", { headers: await clearCookieHeader() });
  }
  const state = getLLMSessionState(id);
  switch (state) {
    case LLMSesionState.Created: {
      const isSuccessd = await createLLMSession(id);
      if (!isSuccessd) {
        throw redirect("/", { headers: await clearCookieHeader() });
      }
      break;
    }
    case LLMSesionState.Running:
    case LLMSesionState.Pause: {
      break;
    }
    case LLMSesionState.Deleted: {
      throw redirect("/", { headers: await clearCookieHeader() });
    }
    case LLMSesionState.Finish: {
      throw redirect("/report");
    }
  }
  return {
    id,
    serverState: getLLMSessionState(id),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get(ACTION.KEY) as string;
  const id: string = (await getCookieIdFromRequest(request)) as string;
  switch (actionType) {
    case ACTION.STOP: {
      stopLLMSession(id);
      return json({
        serverState: LLMSesionState.Pause,
      });
    }
    case ACTION.POLLING: {
      const instructions = getLLMSesionResult(id);
      const isFinish =
        instructions &&
        instructions[instructions.length - 1]?.inst?.type === ActionInstructionType.Finish;
      if (isFinish) {
        await finishLLMSession(id);
        throw redirect("/report");
      }
      return json({
        messages: getLLMSessionMessages(id) || [],
        serverState: LLMSesionState.Running,
      });
    }
    case ACTION.RESTART: {
      const isSucess = await restartLLMSession(id);
      if (!isSucess) {
        finishLLMSession(id);
        return redirect("/", {
          headers: await clearCookieHeader(),
        });
      }
      return json({
        messages: getLLMSessionMessages(id) || [],
        serverState: LLMSesionState.Running,
      });
    }
    case ACTION.ADDMSG: {
      const messages = getLLMSessionMessages(id);
      messages?.push({
        role: "user",
        content: formData.get("content") as string,
      });
      const isSuccess = await restartLLMSession(id);
      if (!isSuccess) {
        finishLLMSession(id);
        return redirect("/", {
          headers: await clearCookieHeader(),
        });
      }
      return json({
        messages: messages || [],
        serverState: LLMSesionState.Running,
      });
    }
    case ACTION.FINISH: {
      finishLLMSession(id);
      return redirect("/report");
    }
  }
  return json({ messages: [], serverState: LLMSesionState.Running });
}

const createActionType = (kind: string) => {
  const formData = new FormData();
  formData.set(ACTION.KEY, kind);
  return formData;
};

type ClientSideLLMSessionState = LLMSesionState | "Submmiting";

function useChatMessage() {
  const data = useLoaderData<typeof loader>();
  const [state, setState] = useState(data.serverState as ClientSideLLMSessionState);
  const timmerIdRef = useRef<NodeJS.Timeout | null>(null);
  const messageFetcher = useFetcher<{ messages: Array<OpenAIMessage> }>();
  const interruptGenFetcher = useFetcher<typeof action>();

  const startTimmer = useCallback(() => {
    if (timmerIdRef.current == null) {
      timmerIdRef.current = setInterval(() => {
        const formData = new FormData();
        formData.set(ACTION.KEY, ACTION.POLLING);
        messageFetcher.submit(formData, { method: "POST" });
      }, 2000);
    }
  }, [messageFetcher]);

  const clearTimer = useCallback(() => {
    if (timmerIdRef.current) {
      clearInterval(timmerIdRef.current);
      timmerIdRef.current = null;
    }
  }, []);
  useEffect(() => {
    startTimmer();
    return () => clearTimer();
  }, [startTimmer, clearTimer]);

  useEffect(() => {
    if (interruptGenFetcher.data?.serverState) {
      setState(interruptGenFetcher.data.serverState);
    }
  }, [interruptGenFetcher.data?.serverState]);

  return {
    state,
    messages: messageFetcher.data?.messages || [],
    stop: () => {
      interruptGenFetcher.submit(createActionType(ACTION.STOP), { method: "POST" });
      clearTimer();
      setState("Submmiting");
    },
    restart: () => {
      interruptGenFetcher.submit(createActionType(ACTION.RESTART), { method: "POST" });
      startTimmer();
      setState("Submmiting");
    },
    addMessage: (content: string) => {
      const formData = createActionType(ACTION.ADDMSG);
      formData.set("content", content);
      interruptGenFetcher.submit(formData, { method: "POST" });
      startTimmer();
      setState("Submmiting");
    },
    finish: () => {
      interruptGenFetcher.submit(createActionType(ACTION.FINISH), { method: "POST" });
      setState("Submmiting");
    },
  };
}

export default function ChatPage() {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const { state, messages, restart, stop, addMessage, finish } = useChatMessage();
  const [content, setContent] = useState("");

  const disableStop = state !== LLMSesionState.Running;
  const disableFinish = state !== LLMSesionState.Running;

  const disableInput = state !== LLMSesionState.Pause;
  const disableRestart = state !== LLMSesionState.Pause;
  const disableAddMessage = state !== LLMSesionState.Pause;

  useEffect(() => {
    windowRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="bg-slate-950 w-screen h-screen">
      <div className="max-w-[1280px] m-auto py-16 ">
        <div className="flex gap-3 border-b mb-8 pb-5 justify-between flex-shrink-0 ">
          <h2 className="text-3xl text-primary tracking-tighter font-bold">Bot Generate</h2>
        </div>
        <div className="bg-muted/60 border rounded-lg p-4">
          <div className=" max-h-[580px] p-4 overflow-y-auto">
            {messages.map((message) => renderOpenAiMessage(message))}
            <div className=" min-h-1 w-full" ref={windowRef} />
          </div>
          <div className="bg-slate-950 focus-within:ring-1 focus-within:ring-ring rounded-md border">
            <Textarea
              disabled={disableInput}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="border-0 focus-visible:ring-0 resize-none"
            />
            <div className="flex items-center p-3 pt-0 gap-2">
              <Button disabled={disableStop} onClick={() => stop()}>
                {" "}
                Stop Generate
              </Button>
              <Button disabled={disableRestart} onClick={() => restart()}>
                {" "}
                Restart Generate
              </Button>
              <Button
                disabled={disableAddMessage}
                onClick={() => {
                  setContent("");
                  addMessage(content);
                }}
              >
                {" "}
                Add Message{" "}
              </Button>
              <Button disabled={disableFinish} onClick={() => finish()}>
                {" "}
                Finish Session{" "}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderOpenAiMessage(message: OpenAIMessage) {
  switch (message.role) {
    case "system": {
      return null;
    }
    case "assistant": {
      return <Message direction="bot">{message.content}</Message>;
    }
    case "user": {
      if (typeof message.content === "string") {
        return <Message direction="user">{message.content}</Message>;
      }
      return (
        <Message direction="user">
          {message.content.map((msg) =>
            msg.type === "text" ? (
              <div key={msg.text}>{msg.text}</div>
            ) : (
              <div className="mt-3 max-h-[300px] overflow-y-auto" key={msg.image_url.url}>
                <img src={msg.image_url.url} alt="screenshot" />
              </div>
            ),
          )}
        </Message>
      );
    }
  }
}
