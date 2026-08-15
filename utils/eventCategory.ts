import type { EventCategory } from '@/types/event';

type WeightedRule = { category: EventCategory; phrases: { value: string; weight: number }[] };
const weighted = (weight: number, values: string[]) => values.map((value) => ({ value, weight }));

const RULES: WeightedRule[] = [
  { category: 'Important', phrases: [...weighted(20, ['ด่วนมาก', 'สำคัญมาก', 'urgent', 'critical', 'ด่วน']), ...weighted(10, ['สำคัญ', 'กำหนดส่ง', 'deadline']), ...weighted(5, ['asap', 'ห้ามลืม', 'must do'])] },
  { category: 'Exam', phrases: [...weighted(8, ['สอบกลางภาค', 'สอบปลายภาค', 'final exam']), ...weighted(6, ['ข้อสอบ', 'สอบ', 'midterm', 'quiz', 'exam']), ...weighted(3, ['test', 'เตรียมสอบ', 'ทบทวนก่อนสอบ'])] },
  { category: 'Assignment', phrases: [...weighted(8, ['ส่งการบ้าน', 'ส่งงาน', 'ส่งโปรเจกต์', 'submit assignment', 'submit project']), ...weighted(5, ['การบ้าน', 'assignment', 'homework', 'coursework']), ...weighted(3, ['project deadline', 'report due', 'รายงาน'])] },
  { category: 'Meeting', phrases: [...weighted(8, ['นัดประชุม', 'ประชุมโปรเจกต์', 'project meeting']), ...weighted(6, ['ประชุม', 'มีทติ้ง', 'คุยงาน', 'team sync', 'conference']), ...weighted(4, ['meeting', 'standup', 'briefing', 'zoom call', 'teams call']), ...weighted(2, ['presentation', 'สัมมนา'])] },
  { category: 'Health', phrases: [...weighted(9, ['ตรวจสุขภาพ', 'ไปหาหมอ', 'นัดหมอ', 'doctor appointment']), ...weighted(6, ['โรงพยาบาล', 'คลินิก', 'ทันตแพทย์', 'หาหมอ', 'hospital', 'dentist']), ...weighted(4, ['หมอ', 'ยา', 'doctor', 'clinic', 'medical', 'วัคซีน', 'vaccine'])] },
  { category: 'Appointment', phrases: [...weighted(7, ['นัดหมาย', 'นัดพบ', 'appointment']), ...weighted(4, ['reservation', 'booking', 'จองคิว'])] },
  { category: 'Birthday', phrases: [...weighted(9, ['วันเกิด', 'birthday']), ...weighted(6, ['งานวันเกิด', 'birthday party']), ...weighted(4, ['anniversary', 'ครบรอบ'])] },
  { category: 'Exercise', phrases: [...weighted(7, ['ออกกำลังกาย', 'เข้ายิม']), ...weighted(5, ['ฟิตเนส', 'ยิม', 'วิ่ง', 'ฟุตบอล', 'ปิงปอง', 'gym', 'workout']), ...weighted(3, ['training', 'run', 'โยคะ', 'swimming'])] },
  { category: 'Travel', phrases: [...weighted(8, ['ขึ้นเครื่อง', 'เดินทางไป', 'สนามบิน']), ...weighted(6, ['เครื่องบิน', 'เที่ยวบิน', 'flight', 'airport', 'เที่ยว']), ...weighted(4, ['เดินทาง', 'travel', 'trip', 'ทริป', 'โรงแรม'])] },
  { category: 'Study', phrases: [...weighted(7, ['อ่านหนังสือ', 'เข้าเรียน', 'ติวสอบ']), ...weighted(5, ['เรียน', 'ติว', 'วิชา', 'study', 'lecture']), ...weighted(3, ['class', 'lesson', 'research', 'ทบทวนบทเรียน'])] },
  { category: 'School', phrases: [...weighted(6, ['โรงเรียน', 'มหาวิทยาลัย', 'school', 'university']), ...weighted(3, ['campus', 'อาจารย์', 'teacher'])] },
  { category: 'Work', phrases: [...weighted(7, ['ลูกค้า', 'client', 'ส่งให้ลูกค้า']), ...weighted(5, ['ออฟฟิศ', 'สำนักงาน', 'office', 'งานบริษัท']), ...weighted(3, ['work', 'ทำงาน', 'หัวหน้า']), ...weighted(1, ['งาน'])] },
  { category: 'Social', phrases: [...weighted(7, ['งานเลี้ยง', 'ปาร์ตี้', 'party']), ...weighted(5, ['กินข้าวกับเพื่อน', 'เจอเพื่อน', 'hangout']), ...weighted(3, ['เพื่อน', 'friends', 'dinner'])] },
  { category: 'Personal', phrases: [...weighted(6, ['ธุระส่วนตัว', 'นัดครอบครัว']), ...weighted(4, ['ส่วนตัว', 'ครอบครัว', 'ซื้อของ', 'personal', 'family', 'shopping']), ...weighted(3, ['จ่ายบิล', 'bill payment'])] },
];

function containsPhrase(text: string, phrase: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }
  return text.includes(phrase);
}

export function detectEventCategory(text: string): EventCategory {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
  const scores = RULES.map((rule) => ({
    category: rule.category,
    score: rule.phrases.reduce((sum, phrase) => sum + (containsPhrase(normalized, phrase.value) ? phrase.weight : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score < 3 || second?.score === best.score) return 'Other';
  return best.category;
}
