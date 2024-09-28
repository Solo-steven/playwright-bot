import { ActionFunctionArgs, LoaderFunctionArgs, redirect, json } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import Message from "~/components/Message";
import {
  createLLMSession,
  stopLLMSession,
  getLLMSesionResult,
  getLLMSessionMessages,
  getCookieIdFromRequest,
  clearCookieHeader,
  CreateLLMSessionResult,
  restartLLMSession,
  finishLLMSession,
} from "~/lib/session";
import { OpenAIMessage } from "~/lib/llm";
import { Logger } from "~/lib/logger";

const ACTION = {
  KEY: "_action",
  POLLING: "CHAT_ACTION/POLLING",
  STOP: "CHAT_ACTION/STOP",
  RESTART: "CHAT_ACTION/RESTART",
  ADDMSG: "CHAT_ACTION/ADD_MSG",
  FINISH: "CHAT_ACTION/FINISH",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const id: string | null = await getCookieIdFromRequest(request);
  // case 1: session not created
  if (!id) {
    Logger.info("Someone Try to access without create session.");
    throw redirect("/", { headers: await clearCookieHeader() });
  }
  // case 2: try to create a job.
  const haveRunningJob = getLLMSesionResult(id);
  if (!haveRunningJob) {
    const msg = await createLLMSession(id);
    switch (msg) {
      case CreateLLMSessionResult.MissingConfig: {
        throw redirect("/", { headers: await clearCookieHeader() });
      }
      case CreateLLMSessionResult.TooBusy: {
        throw redirect("/", { headers: await clearCookieHeader() });
      }
      case CreateLLMSessionResult.Sucess: {
        break;
      }
    }
  }
  // default:
  // - create a job successfully.
  // - running a job, just reload page.
  return {
    id,
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
        nextState: ChatMessageState.Stop,
      });
    }
    case ACTION.POLLING: {
      return json({
        messages: getLLMSessionMessages(id) || [],
        nextState: ChatMessageState.Generating,
      });
    }
    case ACTION.RESTART: {
      restartLLMSession(id);
      return json({
        messages: getLLMSessionMessages(id) || [],
        nextState: ChatMessageState.Generating,
      });
    }
    case ACTION.ADDMSG: {
      const messages = getLLMSessionMessages(id);
      messages?.push({
        role: "user",
        content: formData.get("content") as string,
      });
      restartLLMSession(id);
      return json({
        messages: messages || [],
        nextState: ChatMessageState.Generating,
      });
    }
    case ACTION.FINISH: {
      finishLLMSession(id);
      return redirect("/", {
        headers: await clearCookieHeader(),
      })
    }
  }
  return json({ messages: [], nextState: undefined });
}

enum ChatMessageState {
  Submiting = "Submiting",
  Generating = "Generating",
  Stop = "Stop",
  Finish = "Finish",
}

function useChatMessage() {
  const [state, setState] = useState(ChatMessageState.Generating);
  const timmerIdRef = useRef<NodeJS.Timeout | null>(null);
  const messageFetcher = useFetcher<{ messages: Array<OpenAIMessage> }>();
  const interruptGenFetcher = useFetcher<{ nextState: ChatMessageState }>();

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
  const createActionType = (kind: string) => {
    const formData = new FormData();
    formData.set(ACTION.KEY, kind);
    return formData;
  };

  useEffect(() => {
    startTimmer();
    return () => clearTimer();
  }, [startTimmer, clearTimer]);

  useEffect(() => {
    if (interruptGenFetcher.data?.nextState) {
      setState(interruptGenFetcher.data.nextState);
    }
  }, [interruptGenFetcher.data?.nextState]);

  return {
    state,
    messages: messageFetcher.data?.messages || [],
    stop: () => {
      interruptGenFetcher.submit(createActionType(ACTION.STOP), { method: "POST" });
      clearTimer();
      setState(ChatMessageState.Submiting);
    },
    restart: () => {
      interruptGenFetcher.submit(createActionType(ACTION.RESTART), { method: "POST" });
      startTimmer();
      setState(ChatMessageState.Submiting);
    },
    addMessage: (content: string) => {
      const formData = createActionType(ACTION.ADDMSG);
      formData.set("content", content);
      interruptGenFetcher.submit(formData, { method: "POST" });
      startTimmer();
      setState(ChatMessageState.Submiting);
    },
    finish: () => {
      interruptGenFetcher.submit(createActionType(ACTION.FINISH), { method: "POST" });
      setState(ChatMessageState.Submiting);
    }
  };
}

export default function Index() {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const { state, messages, restart, stop, addMessage, finish } = useChatMessage();
  const [content, setContent] = useState("");

  const disableInput = state !== ChatMessageState.Stop;
  const disableStop = state !== ChatMessageState.Generating;
  const disableRestart = state !== ChatMessageState.Stop;
  const disableAddMessage = state !== ChatMessageState.Stop;
  const disableFinish = state !== ChatMessageState.Generating;

  useEffect(() => {
    windowRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="bg-slate-950 w-screen h-screen">
      <div className="max-w-[1280px] m-auto py-16 ">
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
              <Button disabled={disableAddMessage} onClick={() => addMessage(content)}>
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
