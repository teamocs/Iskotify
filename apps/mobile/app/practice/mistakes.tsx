import UpcatExam from './upcat/[subtest]'

// P4 Mistakes mode: retry up to 20 UPCAT questions the student got wrong and
// hasn't answered correctly since (utils/mistakes, services/questionHistory).
// Runs on the UPCAT runner, so resume, the timer, review and the free daily
// practice cap all behave exactly as in a quick subtest drill.
export default function MistakesScreen() {
  return <UpcatExam variant="mistakes" />
}
