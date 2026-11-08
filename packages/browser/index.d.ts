export type Capability = "text" | "image" | "structuredOutput" | "streaming";
export type Message = {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
};
export type Attachment = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  data: string;
};
export type Result<T = string> = {
  output: T;
  requestId: string;
  remaining: number;
  model: string;
  provider: string;
  toolCalls: 0;
  usage?: unknown;
};
export class AIConnectionError extends Error {
  code: string;
  requestId?: string;
}
export function isConnectorAvailable(options?: {
  signal?: AbortSignal;
}): Promise<boolean>;
export function connectAI(options: {
  name: string;
  purpose: string;
  requires?: Capability[];
  signal?: AbortSignal;
  onPairing?: (pairing: {
    verificationCode: string;
    approvalUrl: string;
    expiresAt: number;
  }) => void;
}): Promise<AISession>;
export class AISession {
  readonly info: Readonly<{
    grantId: string;
    expiresAt: number;
    remaining: number;
    provider: string;
    billing: string;
    model: string;
    capabilities: Capability[];
    protocolVersion: 1;
  }>;
  generate<T = string>(options: {
    messages: Message[];
    attachments?: Attachment[];
    outputSchema?: Record<string, unknown>;
    onText?: (text: string) => void;
    signal?: AbortSignal;
    requestId?: string;
  }): Promise<Result<T>>;
  status<T = string>(
    requestId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{
    requestId: string;
    status: "running" | "completed" | "failed" | "cancelled";
    result?: Result<T>;
    error?: { code: string; message: string };
  }>;
  cancel(requestId: string): Promise<void>;
  disconnect(): Promise<void>;
}
