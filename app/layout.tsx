import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RAG Chat - Ollama & MongoDB',
  description: 'Chat inteligente usando RAG com Ollama e MongoDB Vetorial Local',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
