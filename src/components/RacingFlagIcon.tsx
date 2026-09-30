import { useId } from 'react'

export function RacingFlagIcon({ size = 28 }: { size?: number }) {
  const pattern = `checker-${useId().replace(/:/g, '')}`

  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={pattern} width="9" height="9" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill="#fff" />
          <rect width="4.5" height="4.5" fill="#111418" />
          <rect x="4.5" y="4.5" width="4.5" height="4.5" fill="#111418" />
        </pattern>
      </defs>
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(36 0) scale(${side} 1) translate(-36 0) rotate(22 36 40)`}>
          <rect x="34.6" y="7" width="2.8" height="59" rx="1.4" fill="#fff" />
          <circle cx="36" cy="6" r="2.6" fill="#fff" />
          <path
            d="M37.4 8 C 43 4.5, 49 11, 58 7 L 58 25 C 49 29, 43 22.5, 37.4 26 Z"
            fill={`url(#${pattern})`}
            stroke="#fff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  )
}
