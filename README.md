# Ollama + MongoDB RAG Chat

Chat inteligente com arquitetura RAG (Retrieval-Augmented Generation) rodando 100% localmente com Next.js, Ollama e MongoDB Atlas Local (com busca vetorial).

## 🚀 Arquitetura & Tecnologias

- **Frontend & Backend**: Next.js 14 (App Router) + React + Vanilla CSS (Dark mode premium).
- **Orquestração RAG**: LangChain (`@langchain/community`, `@langchain/mongodb`, `@langchain/core`).
- **Embeddings & LLM**: Ollama local (`nomic-embed-text` para embeddings e `llama3` para chat).
- **Banco Vetorial**: MongoDB Atlas Local em container Docker com suporte a índices vetoriais.
- **Parsing**: `pdf-parse` para extração de texto de documentos PDF por matéria.

## 📋 Pré-requisitos

1. **Docker Desktop** (ou OrbStack) instalado e rodando.
2. **Ollama** instalado na máquina.
   - Puxe os modelos necessários:
     ```bash
     ollama pull llama3
     ollama pull nomic-embed-text
     ```
3. **Node.js** (v18+) e **npm** / **yarn** / **pnpm**.

## 🛠️ Como Executar

### 1. Iniciar o MongoDB Local
```bash
docker compose up -d
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Executar o servidor de desenvolvimento
```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador.
