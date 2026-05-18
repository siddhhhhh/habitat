import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { RealtimeProvider } from '@/contexts/RealtimeContext'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Habitat Society Management',
  description: 'Complete society management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <RealtimeProvider>
            {children}
            <Toaster position="top-right" />
          </RealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
