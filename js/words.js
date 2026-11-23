/**
 * 기본 단어장 데이터 (토익 필수 암기 45)
 * - meaning: 사용자가 입력한 한글 뜻 그대로 유지
 * - pos: 품사 (객관식 오답 보기 구성 및 학습 보조)
 * - phonetic: 발음 기호
 * - example / exampleKo: 토익 빈출 문맥 예문 (선택적 힌트)
 * - tip: 어원·연상 암기 팁
 */
window.DEFAULT_DECK = {
  id: 'toeic-45-default',
  name: '토익 필수 암기 45',
  createdAt: 1700000000000,
  words: [
    {
      id: 'w01',
      word: 'affiliation',
      meaning: '제휴, 소속기관',
      pos: '명사',
      phonetic: '/əˌfɪliˈeɪʃən/',
      example: 'The clinic has a close affiliation with the university hospital.',
      exampleKo: '그 병원은 대학 병원과 긴밀한 제휴 관계를 맺고 있다.',
      tip: 'af-(~로) + fili(아들/가족) → 가족처럼 한 소속으로 맺어짐'
    },
    {
      id: 'w02',
      word: 'appraisal',
      meaning: '평가',
      pos: '명사',
      phonetic: '/əˈpreɪzəl/',
      example: 'Annual performance appraisals will be conducted next week.',
      exampleKo: '연간 성과 평가가 다음 주에 실시될 예정이다.',
      tip: 'ap-(~에) + prais(가치/가격, price) → 가치를 매겨 평가함'
    },
    {
      id: 'w03',
      word: 'consent',
      meaning: '동의, 동의하다',
      pos: '명사/동사',
      phonetic: '/kənˈsent/',
      example: 'Written consent from a manager is required before travel.',
      exampleKo: '출장 전 관리자의 서면 동의가 필요하다.',
      tip: 'con-(함께) + sent(느끼다, sense) → 뜻을 함께하여 동의하다'
    },
    {
      id: 'w04',
      word: 'distraction',
      meaning: '주의산만, 방해물',
      pos: '명사',
      phonetic: '/dɪˈstrækʃən/',
      example: 'Please silence your phone to avoid distractions during the meeting.',
      exampleKo: '회의 중 방해가 되지 않도록 휴대폰을 무음으로 해주세요.',
      tip: 'dis-(떨어져) + tract(끌다) → 주의력을 딴 데로 끌어당김'
    },
    {
      id: 'w05',
      word: 'fluctuation',
      meaning: '변동, 불안정',
      pos: '명사',
      phonetic: '/ˌflʌktʃuˈeɪʃən/',
      example: 'Oil prices experienced sharp fluctuations this quarter.',
      exampleKo: '이번 분기 유가는 급격한 변동을 겪었다.',
      tip: 'fluct(물결, flow) → 파도처럼 오르락내리락 변동함'
    },
    {
      id: 'w06',
      word: 'fraction',
      meaning: '일부',
      pos: '명사',
      phonetic: '/ˈfrækʃən/',
      example: 'The new software costs a fraction of the old system.',
      exampleKo: '새 소프트웨어는 기존 시스템 비용의 일부에 불과하다.',
      tip: 'fract(깨다, fracture) → 깨져서 나뉜 작은 조각·일부'
    },
    {
      id: 'w07',
      word: 'implication',
      meaning: '암시, 함축, 영향',
      pos: '명사',
      phonetic: '/ˌɪmplɪˈkeɪʃən/',
      example: 'We must consider the financial implications of this merger.',
      exampleKo: '우리는 이번 합병의 재정적 영향을 고려해야 한다.',
      tip: 'im-(안에) + plic(접다) → 속에 접어 숨겨둔 암시·파급 영향'
    },
    {
      id: 'w08',
      word: 'initiative',
      meaning: '계획, 처음의',
      pos: '명사/형용사',
      phonetic: '/ɪˈnɪʃətɪv/',
      example: 'The company launched a green energy initiative.',
      exampleKo: '회사는 친환경 에너지 계획을 출범시켰다.',
      tip: 'init(시작, initial) → 주도적으로 처음 시작하는 계획'
    },
    {
      id: 'w09',
      word: 'measure',
      meaning: '조치, 수단, 측정하다',
      pos: '명사/동사',
      phonetic: '/ˈmeʒər/',
      example: 'Strict safety measures have been implemented at the plant.',
      exampleKo: '공장에 엄격한 안전 조치가 시행되었다.',
      tip: '토익 빈출: take measures (조치를 취하다)'
    },
    {
      id: 'w10',
      word: 'abundant',
      meaning: '풍부한',
      pos: '형용사',
      phonetic: '/əˈbʌndənt/',
      example: 'The region has abundant natural resources.',
      exampleKo: '그 지역은 풍부한 천연자원을 가지고 있다.',
      tip: 'ab-(넘쳐) + und(물결) → 물결이 넘쳐흐를 만큼 풍부한'
    },
    {
      id: 'w11',
      word: 'accomplished',
      meaning: '뛰어난',
      pos: '형용사',
      phonetic: '/əˈkɑːmplɪʃt/',
      example: 'She is an accomplished violinist and composer.',
      exampleKo: '그녀는 뛰어난 바이올리니스트이자 작곡가이다.',
      tip: 'accomplish(성취하다) + -ed → 많은 것을 성취해낸 뛰어난'
    },
    {
      id: 'w12',
      word: 'affordable',
      meaning: '알맞은',
      pos: '형용사',
      phonetic: '/əˈfɔːrdəbəl/',
      example: 'Our goal is to offer high quality at an affordable price.',
      exampleKo: '우리의 목표는 알맞은 가격에 고품질을 제공하는 것이다.',
      tip: 'afford(감당하다) + -able → 가격을 감당할 수 있는, 알맞은'
    },
    {
      id: 'w13',
      word: 'compatible',
      meaning: '호환이되는',
      pos: '형용사',
      phonetic: '/kəmˈpætəbəl/',
      example: 'This charger is compatible with all recent models.',
      exampleKo: '이 충전기는 모든 최신 모델과 호환이 된다.',
      tip: 'com-(함께) + pat(견디다/어울리다) → 서로 잘 맞고 호환이되는'
    },
    {
      id: 'w14',
      word: 'complimentary',
      meaning: '무료의, 칭찬의',
      pos: '형용사',
      phonetic: '/ˌkɑːmpləˈmentəri/',
      example: 'Hotel guests receive complimentary breakfast every morning.',
      exampleKo: '호텔 투숙객은 매일 아침 무료 조식을 제공받는다.',
      tip: 'i(아이 좋아! 공짜·칭찬) vs complementary(e: 보완적인)'
    },
    {
      id: 'w15',
      word: 'deliberate',
      meaning: '고의의, 신중한, 숙고하다',
      pos: '형용사/동사',
      phonetic: '/dɪˈlɪbərət/',
      example: 'The committee made a deliberate decision after hours of debate.',
      exampleKo: '위원회는 수 시간의 토론 끝에 신중한 결정을 내렸다.',
      tip: 'de-(완전히) + liber(저울질하다) → 저울질하듯 신중한·고의의'
    },
    {
      id: 'w16',
      word: 'due',
      meaning: '지불해야하는, 만기인, 적당한',
      pos: '형용사',
      phonetic: '/duː/',
      example: 'The final report is due by Friday at 5 p.m.',
      exampleKo: '최종 보고서는 금요일 오후 5시까지 마감(만기)이다.',
      tip: 'due date(마감일), payment is due(지불 기한이 된)'
    },
    {
      id: 'w17',
      word: 'exempt',
      meaning: '면제되는, 면제하다',
      pos: '형용사/동사',
      phonetic: '/ɪɡˈzempt/',
      example: 'Non-profit organizations are exempt from certain taxes.',
      exampleKo: '비영리 단체는 특정 세금이 면제된다.',
      tip: 'ex-(밖으로) + empt(꺼내다) → 의무에서 빼내어 면제하다 (exempt from)'
    },
    {
      id: 'w18',
      word: 'impending',
      meaning: '임박한',
      pos: '형용사',
      phonetic: '/ɪmˈpendɪŋ/',
      example: 'Staff were notified of the impending office relocation.',
      exampleKo: '직원들은 임박한 사무실 이전에 대해 통보받았다.',
      tip: 'im-(위에) + pend(매달리다) → 머리 위에 매달려 곧 떨어질 듯 임박한'
    },
    {
      id: 'w19',
      word: 'preliminary',
      meaning: '예비의',
      pos: '형용사',
      phonetic: '/prɪˈlɪməneri/',
      example: 'Preliminary results indicate a 15% increase in sales.',
      exampleKo: '예비 결과에 따르면 매출이 15% 증가했다.',
      tip: 'pre-(미리) + limin(문턱) → 문턱을 넘기 전 미리 하는 예비의'
    },
    {
      id: 'w20',
      word: 'promising',
      meaning: '전도유망한',
      pos: '형용사',
      phonetic: '/ˈprɑːmɪsɪŋ/',
      example: 'The startup has a very promising future in AI.',
      exampleKo: '그 스타트업은 AI 분야에서 매우 전도유망한 미래를 갖고 있다.',
      tip: 'promise(약속) + -ing → 성공을 약속하는 듯 전도유망한'
    },
    {
      id: 'w21',
      word: 'receptive',
      meaning: '수용하는',
      pos: '형용사',
      phonetic: '/rɪˈseptɪv/',
      example: 'Management was receptive to employee feedback.',
      exampleKo: '경영진은 직원들의 피드백을 기꺼이 수용했다.',
      tip: 'receive(받다)의 형용사형 → be receptive to (~을 잘 수용하는)'
    },
    {
      id: 'w22',
      word: 'reliable',
      meaning: '믿을만한',
      pos: '형용사',
      phonetic: '/rɪˈlaɪəbəl/',
      example: 'We need a reliable supplier for raw materials.',
      exampleKo: '우리는 원자재를 공급할 믿을만한 업체가 필요하다.',
      tip: 'rely(의지하다) + -able → 의지할 수 있는, 믿을만한'
    },
    {
      id: 'w23',
      word: 'restricted',
      meaning: '제한된',
      pos: '형용사',
      phonetic: '/rɪˈstrɪktɪd/',
      example: 'Access to the laboratory is restricted to authorized personnel.',
      exampleKo: '실험실 출입은 인가된 직원으로 제한되어 있다.',
      tip: 're-(뒤로) + strict(꽉 묶다) → 꽉 묶여서 제한된'
    },
    {
      id: 'w24',
      word: 'rewarding',
      meaning: '가치가있는',
      pos: '형용사',
      phonetic: '/rɪˈwɔːrdɪŋ/',
      example: 'Mentoring new interns can be a very rewarding experience.',
      exampleKo: '신입 인턴을 멘토링하는 것은 매우 가치 있는 경험이 될 수 있다.',
      tip: 'reward(보상) + -ing → 보람과 보상이 따르는, 가치가있는'
    },
    {
      id: 'w25',
      word: 'rigorous',
      meaning: '엄격한, 가혹한',
      pos: '형용사',
      phonetic: '/ˈrɪɡərəs/',
      example: 'All products undergo rigorous quality testing.',
      exampleKo: '모든 제품은 엄격한 품질 테스트를 거친다.',
      tip: 'rig(뻣뻣한, rigid) → 융통성 없이 뻣뻣하고 엄격한'
    },
    {
      id: 'w26',
      word: 'significant',
      meaning: '상당한, 중요한',
      pos: '형용사',
      phonetic: '/sɪɡˈnɪfɪkənt/',
      example: 'There has been a significant improvement in customer satisfaction.',
      exampleKo: '고객 만족도에 상당한 개선이 있었다.',
      tip: 'sign(표시/의미) → 눈에 띄는 표시가 될 만큼 상당한·중요한'
    },
    {
      id: 'w27',
      word: 'alike',
      meaning: '마찬가지로, 비슷한',
      pos: '부사/형용사',
      phonetic: '/əˈlaɪk/',
      example: 'The event was enjoyed by locals and tourists alike.',
      exampleKo: '그 행사는 현지인과 관광객 모두에게 마찬가지로 즐거웠다.',
      tip: 'a- + like(같은) → A and B alike (A와 B 마찬가지로)'
    },
    {
      id: 'w28',
      word: 'altogether',
      meaning: '아주, 완전히',
      pos: '부사',
      phonetic: '/ˌɔːltəˈɡeðər/',
      example: 'The project was altogether different from what we expected.',
      exampleKo: '그 프로젝트는 우리가 예상한 것과 완전히 달랐다.',
      tip: 'all(전부) + together(합쳐) → 통틀어 아주, 완전히'
    },
    {
      id: 'w29',
      word: 'closely',
      meaning: '면밀히',
      pos: '부사',
      phonetic: '/ˈkloʊsli/',
      example: 'Inspectors closely examined the safety records.',
      exampleKo: '조사관들이 안전 기록을 면밀히 검토했다.',
      tip: 'close(가까이) + -ly → 가까이 바짝 들여다보듯 면밀히'
    },
    {
      id: 'w30',
      word: 'concisely',
      meaning: '간결하게',
      pos: '부사',
      phonetic: '/kənˈsaɪsli/',
      example: 'Please summarize your proposal as concisely as possible.',
      exampleKo: '제안서를 가능한 한 간결하게 요약해 주세요.',
      tip: 'con-(함께) + cis(자르다, scissors) → 군더더기를 잘라내 간결하게'
    },
    {
      id: 'w31',
      word: 'consecutively',
      meaning: '연속하여',
      pos: '부사',
      phonetic: '/kənˈsekjətɪvli/',
      example: 'The team won the award for three years consecutively.',
      exampleKo: '그 팀은 3년 연속하여 상을 수상했다.',
      tip: 'con-(함께) + secut(따르다, sequence) → 줄줄이 이어져 연속하여'
    },
    {
      id: 'w32',
      word: 'discreetly',
      meaning: '신중하게',
      pos: '부사',
      phonetic: '/dɪˈskriːtli/',
      example: 'The matter was handled discreetly to protect privacy.',
      exampleKo: '사생활 보호를 위해 그 사안은 신중하게 처리되었다.',
      tip: 'discreet(말조심하는/신중한) + -ly → 티 안 나게 조심스럽고 신중하게'
    },
    {
      id: 'w33',
      word: 'exclusively',
      meaning: '독점적으로',
      pos: '부사',
      phonetic: '/ɪkˈskluːsɪvli/',
      example: 'This lounge is exclusively for business-class passengers.',
      exampleKo: '이 라운지는 비즈니스석 승객 전용(독점적)이다.',
      tip: 'ex-(밖으로) + clus(닫다) → 남을 배제하고 독점적으로'
    },
    {
      id: 'w34',
      word: 'generously',
      meaning: '관대하게',
      pos: '부사',
      phonetic: '/ˈdʒenərəsli/',
      example: 'Local businesses generously donated to the charity.',
      exampleKo: '지역 기업들이 자선단체에 관대하게 기부했다.',
      tip: 'generous(후한, 관대한) + -ly → 아낌없이 관대하게'
    },
    {
      id: 'w35',
      word: 'inadvertently',
      meaning: '부주의하게',
      pos: '부사',
      phonetic: '/ˌɪnədˈvɜːrtəntli/',
      example: 'She inadvertently deleted the shared spreadsheet.',
      exampleKo: '그녀는 부주의하게 공유 스프레드시트를 삭제했다.',
      tip: 'in-(안) + advert(주의를 돌리다) → 주의를 안 기울여 부주의하게'
    },
    {
      id: 'w36',
      word: 'meticulously',
      meaning: '꼼꼼하게, 세심하게',
      pos: '부사',
      phonetic: '/məˈtɪkjələsli/',
      example: 'Every detail of the ceremony was meticulously planned.',
      exampleKo: '행사의 모든 세부 사항이 꼼꼼하게 계획되었다.',
      tip: 'meticulous(두려울 정도로 조심하는) → 실수 없게 꼼꼼하게, 세심하게'
    },
    {
      id: 'w37',
      word: 'necessarily',
      meaning: '반드시, 어쩔수없이',
      pos: '부사',
      phonetic: '/ˌnesəˈserəli/',
      example: 'A higher price does not necessarily mean better quality.',
      exampleKo: '더 높은 가격이 반드시 더 좋은 품질을 의미하지는 않는다.',
      tip: 'not necessarily (반드시 ~인 것은 아니다) 토익 초빈출!'
    },
    {
      id: 'w38',
      word: 'notably',
      meaning: '주목할만하게',
      pos: '부사',
      phonetic: '/ˈnoʊtəbli/',
      example: 'Sales grew notably in the Asian market this year.',
      exampleKo: '올해 아시아 시장에서 매출이 주목할만하게 성장했다.',
      tip: 'note(주목하다) + -ably → 눈에 띄고 주목할만하게'
    },
    {
      id: 'w39',
      word: 'primarily',
      meaning: '주로',
      pos: '부사',
      phonetic: '/praɪˈmerəli/',
      example: 'The software is designed primarily for small businesses.',
      exampleKo: '이 소프트웨어는 주로 소규모 기업을 위해 설계되었다.',
      tip: 'prime(첫째의, primary) + -ly → 첫째로, 주로'
    },
    {
      id: 'w40',
      word: 'reasonably',
      meaning: '합리적으로',
      pos: '부사',
      phonetic: '/ˈriːzənəbli/',
      example: 'The restaurant offers reasonably priced lunch specials.',
      exampleKo: '그 식당은 합리적으로 가격이 책정된 점심 특선을 제공한다.',
      tip: 'reason(이성/합리) + -ably → 이치에 맞게 합리적으로'
    },
    {
      id: 'w41',
      word: 'relatively',
      meaning: '상대적으로',
      pos: '부사',
      phonetic: '/ˈrelətɪvli/',
      example: 'The installation process is relatively simple.',
      exampleKo: '설치 과정은 상대적으로 간단하다.',
      tip: 'relate(비교·관련짓다) → 다른 것과 비교해 상대적으로'
    },
    {
      id: 'w42',
      word: 'shortly',
      meaning: '곧, 즉시',
      pos: '부사',
      phonetic: '/ˈʃɔːrtli/',
      example: 'The keynote speaker will arrive shortly.',
      exampleKo: '기조 연설자가 곧 도착할 예정이다.',
      tip: 'short(짧은 시간 안에) → 곧, 즉시 (shortly after: ~직후에)'
    },
    {
      id: 'w43',
      word: 'slightly',
      meaning: '약간, 조금',
      pos: '부사',
      phonetic: '/ˈslaɪtli/',
      example: 'The departure time has been slightly delayed.',
      exampleKo: '출발 시간이 약간 지연되었다.',
      tip: 'slight(미미한) + -ly → 아주 약간, 조금'
    },
    {
      id: 'w44',
      word: 'solely',
      meaning: '혼자서, 유일하게, 오직',
      pos: '부사',
      phonetic: '/ˈsoʊlli/',
      example: 'He is solely responsible for the marketing budget.',
      exampleKo: '그는 마케팅 예산에 대해 혼자서(전적으로) 책임진다.',
      tip: 'sole(단독의, solo) + -ly → 혼자서, 유일하게, 오직'
    },
    {
      id: 'w45',
      word: 'unanimously',
      meaning: '만장일치로',
      pos: '부사',
      phonetic: '/juːˈnænɪməsli/',
      example: 'The board unanimously approved the expansion plan.',
      exampleKo: '이사회는 확장 계획을 만장일치로 승인했다.',
      tip: 'un-(하나, uni) + anim(마음) → 모두가 한마음으로, 만장일치로'
    }
  ]
};
