export interface PreAssessQuestion {
  id: string
  subject: 'Mathematics' | 'Science' | 'English' | 'Abstract Reasoning' | 'Filipino'
  stem: string
  options: string[]    // 4 options, no letter prefix
  answerIndex: number  // 0–3
  explanation: string
}

export const PRE_ASSESS_QUESTIONS: PreAssessQuestion[] = [
  // ── Mathematics (5) ──────────────────────────────────────────────────────────
  {
    id: 'pre-math-1', subject: 'Mathematics',
    stem: 'If 2x + 5 = 13, what is the value of x?',
    options: ['2', '3', '4', '5'], answerIndex: 2,
    explanation: '2x = 13 − 5 = 8, so x = 4.',
  },
  {
    id: 'pre-math-2', subject: 'Mathematics',
    stem: 'What is 15% of 80?',
    options: ['10', '12', '15', '20'], answerIndex: 1,
    explanation: '15% × 80 = 0.15 × 80 = 12.',
  },
  {
    id: 'pre-math-3', subject: 'Mathematics',
    stem: 'A train travels at 60 km/h for 2.5 hours. How far does it travel?',
    options: ['120 km', '140 km', '150 km', '160 km'], answerIndex: 2,
    explanation: 'Distance = speed × time = 60 × 2.5 = 150 km.',
  },
  {
    id: 'pre-math-4', subject: 'Mathematics',
    stem: 'What is the area of a circle with radius 7? (Use π ≈ 3.14)',
    options: ['43.96', '153.86', '200.96', '21.98'], answerIndex: 1,
    explanation: 'Area = π r² = 3.14 × 7² = 3.14 × 49 = 153.86.',
  },
  {
    id: 'pre-math-5', subject: 'Mathematics',
    stem: 'What is 2³ × 2⁴?',
    options: ['14', '49', '128', '4096'], answerIndex: 2,
    explanation: '2³ × 2⁴ = 2⁷ = 128.',
  },
  // ── Science (5) ──────────────────────────────────────────────────────────────
  {
    id: 'pre-sci-1', subject: 'Science',
    stem: 'Which organelle is known as the "powerhouse of the cell"?',
    options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], answerIndex: 2,
    explanation: 'Mitochondria produce ATP, the cell\'s primary energy currency.',
  },
  {
    id: 'pre-sci-2', subject: 'Science',
    stem: 'What is the chemical formula of water?',
    options: ['CO₂', 'H₂O', 'NaCl', 'O₂'], answerIndex: 1,
    explanation: 'Water is made of two hydrogen atoms bonded to one oxygen atom: H₂O.',
  },
  {
    id: 'pre-sci-3', subject: 'Science',
    stem: "Which statement best describes Newton's First Law of Motion?",
    options: [
      'F = ma',
      'Every action has an equal and opposite reaction',
      'An object at rest stays at rest unless acted on by an external force',
      'Energy cannot be created or destroyed',
    ],
    answerIndex: 2,
    explanation: 'Newton\'s First Law (Law of Inertia): objects maintain their state unless a net force acts on them.',
  },
  {
    id: 'pre-sci-4', subject: 'Science',
    stem: 'How many electrons does a neutral carbon atom have?',
    options: ['4', '6', '8', '12'], answerIndex: 1,
    explanation: 'Carbon has atomic number 6; a neutral atom has 6 protons and 6 electrons.',
  },
  {
    id: 'pre-sci-5', subject: 'Science',
    stem: 'What is the outermost layer of the Earth called?',
    options: ['Mantle', 'Outer core', 'Crust', 'Inner core'], answerIndex: 2,
    explanation: 'The crust is Earth\'s outermost solid layer, ranging 5–70 km thick.',
  },
  // ── English (5) ──────────────────────────────────────────────────────────────
  {
    id: 'pre-eng-1', subject: 'English',
    stem: 'Which sentence is grammatically correct?',
    options: [
      'Him and I went to school.',
      'He and I went to school.',
      'He and me went to school.',
      'Him and me went to school.',
    ],
    answerIndex: 1,
    explanation: '"He and I" are subject pronouns and correct as the sentence\'s subject.',
  },
  {
    id: 'pre-eng-2', subject: 'English',
    stem: 'What does the word "benevolent" mean?',
    options: ['Malicious', 'Strict', 'Generous and kind', 'Indifferent'], answerIndex: 2,
    explanation: 'Benevolent means well-meaning and kindly disposed toward others.',
  },
  {
    id: 'pre-eng-3', subject: 'English',
    stem: 'The word "ephemeral" most nearly means:',
    options: ['Eternal', 'Lasting only a short time', 'Extremely large', 'Difficult to understand'],
    answerIndex: 1,
    explanation: 'Ephemeral describes something that lasts for a very short time.',
  },
  {
    id: 'pre-eng-4', subject: 'English',
    stem: 'Choose the correct verb: "Neither of the students ___ ready."',
    options: ['were', 'are', 'was', 'have been'], answerIndex: 2,
    explanation: '"Neither" is singular, so "was" is the correct verb form.',
  },
  {
    id: 'pre-eng-5', subject: 'English',
    stem: 'In "Life is a journey," what literary device is used?',
    options: ['Simile', 'Alliteration', 'Personification', 'Metaphor'], answerIndex: 3,
    explanation: 'A metaphor directly compares two unlike things without "like" or "as".',
  },
  // ── Abstract Reasoning (3) ───────────────────────────────────────────────────
  {
    id: 'pre-abs-1', subject: 'Abstract Reasoning',
    stem: 'What number comes next: 2, 4, 8, 16, ___?',
    options: ['24', '28', '32', '36'], answerIndex: 2,
    explanation: 'Each number doubles: ×2 each step → 32.',
  },
  {
    id: 'pre-abs-2', subject: 'Abstract Reasoning',
    stem: 'What is the next number: 1, 4, 9, 16, ___?',
    options: ['20', '24', '25', '30'], answerIndex: 2,
    explanation: 'These are perfect squares: 1², 2², 3², 4², 5² = 25.',
  },
  {
    id: 'pre-abs-3', subject: 'Abstract Reasoning',
    stem: 'Complete the analogy: Hot is to Cold as Day is to ___.',
    options: ['Sun', 'Morning', 'Night', 'Noon'], answerIndex: 2,
    explanation: 'Hot/Cold are opposites; Day/Night are opposites.',
  },
  // ── Filipino (2) ─────────────────────────────────────────────────────────────
  {
    id: 'pre-fil-1', subject: 'Filipino',
    stem: 'Ano ang tamang baybay ng salitang nagpapahiwatig ng magandang hitsura?',
    options: ['Maganda', 'Mganda', 'Magandah', 'Maaganda'], answerIndex: 0,
    explanation: '"Maganda" ang tamang baybay na nagpapahiwatig ng kagandahan.',
  },
  {
    id: 'pre-fil-2', subject: 'Filipino',
    stem: 'Ano ang kahulugan ng salitang "maunawain"?',
    options: ['Mahigpit', 'Mapag-unawa at matiyaga', 'Tamad', 'Matapang'], answerIndex: 1,
    explanation: 'Ang "maunawain" ay nangangahulugang marunong umunawa at magpasensya.',
  },
]
