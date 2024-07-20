import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama'
import { ChatOllama } from '@langchain/community/chat_models/ollama'

// import env from '#start/env'

export const chatModel = new ChatOllama({
  baseUrl: 'http://localhost:11434',
  model: 'llama3',
})

export const embeddings = new OllamaEmbeddings({
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
})
