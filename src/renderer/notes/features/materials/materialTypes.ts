import type { Note } from '@schema'

export type MaterialKind = 'reading' | 'case' | 'assignment_prompt' | 'slide' | 'study_guide' | 'syllabus'

export const materialKindOptions: Array<{ kind: MaterialKind; label: string }> = [
  { kind: 'reading', label: 'Readings' },
  { kind: 'case', label: 'Cases' },
  { kind: 'assignment_prompt', label: 'Assignment prompts' },
  { kind: 'slide', label: 'Slides' },
  { kind: 'study_guide', label: 'Study guides' },
  { kind: 'syllabus', label: 'Syllabus' },
]

export function inferMaterialKind(name: string, documentType?: Note['documentType']): { kind: MaterialKind; label: string } {
  const value = name.toLowerCase()
  const kind: MaterialKind =
    documentType === 'syllabus' ? 'syllabus'
    : documentType === 'assignment_prompt' ? 'assignment_prompt'
    : /\.(pptx?|key)$/i.test(value) || /\b(slides?|lecture deck|powerpoint|presentation)\b/i.test(value) ? 'slide'
    : /\b(case|harvard|coffee chain)\b/i.test(value) ? 'case'
    : /\b(assignment|homework|prompt|project report|deliverable)\b/i.test(value) ? 'assignment_prompt'
    : /\b(study guide|review guide|exam review|practice exam)\b/i.test(value) ? 'study_guide'
    : 'reading'
  return materialKindOptions.find(option => option.kind === kind) ?? materialKindOptions[0]
}
