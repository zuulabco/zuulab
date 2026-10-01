import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  serverExternalPackages: ['firebase-admin'],
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://www.paytr.com https://*.paytr.com https://*.iyzipay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://images.unsplash.com https://*.paytr.com",
      "connect-src 'self' https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.google.com https://*.googleapis.com https://apis.google.com https://api.cloudinary.com https://www.paytr.com https://*.paytr.com https://sandbox-api.iyzipay.com https://api.iyzipay.com https://efatura.uyumsoft.com.tr https://efatura-test.uyumsoft.com.tr https://api.resend.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.paytr.com https://*.paytr.com https://sandbox-api.iyzipay.com https://api.iyzipay.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://www.paytr.com https://*.paytr.com",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

export default nextConfig;
