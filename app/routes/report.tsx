import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import ReportCard from "~/components/ReportCard";
import { Button } from "~/components/ui/button";
import {
  clearCookieHeader,
  deleteLLMSession,
  getCookieIdFromRequest,
  getLLMSesionResult,
  getLLMSessionState,
} from "~/lib/session";

import { LLMSesionState } from "~/lib/type";

export async function loader({ request }: LoaderFunctionArgs) {
  const id = await getCookieIdFromRequest(request);
  if (!id) {
    throw redirect("/", { headers: await clearCookieHeader() });
  }
  const state = getLLMSessionState(id);
  switch (state) {
    case LLMSesionState.Created:
    case LLMSesionState.Running: {
      throw redirect("/chat");
    }
    case LLMSesionState.Deleted: {
      throw redirect("/", { headers: await clearCookieHeader() });
    }
  }
  const results = getLLMSesionResult(id);
  return {
    results,
  };
}

const ACTION = {
  KEY: "_action",
  DELETE: "REPORT_ACTION/DELETE",
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const id: string = (await getCookieIdFromRequest(request)) as string;
  const actionType = formData.get(ACTION.KEY);
  switch (actionType) {
    case ACTION.DELETE: {
      deleteLLMSession(id);
      return redirect("/", { headers: await clearCookieHeader() });
    }
    default: {
      break;
    }
  }
}

export default function ReportPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  console.log(data);
  return (
    <div className="bg-slate-950 w-screen h-screen">
      <div className="flex flex-col gap-4 max-w-[1080px] m-auto py-10 h-full">
        <div className="flex gap-3 border-b mb-8 pb-5 justify-between flex-shrink-0 ">
          <h2 className="text-3xl text-primary tracking-tighter font-bold">Report</h2>
          <Button
            disabled={fetcher.state === "submitting"}
            onClick={() => {
              const formData = new FormData();
              formData.set(ACTION.KEY, ACTION.DELETE);
              fetcher.submit(formData, { method: "POST" });
            }}
          >
            Finish
          </Button>
        </div>
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[calc(100% - 57)]">
          {data.results.map((result) => (
            <ReportCard
              key={result.thought}
              thought={result.thought}
              encodedImage={result.encodedImage}
              instruction={JSON.stringify(result.inst)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
