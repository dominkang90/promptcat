import { z } from "zod";

export const fixedElementSchema = z.object({
  id: z.string(),
  category: z.string(),
  value: z.string(),
});

export const variableElementSchema = z.object({
  id: z.string(),
  category: z.string(),
  value: z.string(),
  placeholder: z.string(),
});

export const extractionResultSchema = z.object({
  imageType: z.string(),
  fullPrompt: z.string(),
  fixedElements: z.array(fixedElementSchema),
  variableElements: z.array(variableElementSchema),
  negativePrompt: z.string().default(""),
  notes: z.string().default(""),
});

export type FixedElement = z.infer<typeof fixedElementSchema>;
export type VariableElement = z.infer<typeof variableElementSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
