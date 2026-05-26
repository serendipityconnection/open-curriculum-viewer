import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Open Curriculum Viewer',
  description: 'Open Curriculum Viewer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased flex flex-col">
        <div className="flex-1">{children}</div>

        {/*
          ATTRIBUTION REQUIRED — this footer must be preserved in all copies and
          distributions of this software. See NOTICE for the full requirement.
        */}
        <footer className="border-t border-gray-800 bg-gray-950 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
          <span>
            Open Curriculum Viewer &mdash; founded by{' '}
            <a
              href="https://www.serendipityconnection.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
            >
              Serendipity Connection
            </a>
          </span>
          <span className="text-gray-700">
            Curriculum content licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-500 underline underline-offset-2 transition-colors"
            >
              CC BY-SA 4.0
            </a>
          </span>
        </footer>
      </body>
    </html>
  );
}
