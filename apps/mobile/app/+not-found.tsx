import { router, type Href } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { FileQuestionOutlined } from '@lineiconshq/free-icons'
import { Screen } from '../components/ui/Screen'
import { EmptyState } from '../components/ui/EmptyState'
import { useTheme } from '../theme/ThemeContext'

/** Any address the app does not have. Vercel serves it as 404.html. */
export default function NotFoundScreen() {
  const { theme: t } = useTheme()
  return (
    <Screen>
      <EmptyState
        icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.accentText} />}
        title="We couldn't find that page"
        body="The link may be old or mistyped."
        actionLabel="Go to Today"
        onAction={() => router.replace('/' as Href)}
      />
    </Screen>
  )
}
