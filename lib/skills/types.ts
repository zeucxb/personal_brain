import { AvailableToolId } from '../tools/catalog';

export type SkillCategory = 'academico' | 'estudo' | 'visual' | 'produtividade';

export type CustomSkill = {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: SkillCategory;
  promptInstruction: string;
  tools?: AvailableToolId[];
  isBuiltIn?: boolean;
  createdAt: number;
  updatedAt: number;
};

