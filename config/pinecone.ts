import { Pinecone } from '@pinecone-database/pinecone'
import env from '#start/env'

export const pc = new Pinecone({
  apiKey: env.get('PINECONE_API_KEY'),
})
