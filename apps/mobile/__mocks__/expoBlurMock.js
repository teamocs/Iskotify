// expo-blur renders native blur views. Tests get host elements (props intact)
// so the <Glass> tier matrix can assert tint, blurMethod and blurTarget.
const React = require('react')
const { View } = require('react-native')

const BlurView = React.forwardRef((props, ref) => React.createElement('ExpoBlurView', { ...props, ref }))
BlurView.displayName = 'BlurView'
const BlurTargetView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }))
BlurTargetView.displayName = 'BlurTargetView'

module.exports = { BlurView, BlurTargetView }
