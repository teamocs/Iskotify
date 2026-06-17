module.exports = {
  projects: [
    {
      displayName: 'services',
      testMatch: [
        '<rootDir>/services/**/__tests__/**/*.test.ts',
        '<rootDir>/db/web/**/__tests__/**/*.test.ts',
      ],
      testEnvironment: 'node',
      globalSetup: '<rootDir>/jest.services.setup.js',
      transform: {
        '\\.[jt]sx?$': [
          'babel-jest',
          {
            configFile: './babel.config.js',
          },
        ],
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@supabase|expo|drizzle-orm|sql\\.js))',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^expo-sqlite$': '<rootDir>/__mocks__/expoSqliteMock.js',
        'expo-file-system/legacy': '<rootDir>/__mocks__/expoFileSystemLegacyMock.js',
        '^expo-web-browser$': '<rootDir>/__mocks__/expoWebBrowserMock.js',
        '^expo-linking$': '<rootDir>/__mocks__/expoLinkingMock.js',
        '^react-native$': '<rootDir>/__mocks__/reactNativeMock.js',
        '^expo-secure-store$': '<rootDir>/__mocks__/expoSecureStoreMock.js',
      },
    },
    {
      displayName: 'mobile',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/**/__tests__/**/*.test.{ts,tsx}'],
      testPathIgnorePatterns: ['<rootDir>/services/', '<rootDir>/db/web/'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-svg|@lineiconshq)',
      ],
      setupFiles: ['./jest.setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '\\.svg$': '<rootDir>/__mocks__/svgMock.js',
        '^lottie-react-native$': '<rootDir>/__mocks__/lottieMock.js',
        'theme/ThemeContext': '<rootDir>/__mocks__/themeContextMock.js',
        '^expo-secure-store$': '<rootDir>/__mocks__/expoSecureStoreMock.js',
      },
    },
  ],
};
