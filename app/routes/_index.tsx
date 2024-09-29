import { Label } from "@radix-ui/react-label";
import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
  json,
  redirect,
} from "@remix-run/node";
import { Form, useNavigation } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  clearCookieHeader,
  getCookieIdFromRequest,
  getLLMSessionState,
  sessionCookie,
  storeSessionConfig,
} from "~/lib/session";

import { LLMSesionState } from "~/lib/type";

export const meta: MetaFunction = () => {
  return [
    { title: "E2E bot" },
    { name: "description", content: "Create E2E testing with LLM" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const id: string | null = await getCookieIdFromRequest(request);
  if (id) {
    if (getLLMSessionState(id) !== LLMSesionState.Deleted) {
      return redirect("/chat");
    } else {
      return json(
        {},
        {
          headers: await clearCookieHeader(),
        },
      );
    }
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const url = formData.get("url") as string;
  const taskDescription = formData.get("taskDescription") as string;
  const id = Math.random().toString(32);
  const sessionId = await sessionCookie.serialize(id);
  storeSessionConfig(id, { url, taskDescription });
  return redirect("/chat", {
    headers: {
      "Set-Cookie": sessionId,
    },
  });
}

export default function Index() {
  const navigation = useNavigation();
  return (
    <div className="bg-slate-950 w-screen h-screen">
      <div className=" max-w-[1080px] m-auto py-16">
        <h2 className="text-3xl text-primary tracking-tighter font-bold mb-3">Settings</h2>
        <p className="text-muted-foreground text-base">
          config your website base information to start a LLM auto gen test case bot
        </p>
        <div className="shrink-0 bg-border h-[1px] w-full my-6" />
        <Form className="px-7 flex flex-col gap-4" method="POST">
          <div className="w-full">
            <Label htmlFor="email">URL</Label>
            <Input
              required
              type="url"
              id="url"
              placeholder="url"
              className="w-full mt-3 mb-1"
              name="url"
            />
            <div className="text-[0.8rem] text-muted-foreground">URL of your website</div>
          </div>
          <div className="w-full">
            <Label htmlFor="email">Task Description</Label>
            <Textarea
              required
              className="w-full mt-3 mb-1"
              rows={6}
              name="taskDescription"
            />
            <div className="text-[0.8rem] text-muted-foreground">
              Product Info of your website
            </div>
          </div>
          <div className="w-full">
            <Label htmlFor="email">Product Info</Label>
            <Textarea className="w-full mt-3 mb-1" rows={6} name="productionInfo" />
            <div className="text-[0.8rem] text-muted-foreground">
              Product Info of your website
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={navigation.state !== "idle"}>Start Generate</Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
