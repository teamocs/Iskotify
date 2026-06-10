// Minimal react-native mock for the services (node) jest project.
// Only stubs the parts actually used in services/: Platform.OS.
module.exports = {
  Platform: {
    OS: 'ios', // default to native so existing tests are unchanged
    select: (spec) => spec['ios'] ?? spec['default'],
  },
}
