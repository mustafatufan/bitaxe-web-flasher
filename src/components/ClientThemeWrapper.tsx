"use client"

import { ThemeProvider } from 'next-themes'

export function ClientThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={true}>
      {children}
    </ThemeProvider>
  )
}