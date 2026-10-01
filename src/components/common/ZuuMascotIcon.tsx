import React from 'react'

interface ZuuMascotIconProps {
  size?: number
  className?: string
}

export default function ZuuMascotIcon({ size = 34, className }: ZuuMascotIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="16" cy="14" r="5" />
      <circle cx="32" cy="14" r="5" />
      <circle cx="24" cy="26" r="14" />
      <circle cx="20" cy="24" r="1.5" fill="currentColor" />
      <circle cx="28" cy="24" r="1.5" fill="currentColor" />
      <path d="M22 28.5c1 .8 3 .8 4 0" />
      <path d="M24 26v1.5" />
    </svg>
  )
}
