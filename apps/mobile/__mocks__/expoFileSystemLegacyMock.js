module.exports = {
  documentDirectory: '/tmp/',
  readAsStringAsync: jest.fn().mockResolvedValue('{}'),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
}
