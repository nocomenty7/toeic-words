/**
 * 토익 Part 5 오답노트 초기 데이터
 */
window.DEFAULT_PART5 = [
  {
    id: 'p5_test2_115',
    testName: 'Test 2',
    number: '115',
    category: '어휘 · 부사',
    question: 'Conradia Computers ___ changed the direction of its marketing strategy last week.',
    choices: {
      A: 'thickly',
      B: 'abruptly',
      C: 'formerly',
      D: 'frequently'
    },
    answer: 'B',
    translation: 'Conradia Computers는 지난주에 마케팅 전략의 방향을 갑자기 바꾸었다.',
    keyPoint: 'last week(단발성 과거 시점) + 방향을 바꿨다 → abruptly(갑자기)',
    explanation:
      '문장 끝에 "last week(지난주에)"라는 단발성 과거 시점이 나옵니다. 마케팅 전략의 방향을 바꾼 것은 지난주에 일어난 한 번의 사건이므로, 반복을 뜻하는 frequently(자주)나 과거의 상태·직함을 뜻하는 formerly(이전에)는 어색합니다. 문맥상 "지난주에 방향을 갑자기(돌연) 바꿨다"가 가장 자연스러우므로 (B) abruptly가 정답입니다.',
    choiceNotes: {
      A: '(부) 두껍게, 빽빽하게 — 물리적 두께 표현으로 문맥 부적합',
      B: '(부) 갑자기, 돌연 — 정답! 단발성 변화(changed)와 자연스럽게 어울림',
      C: '(부) 이전에 — 주로 과거 직함·명칭과 함께 사용 (예: formerly known as)',
      D: '(부) 자주, 빈번하게 — 단발성 과거 시점(last week)과 어울리지 않음'
    },
    status: 'wrong', // 'wrong' | 'review' | 'mastered'
    attempts: 0,
    correctCount: 0,
    createdAt: 1700000000000
  }
];
