import { PropsWithChildren } from "react";

interface MessageProps {
  direction: "user" | "bot";
}

export default function Message({ direction, children }: PropsWithChildren<MessageProps>) {
  const isUser = direction === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} p-4 w-full`}>
      <div
        className={`${isUser ? "bg-primary text-primary-foreground rounded-l-lg rounded-tr-lg" : "bg-secondary text-secondary-foreground rounded-r-lg rounded-tl-lg"} p-4 max-w-[80%] `}
      >
        {children}
      </div>
    </div>
  );
}
