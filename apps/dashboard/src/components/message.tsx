import { TextShimmer } from "@connorco/ui/text-shimmer";
import {
  type SupportedToolName,
  ToolCallIndicator,
} from "@connorco/ui/tool-call-indicator";

export const ThinkingMessage = () => {
  return (
    <TextShimmer className="text-sm" duration={1}>
      Thinking...
    </TextShimmer>
  );
};

type ActiveToolCallProps = {
  toolName: string;
};

export const ActiveToolCall = ({ toolName }: ActiveToolCallProps) => {
  // Type assertion to ensure compatibility with our supported tool names
  const supportedToolName = toolName as SupportedToolName;

  return <ToolCallIndicator toolName={supportedToolName} />;
};
