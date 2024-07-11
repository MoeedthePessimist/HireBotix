import { OpenAI, OpenAIEmbeddings } from '@langchain/openai'
import env from '#start/env'

export const chatModel = new OpenAI({
  apiKey: env.get('OPENAI_API_KEY'),
})

export const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
})
