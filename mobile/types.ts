export type Job = {
  control?: string;
  id: string;
  status: string;
  error?: string;
  created: number;
  events?: TaskEvent[];
};
export type Agent = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  avatar: number;
  shape?: string;
  material?: string;
  memory: string;
  preview?: string;
  last_activity?: number;
  job?: Job | null;
};
export type Message = { id: number; role: string; text: string; created?: number };
export type TaskEvent = {
  kind: string;
  text?: string;
  name?: string;
  args?: Record<string, any>;
};
export type WorkspaceFile = { name: string; directory: boolean; size: number };
export type Skill = { id: string; name: string; instructions: string };
export type Config = { url: string; key: string; model: string; animations: boolean };
export type Api = (
  path: string,
  method?: string,
  body?: any,
  overrideToken?: string,
) => Promise<any>;
export type Screen = "home" | "chat" | "computer" | "settings";
