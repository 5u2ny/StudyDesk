import { describe, expect, test } from 'vitest';
import { extractDate, parseAssignmentText } from './assignmentParserService';

describe('assignmentParserService', () => {
  test('extracts common due date patterns', () => {
    const ts = extractDate('Due January 12 by 11:59 PM', 2026);
    expect(new Date(ts!).getFullYear()).toBe(2026);
    expect(new Date(ts!).getMonth()).toBe(0);
    expect(new Date(ts!).getDate()).toBe(12);
    expect(new Date(ts!).getHours()).toBe(23);
    expect(new Date(ts!).getMinutes()).toBe(59);
  });

  test('turns assignment prompt into editable checklist buckets', () => {
    const parsed = parseAssignmentText({
      text: 'Research Paper\nDue 1/12/2026 by 11:59 PM\nWrite a 5 page paper in APA format and submit as PDF.',
      rubricText: 'Argument quality\nEvidence and citations',
    });
    expect(parsed.title).toBe('Research Paper');
    expect(parsed.dueDate).toBeDefined();
    expect(parsed.deliverables.map(i => i.text)).toContain('Write the required paper or report');
    expect(parsed.formatRequirements.map(i => i.text)).toContain('Use APA citation style');
    expect(parsed.formatRequirements.map(i => i.text)).toContain('Submit as PDF');
    expect(parsed.rubricItems).toHaveLength(2);
  });

  test('turns a PMP assignment prompt into deliverables, rubric items, due date, and next actions', () => {
    const parsed = parseAssignmentText({
      text: [
        'PMP Final Plan + Presentation',
        'Due May 4, 2026 at 8:00 AM',
        'Submit the final project management plan as a PDF and the presentation slides as PPTX in Blackboard.',
        'Your PMP must include scope, schedule, budget, resource plan, risk register, quality plan, communication plan, and stakeholder plan.',
        'Rubric:',
        '- Complete scope, schedule, budget, and resource integration: 30 points',
        '- Risk, quality, communication, and stakeholder planning: 30 points',
        '- Professional presentation and feasibility of recommendations: 40 points',
      ].join('\n'),
    });

    expect(parsed.title).toBe('PMP Final Plan + Presentation');
    expect(new Date(parsed.dueDate!).getFullYear()).toBe(2026);
    expect(new Date(parsed.dueDate!).getMonth()).toBe(4);
    expect(new Date(parsed.dueDate!).getDate()).toBe(4);
    expect(new Date(parsed.dueDate!).getHours()).toBe(8);
    expect(parsed.deliverables.map(i => i.text)).toEqual(expect.arrayContaining([
      'Create the project management plan',
      'Prepare presentation or slides',
    ]));
    expect(parsed.formatRequirements.map(i => i.text)).toEqual(expect.arrayContaining([
      'Submit as PDF',
      'Submit presentation file',
      'Submit through the course LMS',
    ]));
    expect(parsed.rubricItems.map(i => i.text)).toEqual(expect.arrayContaining([
      'Complete scope, schedule, budget, and resource integration: 30 points',
      'Risk, quality, communication, and stakeholder planning: 30 points',
      'Professional presentation and feasibility of recommendations: 40 points',
    ]));
    expect(parsed.submissionChecklist.map(i => i.text)).toEqual(expect.arrayContaining([
      'Confirm the extracted due date before saving',
      'Draft the project management plan outline',
      'Map every rubric item to a section before submission',
      'Save the submitted file and confirmation receipt',
    ]));
  });
});
