# Android window appearance

The shared appearance controller remains the only source of the effective theme.
This optional module applies that theme and its surface token to the native window
and navigation bar, including Activity foreground transitions and existing React
Native modal windows. Drawers refresh the native window after they are shown. It does not persist
settings or force an Activity restart. Older shells keep their existing behavior.
