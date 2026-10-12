// expo-glass-effect needs the iOS 26 native view. Tests get a host element
// named ExpoGlassView (props intact) and availability checks that default to
// "no Liquid Glass", which tests flip per case.
const React = require('react')

const GlassView = React.forwardRef((props, ref) => React.createElement('ExpoGlassView', { ...props, ref }))
GlassView.displayName = 'GlassView'
const GlassContainer = React.forwardRef((props, ref) => React.createElement('ExpoGlassContainer', { ...props, ref }))
GlassContainer.displayName = 'GlassContainer'

module.exports = {
  GlassView,
  GlassContainer,
  isLiquidGlassAvailable: jest.fn(() => false),
  isGlassEffectAPIAvailable: jest.fn(() => false),
}
