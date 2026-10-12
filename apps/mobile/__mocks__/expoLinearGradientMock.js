// expo-linear-gradient is a native view. Tests get a host element with its props.
const React = require('react')

const LinearGradient = React.forwardRef((props, ref) => React.createElement('ExpoLinearGradient', { ...props, ref }))
LinearGradient.displayName = 'LinearGradient'

module.exports = { LinearGradient }
