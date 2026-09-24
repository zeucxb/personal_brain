export type CustomAgent = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  defaultMateria?: string;
  canConsultTopics: boolean;
  createdAt: number;
  updatedAt: number;
  isBuiltIn?: boolean;
};
