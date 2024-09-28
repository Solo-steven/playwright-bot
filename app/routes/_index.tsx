import { Label } from "@radix-ui/react-label";
import { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, json } from "@remix-run/node";
import { Form, redirect } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  clearCookieHeader,
  getCookieIdFromRequest,
  getLLMSesionResult,
  sessionCookie,
  storeSessionConfig,
} from "~/lib/session";

export const meta: MetaFunction = () => {
  return [{ title: "New Remix App" }, { name: "description", content: "Welcome to Remix!" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const id: string | null = await getCookieIdFromRequest(request);
  if (id) {
    if (getLLMSesionResult(id)) {
      redirect("/chat");
      return json({});
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
  return (
    <div className="bg-slate-950 w-screen h-screen">
      <div className=" max-w-[1080px] m-auto py-16">
        <h2 className=" text-3xl text-primary tracking-tighter font-bold mb-3">Settings</h2>
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
            <Textarea required className="w-full mt-3 mb-1" rows={6} name="productionInfo" />
            <div className="text-[0.8rem] text-muted-foreground">
              Product Info of your website
            </div>
          </div>
          <div className="flex justify-end">
            <Button>Start Generate</Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
