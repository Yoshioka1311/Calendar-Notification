import type { EventCategory } from './types';

export type CategoryScore = { category: EventCategory; score: number };

type WeightedRule = {
  category: EventCategory;
  phrases: { value: string; weight: number }[];
};

const RULES: WeightedRule[] = [
  {
    category: 'Important',
    phrases: weighted(20, ['ด่วนมาก', 'สำคัญมาก', 'urgent', 'critical', 'ด่วน']).concat(weighted(10, ['สำคัญ', 'กำหนดส่ง', 'deadline', 'due'])),
  },
  {
    category: 'Exam',
    phrases: weighted(4, ['สอบกลางภาค', 'สอบปลายภาค', 'midterm', 'final exam']).concat(weighted(3, ['ข้อสอบ', 'สอบ', 'quiz', 'exam', 'test'])),
  },
  {
    category: 'Assignment',
    phrases: weighted(5, ['ส่งการบ้าน', 'ส่งงาน', 'ส่งโปรเจกต์', 'submit assignment', 'submit project']).concat(weighted(3, ['การบ้าน', 'assignment', 'homework', 'project', 'report'])),
  },
  {
    category: 'Meeting',
    phrases: weighted(8, ['นัดประชุม', 'ประชุมโปรเจกต์', 'project meeting']).concat(weighted(6, ['ประชุม', 'มีทติ้ง', 'คุยงาน', 'team sync', 'conference']).concat(weighted(4, ['meeting', 'standup', 'briefing', 'zoom call', 'teams call']).concat(weighted(2, ['presentation', 'สัมมนา'])))),
  },
  {
    category: 'Health',
    phrases: weighted(9, ['ตรวจสุขภาพ', 'ไปหาหมอ', 'นัดหมอ', 'doctor appointment']).concat(weighted(6, ['โรงพยาบาล', 'คลินิก', 'ทันตแพทย์', 'หาหมอ', 'hospital', 'dentist']).concat(weighted(4, ['หมอ', 'ยา', 'doctor', 'clinic', 'medical', 'วัคซีน', 'vaccine']))),
  },
  {
    category: 'Appointment',
    phrases: weighted(7, ['นัดหมาย', 'นัดพบ', 'appointment']).concat(weighted(4, ['reservation', 'booking', 'จองคิว'])),
  },
  {
    category: 'Birthday',
    phrases: weighted(9, ['วันเกิด', 'birthday']).concat(weighted(6, ['งานวันเกิด', 'birthday party']).concat(weighted(4, ['anniversary', 'ครบรอบ']))),
  },
  {
    category: 'Exercise',
    phrases: weighted(4, ['ออกกำลังกาย', 'เข้ายิม']).concat(weighted(3, ['ฟิตเนส', 'ยิม', 'วิ่ง', 'ฟุตบอล', 'ปิงปอง', 'gym', 'workout', 'training']).concat(weighted(2, ['run']))),
  },
  {
    category: 'Travel',
    phrases: weighted(6, ['ขึ้นเครื่อง', 'เดินทางไป', 'สนามบิน', 'เที่ยว']).concat(weighted(4, ['เครื่องบิน', 'เที่ยวบิน', 'เดินทาง', 'flight', 'airport', 'travel', 'trip']).concat(weighted(2, ['บิน']))),
  },
  {
    category: 'Study',
    phrases: weighted(4, ['อ่านหนังสือ', 'เข้าเรียน']).concat(weighted(3, ['เรียน', 'ติว', 'วิชา', 'study', 'class', 'lecture', 'lesson'])),
  },
  {
    category: 'School',
    phrases: weighted(3, ['โรงเรียน', 'มหาวิทยาลัย', 'school', 'university', 'campus']),
  },
  {
    category: 'Work',
    phrases: weighted(5, ['ลูกค้า', 'client']).concat(weighted(3, ['ออฟฟิศ', 'สำนักงาน', 'office']).concat(weighted(1, ['งาน', 'work']))),
  },
  {
    category: 'Personal',
    phrases: weighted(6, ['ธุระส่วนตัว', 'นัดครอบครัว']).concat(weighted(4, ['ส่วนตัว', 'ครอบครัว', 'ซื้อของ', 'personal', 'family', 'shopping']).concat(weighted(3, ['จ่ายบิล', 'bill payment']))),
  },
  {
    category: 'Social',
    phrases: weighted(7, ['งานเลี้ยง', 'ปาร์ตี้', 'party']).concat(weighted(5, ['กินข้าวกับเพื่อน', 'เจอเพื่อน', 'hangout']).concat(weighted(3, ['เพื่อน', 'friends', 'dinner']))),
  },
];

function weighted(weight: number, values: string[]): { value: string; weight: number }[] {
  return values.map((value) => ({ value, weight }));
}

function containsPhrase(text: string, phrase: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }
  return text.includes(phrase);
}

export function scoreEventCategories(text: string): CategoryScore[] {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
  return RULES.map((rule) => ({
    category: rule.category,
    score: rule.phrases.reduce((sum, phrase) => sum + (containsPhrase(normalized, phrase.value) ? phrase.weight : 0), 0),
  })).sort((a, b) => b.score - a.score);
}

export function detectEventCategory(text: string): EventCategory {
  const [best, second] = scoreEventCategories(text);
  if (!best || best.score < 3) return 'Other';
  if (second && second.score === best.score) return 'Other';
  return best.category;
}
