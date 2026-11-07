/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * Jest configuration for sandboxed testing.
 * All tests run in isolation with stand-in transports; nothing reaches Airthings.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
    // hap-nodejs 2.3+ ships ESM only. Jest can load ESM from CommonJS tests
    // natively only on Node 24.9+, so compile it to CommonJS for Node 22.
    '/node_modules/@homebridge/hap-nodejs/.+\\.js$': ['babel-jest', {
      babelrc: false,
      configFile: false,
      plugins: [
        'babel-plugin-transform-import-meta',
        '@babel/plugin-transform-export-namespace-from',
        '@babel/plugin-transform-modules-commonjs',
      ],
    }],
  },

  transformIgnorePatterns: ['/node_modules/(?!@homebridge/hap-nodejs/)'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/devices/host.ts',
    '!src/devices/index.ts',
    '!src/types/index.ts',
    '!src/utils/index.ts',
  ],

  testMatch: [
    '**/tests/unit/**/*.test.ts',
  ],

  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],

  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  testTimeout: 10_000,
  verbose: true,
}
