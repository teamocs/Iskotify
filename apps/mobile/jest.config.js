module.exports = {
  projects: [
    {
      displayName: 'db',
      testMatch: ['<rootDir>/db/**/__tests__/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '\\.[jt]sx?$': [
          'babel-jest',
          {
            caller: { name: 'metro', bundler: 'metro', platform: 'ios' },
            configFile: './babel.config.js',
          },
        ],
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@nozbe/watermelondb))',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
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
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-svg|@nozbe/watermelondb|@lineiconshq)',
      ],
      setupFiles: ['./jest.setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
  ],
};
