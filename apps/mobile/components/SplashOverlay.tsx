import { View, Text, ActivityIndicator, Image } from 'react-native'
import { SvgUri } from 'react-native-svg'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO_MODULE = require('../assets/images/logo.svg') as number

function getLogoUri(): string | null {
  try {
    return Image.resolveAssetSource(LOGO_MODULE).uri ?? null
  } catch {
    return null
  }
}

export function SplashOverlay() {
  const logoUri = getLogoUri()

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1a1a2e',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      {/* Logo */}
      <View style={{ borderRadius: 32, overflow: 'hidden', width: 160, height: 160 }}>
        {logoUri ? (
          <SvgUri uri={logoUri} width={160} height={160} />
        ) : (
          <View style={{ width: 160, height: 160, backgroundColor: '#831626' }} />
        )}
      </View>

      {/* Wordmark */}
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text
          style={{
            fontFamily: 'Outfit_700Bold',
            fontSize: 32,
            color: '#ffffff',
            letterSpacing: 0.5,
          }}
        >
          Iskotify
        </Text>
        <Text
          style={{
            fontFamily: 'Lexend_400Regular',
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: 0.2,
          }}
        >
          Your Philippine Scholarship Companion
        </Text>
      </View>

      {/* Loading indicator */}
      <ActivityIndicator
        color="rgba(252,165,165,0.7)"
        size="small"
        style={{ marginTop: 8 }}
      />
    </View>
  )
}
