import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getSession, isLocalMode } from '@/auth'
import './globals.css'

export const metadata: Metadata = {
  title: 'FreshStart',
  description: 'One habit engine, many life domains. Build habits that hold.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'FreshStart' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays available. Locking it out is an accessibility regression, and
  // nothing in this layout breaks when the user scales it.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#231f1c' },
  ],
}

const NAV = [
  { href: '/', label: 'Today', icon: '◎' },
  { href: '/reclaim', label: 'Reclaim', icon: '⌫' },
  { href: '/insights', label: 'You', icon: '◔' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <html lang="en">
      <body>
        {isLocalMode() ? (
          <p className="bg-accent-soft text-ink-soft px-4 py-1.5 text-center text-[0.7rem] leading-tight">
            Local mode — data lives in this server process and no credentials are configured.
          </p>
        ) : null}

        <main className="mx-auto w-full max-w-xl px-4 pt-5">{children}</main>

        {session ? (
          <nav
            aria-label="Main"
            className="border-line bg-paper-raised/95 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <ul className="mx-auto flex max-w-xl">
              {NAV.map((item) => (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    className="tap text-ink-soft hover:text-ink flex flex-col items-center justify-center gap-0.5 py-2.5 text-[0.7rem]"
                  >
                    <span aria-hidden className="text-lg leading-none">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </body>
    </html>
  )
}
