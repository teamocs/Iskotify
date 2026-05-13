module.exports = {
  projects: [
    {
      displayName: 'services',
      testMatch: ['<rootDir>/services/**/__tests__/**/*.test.ts'],
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
        'node_modules/(?!(@supabase))',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
    {
      displayName: 'mobile',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/**/__tests__/**/*.test.{ts,tsx}'],
      testPathIgnorePatterns: ['<rootDir>/db/', '<rootDir>/services/'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-svg|@lineiconshq)',
      ],
      setupFiles: ['./jest.setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
  ],
};
