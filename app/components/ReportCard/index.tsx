interface ReportCardProps {
  thought: string;
  instruction: string;
  encodedImage: string;
}

export default function ReportCard({ encodedImage, thought, instruction }: ReportCardProps) {
  return (
    <div className="flex gap-3 bg-muted/60 border rounded-md py-3 px-6">
      <div className="h-[300px] max-w-[60%] overflow-y-scroll flex-shrink-0">
        <img src={`data:image/png;base64,${encodedImage}`} alt="screenshot" />
      </div>
      <div className="flex flex-col gap-3">
        <p>Thought: {thought}</p>
        <div className="border-b" />
        <p>Action: {instruction}</p>
      </div>
    </div>
  );
}
